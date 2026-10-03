//! `export_slides_pdf`: SlideDeck JSON -> Typst source (slide_writer.rs) ->
//! PDF bytes -> the user's chosen file. Typst source is generated only here,
//! from validated data; the WebView never supplies it.
use crate::slide_deck::{SlidePdfRequest, SUPPORTED_DECK_VERSION};
use crate::slide_writer::write_slide_deck;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use tauri_plugin_fs::FsExt;
use typst_as_lib::typst_kit_options::TypstKitFontOptions;
use typst_as_lib::TypstEngine;
use typst_layout::PagedDocument;
use typst_pdf::PdfOptions;

const MAX_REQUEST_JSON_BYTES: usize = 20 * 1024 * 1024;
const MAX_JSON_DEPTH: usize = 400;
const MAX_ASSET_COUNT: usize = 300;
const MAX_TOTAL_ASSET_BYTES: usize = 200 * 1024 * 1024;
const MAX_DIAGRAM_SVG_BYTES: usize = 5 * 1024 * 1024;
const COMPILER_THREAD_STACK_BYTES: usize = 32 * 1024 * 1024;

static NOTO_SANS_KR_REGULAR: &[u8] = include_bytes!("../assets/fonts/NotoSansKR-Regular.otf");
static NOTO_SANS_KR_BOLD: &[u8] = include_bytes!("../assets/fonts/NotoSansKR-Bold.otf");
static NOTO_SERIF_KR_REGULAR: &[u8] = include_bytes!("../assets/fonts/NotoSerifKR-Regular.otf");
static NOTO_SERIF_KR_BOLD: &[u8] = include_bytes!("../assets/fonts/NotoSerifKR-Bold.otf");

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExportError {
    pub code: &'static str,
    pub message: String,
}

impl ExportError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

/// Bounds parser stack use before serde sees the payload.
fn json_nesting_depth_exceeds(json: &str, max_depth: usize) -> bool {
    let (mut depth, mut in_string, mut escaped) = (0usize, false, false);
    for byte in json.bytes() {
        if in_string {
            match byte {
                _ if escaped => escaped = false,
                b'\\' => escaped = true,
                b'"' => in_string = false,
                _ => {}
            }
            continue;
        }
        match byte {
            b'"' => in_string = true,
            b'{' | b'[' => {
                depth += 1;
                if depth > max_depth {
                    return true;
                }
            }
            b'}' | b']' => depth = depth.saturating_sub(1),
            _ => {}
        }
    }
    false
}

fn parse_request(json: &str) -> Result<SlidePdfRequest, ExportError> {
    if json.len() > MAX_REQUEST_JSON_BYTES {
        return Err(ExportError::new(
            "request-too-large",
            "The slide deck is too large to export.",
        ));
    }
    if json_nesting_depth_exceeds(json, MAX_JSON_DEPTH) {
        return Err(ExportError::new(
            "request-too-deep",
            "The slide deck is nested too deeply to export.",
        ));
    }
    let request: SlidePdfRequest = serde_json::from_str(json)
        .map_err(|err| ExportError::new("invalid-request", format!("Invalid slide deck: {err}")))?;
    if request.deck.version != SUPPORTED_DECK_VERSION {
        return Err(ExportError::new(
            "unsupported-version",
            format!(
                "Slide deck version {} is not supported.",
                request.deck.version
            ),
        ));
    }
    if request.assets.len() + request.diagrams.len() > MAX_ASSET_COUNT {
        return Err(ExportError::new(
            "too-many-assets",
            "The slide deck references too many images.",
        ));
    }
    Ok(request)
}

/// A document-relative path with only normal components - no root, no `..`.
fn is_plain_relative(path: &str) -> bool {
    let path = Path::new(path);
    !path.as_os_str().is_empty() && path.components().all(|c| matches!(c, Component::Normal(_)))
}

/// Resolves `relative` under `root`, following symlinks, and refuses anything
/// that lands outside the canonical root.
fn resolve_within_root(root: &Path, relative: &str) -> Option<PathBuf> {
    if !is_plain_relative(relative) {
        return None;
    }
    let canonical_root = root.canonicalize().ok()?;
    let resolved = canonical_root.join(relative).canonicalize().ok()?;
    resolved.starts_with(&canonical_root).then_some(resolved)
}

type LoadedAssets = Vec<(String, Vec<u8>)>;

/// Missing or unreadable images are skipped - the writer renders a visible
/// placeholder. `root` must already be trusted (see `trusted_root`).
fn load_assets(
    root: Option<&Path>,
    request: &SlidePdfRequest,
) -> Result<LoadedAssets, ExportError> {
    let mut loaded = Vec::new();
    let mut total = 0usize;
    if let Some(root) = root {
        for relative in &request.assets {
            let Some(path) = resolve_within_root(root, relative) else {
                continue;
            };
            let Ok(bytes) = std::fs::read(&path) else {
                continue;
            };
            total += bytes.len();
            if total > MAX_TOTAL_ASSET_BYTES {
                return Err(ExportError::new(
                    "assets-too-large",
                    "The slide images are too large to export.",
                ));
            }
            loaded.push((relative.clone(), bytes));
        }
    }
    for diagram in &request.diagrams {
        // Only paths the writer itself would generate are accepted.
        let is_diagram_path = diagram.path.starts_with("diagrams/")
            && diagram.path.ends_with(".svg")
            && is_plain_relative(&diagram.path);
        if is_diagram_path && diagram.svg.len() <= MAX_DIAGRAM_SVG_BYTES {
            loaded.push((diagram.path.clone(), diagram.svg.as_bytes().to_vec()));
        }
    }
    Ok(loaded)
}

/// The WebView's `documentRoot` is trusted only if a native dialog already
/// granted it - a compromised renderer cannot point image reads at `/`.
fn trusted_root<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request: &SlidePdfRequest,
) -> Option<PathBuf> {
    request
        .document_root
        .as_deref()
        .filter(|root| app.fs_scope().is_allowed(root))
        .map(PathBuf::from)
}

fn build_pdf_from(request: &SlidePdfRequest, root: Option<&Path>) -> Result<Vec<u8>, ExportError> {
    let assets = load_assets(root, request)?;
    let asset_paths: HashSet<String> = assets.iter().map(|(path, _)| path.clone()).collect();
    let source = write_slide_deck(&request.deck, &asset_paths)
        .map_err(|err| ExportError::new("deck-too-deep", err.0))?;
    compile_pdf(source, &assets)
}

fn compile_document(source: String, assets: &LoadedAssets) -> Result<PagedDocument, ExportError> {
    // Fonts are bundled, never scanned from the system, so output is
    // identical on every machine.
    let engine = TypstEngine::builder()
        .main_file(source)
        .search_fonts_with(
            TypstKitFontOptions::new()
                .include_system_fonts(false)
                .include_embedded_fonts(true),
        )
        .fonts([
            NOTO_SANS_KR_REGULAR,
            NOTO_SANS_KR_BOLD,
            NOTO_SERIF_KR_REGULAR,
            NOTO_SERIF_KR_BOLD,
        ])
        .with_static_file_resolver(
            assets
                .iter()
                .map(|(path, bytes)| (path.as_str(), bytes.as_slice())),
        )
        .build();
    engine.compile().output.map_err(|err| {
        ExportError::new(
            "typst-compile-failed",
            format!("Typst compilation failed: {err}"),
        )
    })
}

fn compile_pdf(source: String, assets: &LoadedAssets) -> Result<Vec<u8>, ExportError> {
    let document = compile_document(source, assets)?;
    typst_pdf::pdf(&document, &PdfOptions::default())
        .map_err(|err| ExportError::new("pdf-export-failed", format!("PDF export failed: {err:?}")))
}

fn build_pdf<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request_json: &str,
) -> Result<Vec<u8>, ExportError> {
    let request = parse_request(request_json)?;
    build_pdf_from(&request, trusted_root(app, &request).as_deref())
}

/// Writes through a sibling temporary file so a failed export never leaves a
/// truncated PDF at the destination. Under the macOS App Sandbox only the
/// file the user picked is writable, not its folder, so when the temporary
/// file cannot be created this falls back to writing the destination directly.
fn write_atomically(destination: &Path, bytes: &[u8]) -> Result<(), ExportError> {
    let io = |err: std::io::Error| {
        ExportError::new("write-failed", format!("Could not save the PDF: {err}"))
    };
    let parent = destination
        .parent()
        .ok_or_else(|| ExportError::new("write-failed", "The PDF destination has no folder."))?;
    let temporary = parent.join(format!(".asciidoc-slides-{}.pdf.tmp", std::process::id()));
    if std::fs::write(&temporary, bytes).is_err() {
        let _ = std::fs::remove_file(&temporary);
        return std::fs::write(destination, bytes).map_err(io);
    }
    std::fs::rename(&temporary, destination).map_err(|err| {
        let _ = std::fs::remove_file(&temporary);
        io(err)
    })
}

/// Compiles the deck and writes it to `output_path`, which must already be in
/// the fs scope - i.e. chosen by the user in `choose_export_file`.
#[tauri::command]
pub async fn export_slides_pdf<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request_json: String,
    output_path: String,
) -> Result<(), ExportError> {
    if !app.fs_scope().is_allowed(&output_path) {
        return Err(ExportError::new(
            "output-not-allowed",
            "Choose where to save the PDF first.",
        ));
    }
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        std::thread::Builder::new()
            .stack_size(COMPILER_THREAD_STACK_BYTES)
            .spawn(move || build_pdf(&app, &request_json))
            .map_err(|err| ExportError::new("compiler-thread", err.to_string()))?
            .join()
            .unwrap_or_else(|_| {
                Err(ExportError::new(
                    "compiler-panicked",
                    "The PDF compiler crashed.",
                ))
            })
    })
    .await
    .map_err(|err| ExportError::new("compiler-task", err.to_string()))??;
    write_atomically(Path::new(&output_path), &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::slide_deck::SlidePdfRequest;

    fn request(slides: &str) -> String {
        format!(
            r##"{{
              "deck": {{
                "version": 1,
                "metadata": {{ "title": "Deck \"quoted\"", "subtitle": "Sub", "author": "Jane", "date": "2026-10-03", "language": "ko" }},
                "theme": {{
                  "id": "light", "name": "Light",
                  "background": "#ffffff", "text": "#1f2328", "muted": "#656d76", "accent": "#6d28d9",
                  "heroBackground": "#6d28d9", "heroText": "#ffffff", "codeBackground": "#f3f4f6", "codeText": "#1f2328",
                  "tableHeaderBackground": "#ede9fe", "tableHeaderText": "#1f2328", "tableBorder": "#d0d7de",
                  "titleSize": 32, "bodySize": 20, "codeSize": 14
                }},
                "slides": {slides},
                "diagnostics": []
              }},
              "documentRoot": null,
              "assets": [],
              "diagrams": []
            }}"##
        )
    }

    const LOC: &str = r#""location": { "line": 1 }"#;

    fn rich_slides() -> String {
        let text = |value: &str| {
            format!(
                r#"{{ "type": "text", "value": {} }}"#,
                serde_json::to_string(value).unwrap()
            )
        };
        let paragraph = |inlines: String| {
            format!(r#"{{ "type": "paragraph", "text": "", "inlines": [{inlines}], {LOC} }}"#)
        };
        let blocks = [
            paragraph(format!(
                r#"{}, {{ "type": "strong", "children": [{}] }}, {{ "type": "code", "value": "a\"b" }}, {{ "type": "math", "tex": "\\sqrt{{x}}" }}, {{ "type": "link", "target": "https://example.com", "children": [{}], "isWikilink": false, "isUnresolvedWikilink": false }}"#,
                text("한글 // not a comment = *raw* #x $y$ ] ["),
                text("bold"),
                text("link")
            )),
            format!(
                r#"{{ "type": "list", "ordered": false, "items": [{{ "text": "", "inlines": [{}], "blocks": [], {LOC}, "checked": null }}], {LOC} }}"#,
                text("item")
            ),
            format!(
                r#"{{ "type": "code", "language": "rust", "code": "fn main() {{\n  println!(\"```\");\n}}", {LOC} }}"#
            ),
            format!(
                r#"{{ "type": "table", "rows": [[{{ "text": "H", "inlines": [{}] }}, {{ "text": "", "inlines": [] }}], [{{ "text": "c", "inlines": [{}] }}]], "hasHeader": true, {LOC} }}"#,
                text("H"),
                text("c")
            ),
            format!(
                r#"{{ "type": "admonition", "kind": "tip", "text": "", "inlines": [{}], {LOC} }}"#,
                text("tip")
            ),
            format!(
                r#"{{ "type": "quote", "text": "", "inlines": [{}], "attribution": "A", "citation": null, {LOC} }}"#,
                text("q")
            ),
            format!(r#"{{ "type": "mathBlock", "tex": "x^2", {LOC} }}"#),
            format!(
                r#"{{ "type": "image", "asset": {{ "kind": "document-relative", "relativePath": "missing.png" }}, "alt": "Alt", "caption": null, {LOC} }}"#
            ),
            format!(
                r#"{{ "type": "columns", "count": 2, {LOC}, "blocks": [{}, {}] }}"#,
                paragraph(text("L")),
                paragraph(text("R"))
            ),
        ];
        let long_body: Vec<String> = (0..40)
            .map(|i| paragraph(text(&format!("Overflowing line {i}"))))
            .collect();
        format!(
            r#"[
              {{ "layout": "title", "title": "Title", "subtitle": "Sub", "hideTitle": false, "blocks": [], "notes": "", "line": 1 }},
              {{ "layout": "section", "title": "Part", "subtitle": "", "hideTitle": false, "blocks": [], "notes": "", "line": 2 }},
              {{ "layout": "content", "title": "Everything", "subtitle": "", "hideTitle": false, "blocks": [{}], "notes": "n", "line": 3 }},
              {{ "layout": "content", "title": "Overflow", "subtitle": "", "hideTitle": true, "blocks": [{}], "notes": "", "line": 4 }}
            ]"#,
            blocks.join(", "),
            long_body.join(", ")
        )
    }

    #[test]
    fn compiles_every_layout_and_block_to_a_page_per_slide() {
        let parsed: SlidePdfRequest = parse_request(&request(&rich_slides())).unwrap();
        let source = write_slide_deck(&parsed.deck, &HashSet::new()).unwrap();
        let document = compile_document(source.clone(), &Vec::new()).unwrap();
        assert_eq!(
            document.pages().len(),
            4,
            "overflowing content must shrink, not add pages"
        );
        assert!(compile_pdf(source, &Vec::new())
            .unwrap()
            .starts_with(b"%PDF"));
    }

    /// Dev tool: `SLIDES_REQUEST=req.json SLIDES_PDF_OUT=out.pdf cargo test dump_pdf -- --ignored`.
    #[test]
    #[ignore]
    fn dump_pdf() {
        let json = std::fs::read_to_string(std::env::var("SLIDES_REQUEST").unwrap()).unwrap();
        let request = parse_request(&json).unwrap();
        let root = request.document_root.clone().map(PathBuf::from);
        let pdf = build_pdf_from(&request, root.as_deref()).unwrap();
        std::fs::write(std::env::var("SLIDES_PDF_OUT").unwrap(), pdf).unwrap();
    }

    #[test]
    fn compiles_every_style_with_sized_blocks() {
        use crate::slide_deck::{
            BlockAlign, BlockLayout, HeroAlign, SlideStyle, StyleFont, TitleDecoration,
        };
        let mut request = parse_request(&request(&rich_slides())).unwrap();
        for slide in &mut request.deck.slides {
            slide.block_layouts = (0..slide.blocks.len())
                .map(|i| {
                    (i % 2 == 0).then_some(BlockLayout {
                        width: Some(0.6),
                        scale: Some(0.8),
                        align: Some(BlockAlign::Center),
                    })
                })
                .collect();
        }
        for (font, decoration, hero_fill, hero_align) in [
            (
                StyleFont::Sans,
                TitleDecoration::None,
                true,
                HeroAlign::Left,
            ),
            (
                StyleFont::Sans,
                TitleDecoration::Underline,
                true,
                HeroAlign::Center,
            ),
            (
                StyleFont::Sans,
                TitleDecoration::Band,
                true,
                HeroAlign::Left,
            ),
            (
                StyleFont::Sans,
                TitleDecoration::None,
                false,
                HeroAlign::Left,
            ),
            (
                StyleFont::Serif,
                TitleDecoration::Underline,
                false,
                HeroAlign::Center,
            ),
        ] {
            request.deck.style = SlideStyle {
                font,
                title_decoration: decoration,
                hero_fill,
                hero_align,
            };
            let source = write_slide_deck(&request.deck, &HashSet::new()).unwrap();
            let document = compile_document(source, &Vec::new())
                .unwrap_or_else(|err| panic!("{decoration:?}/{font:?}: {}", err.message));
            assert_eq!(document.pages().len(), 4);
        }
    }

    #[cfg(unix)]
    #[test]
    fn writes_directly_when_the_folder_is_not_writable() {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!("slides-readonly-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let output = root.join("deck.pdf");
        std::fs::write(&output, b"old").unwrap();
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o500)).unwrap();
        let result = write_atomically(&output, b"%PDF-new");
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        result.unwrap();
        assert_eq!(std::fs::read(&output).unwrap(), b"%PDF-new");
        assert_eq!(
            std::fs::read_dir(&root).unwrap().count(),
            1,
            "no temporary file left behind"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn compiles_an_empty_deck() {
        let parsed = parse_request(&request("[]")).unwrap();
        let source = write_slide_deck(&parsed.deck, &HashSet::new()).unwrap();
        assert!(compile_pdf(source, &Vec::new())
            .unwrap()
            .starts_with(b"%PDF"));
    }

    #[test]
    fn rejects_unsupported_versions_and_deep_payloads() {
        let json = request("[]").replace("\"version\": 1", "\"version\": 9");
        assert_eq!(
            parse_request(&json).unwrap_err().code,
            "unsupported-version"
        );
        let deep = format!("{}{}", "[".repeat(1000), "]".repeat(1000));
        assert_eq!(parse_request(&deep).unwrap_err().code, "request-too-deep");
    }

    #[test]
    fn asset_paths_stay_inside_the_document_root() {
        assert!(is_plain_relative("images/a.png"));
        assert!(!is_plain_relative("../a.png"));
        assert!(!is_plain_relative("/etc/passwd"));
        assert!(!is_plain_relative("./a.png"));
        let root = std::env::temp_dir().join(format!("slides-root-{}", std::process::id()));
        std::fs::create_dir_all(root.join("images")).unwrap();
        std::fs::write(root.join("images/a.png"), b"x").unwrap();
        assert!(resolve_within_root(&root, "images/a.png").is_some());
        assert!(resolve_within_root(&root, "images/missing.png").is_none());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/etc", root.join("escape")).unwrap();
            assert!(resolve_within_root(&root, "escape/hosts").is_none());
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn export_requires_a_dialog_granted_output_path() {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let output = std::env::temp_dir().join(format!("slides-out-{}.pdf", std::process::id()));
        let result = tauri::async_runtime::block_on(export_slides_pdf(
            app.handle().clone(),
            request("[]"),
            output.to_string_lossy().into_owned(),
        ));
        assert_eq!(result.unwrap_err().code, "output-not-allowed");
        app.fs_scope().allow_file(&output).unwrap();
        tauri::async_runtime::block_on(export_slides_pdf(
            app.handle().clone(),
            request("[]"),
            output.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert!(std::fs::read(&output).unwrap().starts_with(b"%PDF"));
        std::fs::remove_file(output).unwrap();
    }
}
