//! `export_slides_pdf`: SlideDeck JSON -> Typst source (slide_writer.rs) ->
//! PDF bytes -> the user's chosen file. Typst source is generated only here,
//! from validated data; the WebView never supplies it.
use crate::asset_paths::{is_plain_relative, resolve_within_root};
use crate::slide_deck::{SlidePdfRequest, SUPPORTED_DECK_VERSION};
use crate::slide_writer::write_slide_deck;
use serde::Serialize;
use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
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
static EXPORT_SEQUENCE: AtomicU64 = AtomicU64::new(0);

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

type LoadedAssets = Vec<(String, Vec<u8>)>;

/// Missing, denied or unreadable referenced images fail export instead of
/// silently publishing placeholders. `root` must already be trusted.
fn load_assets(
    root: Option<&Path>,
    request: &SlidePdfRequest,
    allowed: &impl Fn(&Path) -> bool,
) -> Result<LoadedAssets, ExportError> {
    let mut loaded = Vec::new();
    let mut total = 0usize;
    if root.is_none() && !request.assets.is_empty() {
        return Err(ExportError::new(
            "asset-not-allowed",
            "Choose the deck folder before exporting its images.",
        ));
    }
    if let Some(root) = root {
        for relative in &request.assets {
            let path = resolve_within_root(root, relative).ok_or_else(|| {
                ExportError::new(
                    "asset-unavailable",
                    format!("Image {relative} is missing or outside the deck folder."),
                )
            })?;
            if !allowed(&root.join(relative)) || !allowed(&path) {
                return Err(ExportError::new(
                    "asset-not-allowed",
                    "A slide image is outside the selected filesystem scope.",
                ));
            }
            if !path.is_file() {
                return Err(ExportError::new(
                    "asset-unavailable",
                    format!("Image {relative} is not a regular file."),
                ));
            }
            let file = std::fs::File::open(&path).map_err(|err| {
                ExportError::new(
                    "asset-unavailable",
                    format!("Could not read image {relative}: {err}"),
                )
            })?;
            let info = file
                .metadata()
                .map_err(|err| ExportError::new("asset-unavailable", err.to_string()))?;
            if !info.is_file() {
                return Err(ExportError::new(
                    "asset-unavailable",
                    format!("Image {relative} is not a regular file."),
                ));
            }
            if info.len() > (MAX_TOTAL_ASSET_BYTES - total) as u64 {
                return Err(ExportError::new(
                    "assets-too-large",
                    "The slide images are too large to export.",
                ));
            }
            let mut bytes = Vec::new();
            file.take((MAX_TOTAL_ASSET_BYTES - total + 1) as u64)
                .read_to_end(&mut bytes)
                .map_err(|err| {
                    ExportError::new(
                        "asset-unavailable",
                        format!("Could not read image {relative}: {err}"),
                    )
                })?;
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
            total += diagram.svg.len();
            if total > MAX_TOTAL_ASSET_BYTES {
                return Err(ExportError::new(
                    "assets-too-large",
                    "The slide images are too large to export.",
                ));
            }
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

fn build_pdf_from(
    request: &SlidePdfRequest,
    root: Option<&Path>,
    allowed: &impl Fn(&Path) -> bool,
) -> Result<Vec<u8>, ExportError> {
    if let Some(family) = &request.deck.font_family {
        if !typst_kit::fonts::system().any(|(_, info)| info.family.eq_ignore_ascii_case(family)) {
            return Err(ExportError::new(
                "font-unavailable",
                "The selected slide font is not installed or readable. Choose another system font.",
            ));
        }
    }
    let assets = load_assets(root, request, allowed)?;
    let asset_paths: HashSet<String> = assets.iter().map(|(path, _)| path.clone()).collect();
    let source = write_slide_deck(&request.deck, &asset_paths)
        .map_err(|err| ExportError::new("deck-too-deep", err.0))?;
    compile_pdf(source, &assets)
}

fn compile_document(source: String, assets: &LoadedAssets) -> Result<PagedDocument, ExportError> {
    // Use installed fonts only; output may vary between machines.
    let engine = TypstEngine::builder()
        .main_file(source)
        .search_fonts_with(TypstKitFontOptions::new().include_system_fonts(true))
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
    build_pdf_from(&request, trusted_root(app, &request).as_deref(), &|path| {
        app.fs_scope().is_allowed(path)
    })
}

/// Writes and syncs `bytes` into a file that must not exist yet. A partial
/// file is removed on failure: it was created here, so nothing is lost.
fn write_new_file(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    let result = file.write_all(bytes).and_then(|_| file.sync_all());
    if result.is_err() {
        let _ = std::fs::remove_file(path);
    }
    result
}

/// The path taken when no sibling temporary file can be created: a new PDF is
/// created exclusively; an existing one is never overwritten in place.
fn write_without_temporary(destination: &Path, bytes: &[u8]) -> Result<(), ExportError> {
    if std::fs::symlink_metadata(destination).is_ok() {
        return Err(ExportError::new(
            "write-failed",
            "Could not create a safe temporary file next to the existing PDF, so it was left unchanged. Save under a new file name or in a writable folder.",
        ));
    }
    write_new_file(destination, bytes)
        .map_err(|err| ExportError::new("write-failed", format!("Could not save the PDF: {err}")))
}

/// Writes through a sibling temporary file so a failed export never leaves a
/// truncated PDF at the destination, and never falls back to overwriting an
/// existing PDF in place.
///
/// The macOS App Sandbox grants only the file picked in the save panel, not
/// its folder, so the sibling temporary file cannot be created there. When the
/// destination does not exist yet there is no original to protect, so the PDF
/// is created directly (exclusively); replacing an existing PDF still requires
/// a writable folder.
fn write_atomically(destination: &Path, bytes: &[u8]) -> Result<(), ExportError> {
    let io = |err: std::io::Error| {
        ExportError::new("write-failed", format!("Could not save the PDF: {err}"))
    };
    let parent = destination
        .parent()
        .ok_or_else(|| ExportError::new("write-failed", "The PDF destination has no folder."))?;
    let temporary = parent.join(format!(
        ".asciidoc-slides-{}-{}.pdf.tmp",
        std::process::id(),
        EXPORT_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let Ok(mut file) = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
    else {
        return write_without_temporary(destination, bytes);
    };
    let result = (|| {
        file.write_all(bytes)?;
        file.sync_all()?;
        std::fs::rename(&temporary, destination)
    })();
    result.map_err(|err| {
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
    let destination = crate::document_store::canonical_destination(Path::new(&output_path))
        .map_err(|err| ExportError::new("write-failed", err))?;
    if !app.fs_scope().is_allowed(&output_path) || !app.fs_scope().is_allowed(&destination) {
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
    write_atomically(&destination, &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::slide_deck::SlidePdfRequest;

    #[test]
    fn asset_reads_respect_per_file_scope_and_size_limits() {
        let root = std::env::temp_dir().join(format!("slides-assets-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("private.png");
        std::fs::write(&path, b"private").unwrap();
        let mut parsed = parse_request(&request("[]")).unwrap();
        parsed.assets = vec!["private.png".into()];
        let canonical = path.canonicalize().unwrap();
        let denied = load_assets(Some(&root), &parsed, &|p| p != canonical).unwrap_err();
        assert_eq!(denied.code, "asset-not-allowed");
        let file = std::fs::OpenOptions::new().write(true).open(&path).unwrap();
        file.set_len(MAX_TOTAL_ASSET_BYTES as u64 + 1).unwrap();
        assert_eq!(
            load_assets(Some(&root), &parsed, &|_| true)
                .unwrap_err()
                .code,
            "assets-too-large"
        );
        drop(file);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn export_rejects_output_symlink_to_a_denied_destination() {
        let root = std::env::temp_dir().join(format!("slides-output-link-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let target = root.join("private.pdf");
        let link = root.join("output.pdf");
        std::fs::write(&target, b"keep").unwrap();
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        app.fs_scope().allow_directory(&root, true).unwrap();
        app.fs_scope()
            .forbid_file(target.canonicalize().unwrap())
            .unwrap();
        let result = tauri::async_runtime::block_on(export_slides_pdf(
            app.handle().clone(),
            request("[]"),
            link.to_string_lossy().into_owned(),
        ));
        assert_eq!(result.unwrap_err().code, "output-not-allowed");
        assert_eq!(std::fs::read(&target).unwrap(), b"keep");
        std::fs::remove_dir_all(root).unwrap();
    }

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
        let pdf = build_pdf_from(&request, root.as_deref(), &|_| true).unwrap();
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
    fn creates_a_new_pdf_but_never_overwrites_without_a_temporary_file() {
        let root = std::env::temp_dir().join(format!("slides-no-temp-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let fresh = root.join("new.pdf");
        write_without_temporary(&fresh, b"%PDF-new").unwrap();
        assert_eq!(std::fs::read(&fresh).unwrap(), b"%PDF-new");
        let existing = root.join("old.pdf");
        std::fs::write(&existing, b"old").unwrap();
        assert_eq!(
            write_without_temporary(&existing, b"%PDF-new")
                .unwrap_err()
                .code,
            "write-failed"
        );
        assert_eq!(std::fs::read(&existing).unwrap(), b"old");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn preserves_existing_pdf_when_the_folder_is_not_writable() {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!("slides-readonly-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let output = root.join("deck.pdf");
        std::fs::write(&output, b"old").unwrap();
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o500)).unwrap();
        let result = write_atomically(&output, b"%PDF-new");
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert!(result.is_err());
        assert_eq!(std::fs::read(&output).unwrap(), b"old");
        assert_eq!(
            std::fs::read_dir(&root).unwrap().count(),
            1,
            "no temporary file left behind"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn compiles_slides_with_video_posters_and_links() {
        let slides = format!(
            r#"[
              {{ "layout": "content", "title": "Videos", "subtitle": "", "hideTitle": false,
                 "blocks": [{{ "type": "paragraph", "text": "", "inlines": [{{ "type": "text", "value": "Between" }}], {LOC} }}],
                 "blockLayouts": [null],
                 "videos": [
                   {{ "at": 0, "source": {{ "kind": "file", "relativePath": "media/demo.mp4" }}, "poster": "media/missing.png", "title": "Demo", "start": 5, "layout": {{ "width": 0.5, "scale": null, "align": "center" }} }},
                   {{ "at": 1, "source": {{ "kind": "youtube", "id": "dQw4w9WgXcQ" }}, "poster": null, "title": null, "start": 30, "layout": null }}
                 ],
                 "notes": "", "line": 1 }},
              {{ "layout": "content", "title": "Only video", "subtitle": "", "hideTitle": false, "blocks": [],
                 "videos": [{{ "at": 0, "source": {{ "kind": "youtube", "id": "bad\"id" }}, "poster": null, "title": null, "start": null, "layout": null }}],
                 "notes": "", "line": 2 }}
            ]"#
        );
        let parsed = parse_request(&request(&slides)).unwrap();
        let source = write_slide_deck(&parsed.deck, &HashSet::new()).unwrap();
        assert!(source.contains("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s"));
        assert!(
            !source.contains("bad"),
            "invalid IDs never reach the source"
        );
        assert!(source.find("Demo").unwrap() < source.find("Between").unwrap());
        assert!(source.find("Between").unwrap() < source.find("watch?v=").unwrap());
        let document = compile_document(source, &Vec::new()).unwrap();
        assert_eq!(document.pages().len(), 2);
    }

    #[test]
    fn compiles_video_only_hero_slides() {
        for layout in ["title", "section"] {
            let slides = format!(
                r#"[{{"layout":"{layout}","title":"Video","subtitle":"","hideTitle":false,"blocks":[],"videos":[{{"at":0,"source":{{"kind":"youtube","id":"dQw4w9WgXcQ"}},"poster":null,"title":null,"start":null,"layout":null}}],"notes":"","line":1}}]"#
            );
            let parsed = parse_request(&request(&slides)).unwrap();
            let source = write_slide_deck(&parsed.deck, &HashSet::new()).unwrap();
            assert!(source.contains("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
            assert_eq!(
                compile_document(source, &Vec::new()).unwrap().pages().len(),
                1
            );
        }
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
    fn rejects_unavailable_selected_fonts() {
        let mut req = parse_request(&request("[]")).unwrap();
        req.deck.font_family = Some("Slides Nonexistent Font 7d6f8c".into());
        let error = build_pdf_from(&req, None, &|_| true).unwrap_err();
        assert_eq!(error.code, "font-unavailable");
    }

    #[test]
    fn selected_font_is_escaped_in_typst_source() {
        let mut req = parse_request(&request("[]")).unwrap();
        req.deck.font_family = Some("font\"; #read(\"secret\")".into());
        let source = write_slide_deck(&req.deck, &HashSet::new()).unwrap();
        assert!(source.contains(r#"font\"; #read(\"secret\")"#));
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
