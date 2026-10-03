//! Writes a `SlideDeck` as Typst source: one fixed-size 16:9 page per slide.
//!
//! Every piece of document text is emitted as a Typst *string literal*
//! (`#"..."`) rather than as markup, so no character in a slide - `*`, `//`,
//! `=` at a line start, `#`, `$` - can be interpreted as Typst syntax. Colors
//! are re-validated as `#rrggbb`, sizes are clamped, code languages and link
//! targets go through allow-lists, and images resolve only to assets the
//! compiler actually loaded.
use crate::safe_document::{
    AdmonitionKind, SafeAssetRef, SafeBlock, SafeDescriptionListItem, SafeInline, SafeListItem,
    SafeTableCell,
};
use crate::slide_deck::{
    BlockAlign, BlockLayout, HeroAlign, Slide, SlideDeck, SlideLayout, SlideStyle, SlideTheme,
    SlideVideo, StyleFont, TitleDecoration, VideoSource,
};
use crate::typst_font::{SANS_FONT_FAMILIES, SERIF_FONT_FAMILIES};
use std::collections::HashSet;

/// Nesting deeper than this is refused rather than recursed into.
const MAX_DEPTH: usize = 48;
const MONO_FONT_FAMILIES: &[&str] = &["DejaVu Sans Mono", "Noto Sans KR"];

#[derive(Debug, PartialEq, Eq)]
pub struct WriteError(pub String);

type WriteResult = Result<(), WriteError>;

struct Writer<'a> {
    out: String,
    assets: &'a HashSet<String>,
    theme: Palette,
}

/// Validated theme values, ready to interpolate.
struct Palette {
    background: String,
    text: String,
    muted: String,
    accent: String,
    hero_background: String,
    hero_text: String,
    code_background: String,
    code_text: String,
    table_header_background: String,
    table_header_text: String,
    table_border: String,
    title_size: f64,
    body_size: f64,
    code_size: f64,
}

fn valid_hex(value: &str, fallback: &str) -> String {
    let ok = value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|c| c.is_ascii_hexdigit());
    format!("rgb(\"{}\")", if ok { value } else { fallback })
}

fn clamp_size(value: f64, fallback: f64) -> f64 {
    if value.is_finite() {
        value.clamp(8.0, 96.0)
    } else {
        fallback
    }
}

impl Palette {
    fn from_theme(theme: &SlideTheme) -> Self {
        Self {
            background: valid_hex(&theme.background, "#ffffff"),
            text: valid_hex(&theme.text, "#1f2328"),
            muted: valid_hex(&theme.muted, "#656d76"),
            accent: valid_hex(&theme.accent, "#6d28d9"),
            hero_background: valid_hex(&theme.hero_background, "#6d28d9"),
            hero_text: valid_hex(&theme.hero_text, "#ffffff"),
            code_background: valid_hex(&theme.code_background, "#f3f4f6"),
            code_text: valid_hex(&theme.code_text, "#1f2328"),
            table_header_background: valid_hex(&theme.table_header_background, "#ede9fe"),
            table_header_text: valid_hex(&theme.table_header_text, "#1f2328"),
            table_border: valid_hex(&theme.table_border, "#d0d7de"),
            title_size: clamp_size(theme.title_size, 32.0),
            body_size: clamp_size(theme.body_size, 20.0),
            code_size: clamp_size(theme.code_size, 14.0),
        }
    }
}

/// A Typst string literal. Newlines become spaces: AsciiDoc soft wraps
/// inside a paragraph are not line breaks.
pub fn string_literal(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' | '\r' | '\t' => out.push(' '),
            c if c.is_control() => {}
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Like `string_literal` but keeps line structure - for code.
fn multiline_string_literal(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("  "),
            c if c.is_control() => {}
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn text(value: &str) -> String {
    format!("#{}", string_literal(value))
}

fn font_array(families: &[&str]) -> String {
    let items: Vec<String> = families.iter().map(|f| string_literal(f)).collect();
    format!("({},)", items.join(", "))
}

fn is_safe_link_target(target: &str) -> bool {
    target.starts_with("https://") || target.starts_with("http://") || target.starts_with("mailto:")
}

fn code_language(language: Option<&str>) -> Option<&str> {
    language.filter(|lang| {
        !lang.is_empty()
            && lang.len() <= 32
            && lang
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '#' | '-' | '_'))
    })
}

fn language_code(language: &str) -> Option<&str> {
    let lang = language.split(['-', '_']).next().unwrap_or("");
    let ok = (2..=3).contains(&lang.len()) && lang.chars().all(|c| c.is_ascii_lowercase());
    ok.then_some(lang)
}

/// FNV-1a 64 of the diagram source - the same key `diagramAssets.ts` uses.
pub fn diagram_asset_path(code: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in code.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("diagrams/{hash:016x}.svg")
}

/// MiTeX keeps `\sqrt` as an internal helper; Typst's native `sqrt` matches it.
fn convert_math(tex: &str) -> Option<String> {
    mitex::convert_math(tex, None)
        .ok()
        .map(|converted| converted.replace("mitexsqrt(", "sqrt("))
}

fn admonition_label(kind: AdmonitionKind) -> &'static str {
    match kind {
        AdmonitionKind::Note => "NOTE",
        AdmonitionKind::Tip => "TIP",
        AdmonitionKind::Important => "IMPORTANT",
        AdmonitionKind::Warning => "WARNING",
        AdmonitionKind::Caution => "CAUTION",
    }
}

fn admonition_color(kind: AdmonitionKind) -> &'static str {
    match kind {
        AdmonitionKind::Note => "rgb(\"#2563eb\")",
        AdmonitionKind::Tip => "rgb(\"#16a34a\")",
        AdmonitionKind::Important => "rgb(\"#7c3aed\")",
        AdmonitionKind::Warning => "rgb(\"#d97706\")",
        AdmonitionKind::Caution => "rgb(\"#dc2626\")",
    }
}

fn check_depth(depth: usize) -> WriteResult {
    if depth > MAX_DEPTH {
        Err(WriteError("Slide content is nested too deeply.".into()))
    } else {
        Ok(())
    }
}

impl<'a> Writer<'a> {
    fn push(&mut self, value: &str) {
        self.out.push_str(value);
    }

    fn asset_path<'b>(&self, asset: &'b SafeAssetRef) -> Option<&'b str> {
        match asset {
            SafeAssetRef::DocumentRelative { relative_path }
                if self.assets.contains(relative_path) =>
            {
                Some(relative_path)
            }
            _ => None,
        }
    }

    fn preamble(&mut self, deck: &SlideDeck) {
        let theme = &self.theme;
        let families = match deck.style.font {
            StyleFont::Sans => SANS_FONT_FAMILIES,
            StyleFont::Serif => SERIF_FONT_FAMILIES,
        };
        let mut out = String::new();
        out.push_str(&format!(
            "#set document(title: {}, author: {})\n",
            string_literal(&deck.metadata.title),
            string_literal(&deck.metadata.author),
        ));
        out.push_str(&format!(
            "#set page(width: 13.333in, height: 7.5in, margin: 0pt, fill: {})\n",
            theme.background
        ));
        out.push_str(&format!(
            "#set text(font: {}, size: {}pt, fill: {}",
            font_array(families),
            theme.body_size,
            theme.text
        ));
        if let Some(lang) = language_code(&deck.metadata.language) {
            out.push_str(&format!(", lang: {}", string_literal(lang)));
        }
        out.push_str(")\n");
        out.push_str("#set par(leading: 0.55em, spacing: 0.75em, justify: false)\n");
        // Typst shrinks raw text to 0.8em by default; inline code keeps the
        // surrounding size, and code blocks keep the theme's code:body ratio
        // so a block's `[.small]` or `font-size=` scales its code too.
        out.push_str(&format!(
            "#show raw: set text(font: {})\n#show raw.where(block: false): set text(size: 1em)\n#show raw.where(block: true): set text(size: {:.4}em)\n",
            font_array(MONO_FONT_FAMILIES),
            theme.code_size / theme.body_size
        ));
        out.push_str(&format!(
            "#show raw.where(block: false): it => box(fill: {}, inset: (x: 3pt), outset: (y: 3pt), radius: 2pt, it)\n",
            theme.code_background
        ));
        out.push_str(&format!(
            "#show raw.where(block: true): it => block(width: 100%, fill: {}, inset: 12pt, radius: 6pt, text(fill: {}, it))\n",
            theme.code_background, theme.code_text
        ));
        out.push_str(&format!("#show link: set text(fill: {})\n", theme.accent));
        out.push_str(&format!(
            "#set list(marker: (text(fill: {})[•], text(fill: {})[–], [◦]), indent: 0.3em, body-indent: 0.6em, spacing: 0.6em)\n",
            theme.accent, theme.accent
        ));
        out.push_str("#set enum(indent: 0.3em, body-indent: 0.6em, spacing: 0.6em)\n");
        out.push_str("#set table(inset: 7pt)\n");
        // Shrinks a slide body that would overflow its area: lay it out wider,
        // then scale it down so the scaled result fits both dimensions.
        out.push_str(
            "#let fit-body(body) = layout(size => {\n  \
               let natural = measure(block(width: size.width, body)).height\n  \
               if natural <= size.height { body } else {\n    \
                 let factor = size.height / natural\n    \
                 scale(x: factor * 100%, y: factor * 100%, origin: top + left, reflow: true, block(width: size.width / factor, body))\n  \
               }\n\
             })\n\n",
        );
        self.push(&out);
    }

    fn slide_number(&mut self, number: usize, color: &str) {
        self.push(&format!(
            "#place(bottom + right, dx: -0.35in, dy: -0.25in, text(size: 11pt, fill: {color})[{number}])\n"
        ));
    }

    /// Opens a title/section page: hero-filled or plain per the style.
    /// Returns (title color, text color) for the page.
    fn open_hero_page(&mut self, style: &SlideStyle) -> (String, String) {
        let theme = &self.theme;
        let (fill, fg, title) = if style.hero_fill {
            (
                theme.hero_background.clone(),
                theme.hero_text.clone(),
                theme.hero_text.clone(),
            )
        } else {
            (
                theme.background.clone(),
                theme.text.clone(),
                theme.accent.clone(),
            )
        };
        let align = match style.hero_align {
            HeroAlign::Left => "left",
            HeroAlign::Center => "center",
        };
        self.push(&format!(
            "#page(fill: {fill})[\n#set text(fill: {fg})\n#show link: set text(fill: {title})\n#set list(marker: (text(fill: {title})[•], text(fill: {title})[–], [◦]))\n#block(width: 100%, height: 100%, inset: (x: 0.9in, y: 0.8in))[\n#set align({align})\n#align({align} + horizon)[\n"
        ));
        (title, fg)
    }

    fn accent_bar(&mut self, color: &str) {
        self.push(&format!(
            "#box(width: 1.2in, height: 5pt, fill: {color})\n#v(0.4em)\n"
        ));
    }

    fn title_slide(&mut self, deck: &SlideDeck, slide: &Slide) -> WriteResult {
        let (title_color, _) = self.open_hero_page(&deck.style);
        if !deck.style.hero_fill {
            self.accent_bar(&title_color);
        }
        self.push(&format!(
            "#text(size: {}pt, weight: \"bold\", fill: {title_color})[{}]\n\n",
            self.theme.title_size * 1.4,
            text(&slide.title)
        ));
        if !slide.subtitle.is_empty() {
            self.push(&format!(
                "#v(0.2em)\n#text(size: {}pt)[{}]\n\n",
                self.theme.body_size * 1.2,
                text(&slide.subtitle)
            ));
        }
        let byline: Vec<&str> = [deck.metadata.author.as_str(), deck.metadata.date.as_str()]
            .into_iter()
            .filter(|value| !value.is_empty())
            .collect();
        if !byline.is_empty() {
            self.push(&format!(
                "#v(1.2em)\n#text(size: {}pt)[{}]\n\n",
                self.theme.body_size * 0.8,
                text(&byline.join("  ·  "))
            ));
        }
        if !slide.blocks.is_empty() || !slide.videos.is_empty() {
            self.push(&format!(
                "#v(1em)\n#text(size: {}pt)[\n",
                self.theme.body_size * 0.85
            ));
            self.top_blocks(slide)?;
            self.push("]\n");
        }
        self.push("]\n]\n]\n");
        Ok(())
    }

    fn section_slide(&mut self, deck: &SlideDeck, slide: &Slide, number: usize) -> WriteResult {
        let (title_color, fg) = self.open_hero_page(&deck.style);
        self.accent_bar(&title_color);
        self.push(&format!(
            "#text(size: {}pt, weight: \"bold\", fill: {title_color})[{}]\n\n",
            self.theme.title_size * 1.25,
            text(&slide.title)
        ));
        if !slide.blocks.is_empty() || !slide.videos.is_empty() {
            self.push(&format!("#text(size: {}pt)[\n", self.theme.body_size));
            self.top_blocks(slide)?;
            self.push("]\n");
        }
        self.push("]\n]\n");
        let number_color = if deck.style.hero_fill {
            fg
        } else {
            self.theme.muted.clone()
        };
        self.slide_number(number, &number_color);
        self.push("]\n");
        Ok(())
    }

    /// The first grid cell of a content slide: its title, decorated per style.
    fn content_title(&mut self, title: &str, decoration: TitleDecoration) {
        let theme = &self.theme;
        let size = theme.title_size;
        let cell = match decoration {
            TitleDecoration::None => {
                format!("[#text(size: {size}pt, weight: \"bold\", fill: {})[{}]],\n", theme.accent, text(title))
            }
            TitleDecoration::Underline => format!(
                "[#text(size: {size}pt, weight: \"bold\", fill: {})[{}]\n#v(2pt)\n#box(width: 1in, height: 4pt, fill: {})],\n",
                theme.accent,
                text(title),
                theme.accent
            ),
            // A full-bleed band: the page inset is 0.6in, so shift left by it.
            TitleDecoration::Band => format!(
                "[#move(dx: -0.6in, block(width: 13.333in, height: 1.25in, fill: {}, inset: (x: 0.6in), align(horizon, text(size: {size}pt, weight: \"bold\", fill: {})[{}])))],\n",
                theme.hero_background,
                theme.hero_text,
                text(title)
            ),
        };
        self.push(&cell);
    }

    fn content_slide(&mut self, deck: &SlideDeck, slide: &Slide, number: usize) -> WriteResult {
        let show_title = !slide.hide_title && !slide.title.is_empty();
        let band = show_title && deck.style.title_decoration == TitleDecoration::Band;
        let top = if band { "0in" } else { "0.45in" };
        self.push(&format!(
            "#page[\n#block(width: 100%, height: 100%, inset: (x: 0.6in, top: {top}, bottom: 0.55in))[\n"
        ));
        if show_title {
            self.push("#grid(columns: (1fr,), rows: (auto, 1fr), row-gutter: 0.28in,\n");
            self.content_title(&slide.title, deck.style.title_decoration);
        } else {
            self.push("#grid(columns: (1fr,), rows: (1fr,),\n");
        }
        self.push("fit-body[\n");
        self.top_blocks(slide)?;
        self.push("],\n)\n]\n");
        let muted = self.theme.muted.clone();
        self.slide_number(number, &muted);
        self.push("]\n");
        Ok(())
    }

    /// A slide's top-level blocks and videos in source order (videos go
    /// before `blocks[at]`, as in `slideItems.ts`), each in its author-set sizing.
    fn top_blocks(&mut self, slide: &Slide) -> WriteResult {
        let mut videos: Vec<&SlideVideo> = slide.videos.iter().collect();
        videos.sort_by_key(|video| video.at);
        let mut pending = videos.into_iter().peekable();
        for (index, block) in slide.blocks.iter().enumerate() {
            while let Some(video) = pending.next_if(|video| video.at <= index) {
                self.sized(video.layout.as_ref(), |writer| {
                    writer.video(video);
                    Ok(())
                })?;
            }
            let layout = slide.block_layouts.get(index).and_then(Option::as_ref);
            self.sized(layout, |writer| {
                writer.block(block, usize::from(layout.is_some()))
            })?;
        }
        for video in pending {
            self.sized(video.layout.as_ref(), |writer| {
                writer.video(video);
                Ok(())
            })?;
        }
        Ok(())
    }

    fn sized(
        &mut self,
        layout: Option<&BlockLayout>,
        write: impl FnOnce(&mut Self) -> WriteResult,
    ) -> WriteResult {
        let Some(layout) = layout else {
            return write(self);
        };
        let (open, close) = layout_wrapper(layout);
        self.push(&open);
        write(self)?;
        self.push(&close);
        Ok(())
    }

    /// A 16:9 poster (or dark frame) with a play badge; YouTube videos link
    /// to their watch page. PDF cannot play video.
    fn video(&mut self, video: &SlideVideo) {
        let poster = video
            .poster
            .as_deref()
            .filter(|path| self.assets.contains(*path))
            .map(|path| {
                format!(
                    "#place(image({}, width: 100%, height: 100%, fit: \"cover\"))\n",
                    string_literal(path)
                )
            })
            .unwrap_or_default();
        let frame = format!(
            "layout(size => {{ let w = calc.min(size.width, 7.46in); align(center, block(width: w, height: w * 9 / 16, fill: rgb(\"#111111\"), radius: 8pt, clip: true)[\n{poster}#place(center + horizon, box(width: 0.9in, height: 0.62in, radius: 10pt, fill: rgb(0, 0, 0, 160), align(center + horizon, polygon(fill: white, (0pt, 0pt), (0pt, 20pt), (17pt, 10pt)))))\n]) }})"
        );
        let label = video_label(video);
        match youtube_watch_url(video) {
            Some(url) => {
                let url = string_literal(&url);
                self.push(&format!("#link({url}, {frame})\n"));
                self.push(&format!(
                    "#align(center, link({url}, text(size: 0.7em, fill: {})[{}]))\n",
                    self.theme.accent,
                    text(
                        &match video.title.as_deref().filter(|t| !t.trim().is_empty()) {
                            Some(title) => format!("▶ {title} (YouTube)"),
                            None => "▶ Watch on YouTube".to_string(),
                        }
                    )
                ));
            }
            None => {
                self.push(&format!("#{frame}\n"));
                self.push(&format!(
                    "#align(center, text(size: 0.7em, fill: {})[{}])\n",
                    self.theme.muted,
                    text(&format!("▶ {label}"))
                ));
            }
        }
    }

    fn blocks(&mut self, blocks: &[SafeBlock], depth: usize) -> WriteResult {
        check_depth(depth)?;
        for block in blocks {
            self.block(block, depth)?;
        }
        Ok(())
    }

    fn block(&mut self, block: &SafeBlock, depth: usize) -> WriteResult {
        match block {
            SafeBlock::Paragraph { inlines, .. } => {
                self.push("#par[");
                self.inlines(inlines, depth)?;
                self.push("]\n");
            }
            SafeBlock::Section { title, blocks, .. } => {
                self.push(&format!(
                    "#text(weight: \"bold\", size: {}pt)[{}]\n\n",
                    self.theme.body_size * 1.1,
                    text(title)
                ));
                self.blocks(blocks, depth + 1)?;
            }
            SafeBlock::Container { title, blocks, .. }
            | SafeBlock::Formal { title, blocks, .. }
            | SafeBlock::DocumentPart { title, blocks, .. } => {
                if let Some(title) = title.as_deref().filter(|t| !t.is_empty()) {
                    self.push(&format!("#strong[{}]\n\n", text(title)));
                }
                self.blocks(blocks, depth + 1)?;
            }
            SafeBlock::Columns { count, blocks, .. } => self.columns(*count, blocks, depth)?,
            SafeBlock::Code {
                language,
                code,
                caption,
                ..
            } => {
                self.caption(caption.as_deref());
                let lang = code_language(language.as_deref())
                    .map(|lang| format!(", lang: {}", string_literal(lang)))
                    .unwrap_or_default();
                self.push(&format!(
                    "#raw({}, block: true{lang})\n",
                    multiline_string_literal(code)
                ));
            }
            SafeBlock::Diagram { code, .. } => {
                let path = diagram_asset_path(code);
                if self.assets.contains(&path) {
                    self.push(&format!(
                        "#align(center, image({}, height: 4.2in, fit: \"contain\"))\n",
                        string_literal(&path)
                    ));
                } else {
                    self.push(&format!(
                        "#raw({}, block: true)\n",
                        multiline_string_literal(code)
                    ));
                }
            }
            SafeBlock::MathBlock { tex, .. } => self.display_math(tex),
            SafeBlock::Image {
                asset,
                alt,
                caption,
                ..
            } => {
                if let Some(path) = self.asset_path(asset) {
                    self.push(&format!(
                        "#align(center, image({}, alt: {}, height: 4.2in, fit: \"contain\"))\n",
                        string_literal(path),
                        string_literal(alt)
                    ));
                    if let Some(caption) = caption.as_deref().filter(|c| !c.is_empty()) {
                        self.push(&format!(
                            "#align(center, text(size: 0.7em, fill: {})[{}])\n",
                            self.theme.muted,
                            text(caption)
                        ));
                    }
                } else {
                    self.push(&format!(
                        "#align(center, block(stroke: 1pt + {}, inset: 1em, radius: 4pt, text(fill: {})[{}]))\n",
                        self.theme.table_border,
                        self.theme.muted,
                        text(&format!("Image not found: {alt}"))
                    ));
                }
            }
            SafeBlock::List { ordered, items, .. } => self.list(*ordered, items, depth)?,
            SafeBlock::DescriptionList { items, .. } => self.description_list(items, depth)?,
            SafeBlock::Quote {
                inlines,
                attribution,
                citation,
                ..
            } => {
                self.push(&format!(
                    "#block(stroke: (left: 4pt + {}), inset: (left: 16pt, y: 6pt))[#emph[",
                    self.theme.accent
                ));
                self.inlines(inlines, depth)?;
                self.push("]");
                let source: Vec<&str> = [attribution.as_deref(), citation.as_deref()]
                    .into_iter()
                    .flatten()
                    .filter(|v| !v.trim().is_empty())
                    .collect();
                if !source.is_empty() {
                    self.push(&format!(
                        "\n\n#text(size: 0.8em, fill: {})[— {}]",
                        self.theme.muted,
                        text(&source.join(", "))
                    ));
                }
                self.push("]\n");
            }
            SafeBlock::Admonition { kind, inlines, .. } => {
                let color = admonition_color(*kind);
                self.push(&format!(
                    "#block(width: 100%, stroke: (left: 4pt + {color}), fill: {color}.transparentize(90%), inset: (x: 14pt, y: 10pt), radius: 4pt)[#text(size: 0.7em, weight: \"bold\", fill: {color})[{}] #h(0.6em)",
                    admonition_label(*kind)
                ));
                self.inlines(inlines, depth)?;
                self.push("]\n");
            }
            SafeBlock::Table {
                rows,
                has_header,
                caption,
                ..
            } => {
                self.caption(caption.as_deref());
                self.table(rows, *has_header, depth)?;
            }
            SafeBlock::ThematicBreak { .. } => {
                self.push(&format!(
                    "#line(length: 100%, stroke: 1pt + {})\n",
                    self.theme.table_border
                ));
            }
            SafeBlock::PageBreak { .. } => {}
        }
        Ok(())
    }

    fn caption(&mut self, caption: Option<&str>) {
        if let Some(caption) = caption.filter(|c| !c.is_empty()) {
            self.push(&format!(
                "#text(size: 0.75em, weight: \"bold\", fill: {})[{}]\n",
                self.theme.muted,
                text(caption)
            ));
        }
    }

    fn display_math(&mut self, tex: &str) {
        match convert_math(tex) {
            Some(math) => self.push(&format!("$ {math} $\n")),
            None => self.push(&format!(
                "#raw({}, block: true)\n",
                multiline_string_literal(tex)
            )),
        }
    }

    fn columns(&mut self, count: u8, blocks: &[SafeBlock], depth: usize) -> WriteResult {
        let count = usize::from(count.clamp(2, 3));
        let groups = split_into_columns(blocks, count);
        self.push(&format!(
            "#grid(columns: ({}), column-gutter: 0.4in,\n",
            vec!["1fr"; count].join(", ")
        ));
        for group in groups {
            self.push("[\n");
            self.blocks(group, depth + 1)?;
            self.push("],\n");
        }
        self.push(")\n");
        Ok(())
    }

    fn list(&mut self, ordered: bool, items: &[SafeListItem], depth: usize) -> WriteResult {
        check_depth(depth)?;
        self.push(if ordered { "#enum(\n" } else { "#list(\n" });
        for item in items {
            self.push("[");
            match item.checked {
                Some(true) => self.push("☑ "),
                Some(false) => self.push("☐ "),
                None => {}
            }
            self.inlines(&item.inlines, depth)?;
            if !item.blocks.is_empty() {
                self.push("\n");
                self.blocks(&item.blocks, depth + 1)?;
            }
            self.push("],\n");
        }
        self.push(")\n");
        Ok(())
    }

    fn description_list(&mut self, items: &[SafeDescriptionListItem], depth: usize) -> WriteResult {
        for item in items {
            self.push("#par[#strong[");
            self.inlines(&item.term_inlines, depth)?;
            self.push("] #h(0.4em) ");
            self.inlines(&item.description_inlines, depth)?;
            self.push("]\n");
            self.blocks(&item.description_blocks, depth + 1)?;
        }
        Ok(())
    }

    fn table(
        &mut self,
        rows: &[Vec<SafeTableCell>],
        has_header: bool,
        depth: usize,
    ) -> WriteResult {
        let columns = rows.iter().map(Vec::len).max().unwrap_or(0);
        if columns == 0 {
            return Ok(());
        }
        let header_fill = if has_header {
            format!(
                "fill: (_, y) => if y == 0 {{ {} }},\n",
                self.theme.table_header_background
            )
        } else {
            String::new()
        };
        self.push(&format!(
            "#text(size: 0.8em)[#table(columns: {columns}, stroke: 0.75pt + {}, {header_fill}",
            self.theme.table_border
        ));
        for (row_index, row) in rows.iter().enumerate() {
            let is_header = has_header && row_index == 0;
            for column in 0..columns {
                self.push("[");
                if is_header {
                    self.push(&format!(
                        "#set text(weight: \"bold\", fill: {})\n",
                        self.theme.table_header_text
                    ));
                }
                if let Some(cell) = row.get(column) {
                    self.inlines(&cell.inlines, depth)?;
                }
                self.push("],\n");
            }
        }
        self.push(")]\n");
        Ok(())
    }

    fn inlines(&mut self, inlines: &[SafeInline], depth: usize) -> WriteResult {
        check_depth(depth)?;
        for inline in inlines {
            self.inline(inline, depth)?;
        }
        Ok(())
    }

    fn wrapped(&mut self, function: &str, children: &[SafeInline], depth: usize) -> WriteResult {
        self.push(&format!("#{function}["));
        self.inlines(children, depth + 1)?;
        self.push("]");
        Ok(())
    }

    fn inline(&mut self, inline: &SafeInline, depth: usize) -> WriteResult {
        match inline {
            SafeInline::Text { value } => self.push(&text(value)),
            SafeInline::Strong { children } => self.wrapped("strong", children, depth)?,
            SafeInline::Emphasis { children } => self.wrapped("emph", children, depth)?,
            SafeInline::Superscript { children } => self.wrapped("super", children, depth)?,
            SafeInline::Subscript { children } => self.wrapped("sub", children, depth)?,
            SafeInline::Mark { children } => self.wrapped("highlight", children, depth)?,
            SafeInline::Code { value } => self.push(&format!("#raw({})", string_literal(value))),
            SafeInline::Math { tex } => match convert_math(tex) {
                Some(math) => self.push(&format!("${math}$")),
                None => self.push(&format!("#raw({})", string_literal(tex))),
            },
            SafeInline::Link {
                target, children, ..
            } => {
                if is_safe_link_target(target) {
                    self.push(&format!("#link({})[", string_literal(target)));
                    if children.is_empty() {
                        self.push(&text(target));
                    } else {
                        self.inlines(children, depth + 1)?;
                    }
                    self.push("]");
                } else {
                    self.inlines(children, depth + 1)?;
                }
            }
            SafeInline::Footnote { children } | SafeInline::Endnote { children } => {
                self.push(&format!(
                    "#text(size: 0.7em, fill: {})[ (",
                    self.theme.muted
                ));
                self.inlines(children, depth + 1)?;
                self.push(")]");
            }
            SafeInline::InlineImage { asset, alt } => match self.asset_path(asset) {
                Some(path) => self.push(&format!(
                    "#box(height: 1em, baseline: 15%, image({}, alt: {}))",
                    string_literal(path),
                    string_literal(alt)
                )),
                None => self.push(&text(alt)),
            },
            SafeInline::Citation { key } => self.push(&text(&format!("[{key}]"))),
        }
        Ok(())
    }
}

fn is_youtube_id(id: &str) -> bool {
    id.len() == 11
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The watch page of a YouTube video; None for files or an invalid ID.
fn youtube_watch_url(video: &SlideVideo) -> Option<String> {
    let VideoSource::Youtube { id } = &video.source else {
        return None;
    };
    let start = video.start.map(|s| format!("&t={s}s")).unwrap_or_default();
    is_youtube_id(id).then(|| format!("https://www.youtube.com/watch?v={id}{start}"))
}

fn video_label(video: &SlideVideo) -> String {
    if let Some(title) = video.title.as_deref().filter(|t| !t.trim().is_empty()) {
        return title.to_string();
    }
    match &video.source {
        VideoSource::File { relative_path } => relative_path
            .rsplit('/')
            .next()
            .unwrap_or(relative_path)
            .to_string(),
        VideoSource::Youtube { .. } => "YouTube video".to_string(),
    }
}

/// Opening/closing Typst for a sized block: alignment, a width-limited
/// block, and a relative font size. Numbers are clamped, never free-form.
fn layout_wrapper(layout: &BlockLayout) -> (String, String) {
    let width = layout
        .width
        .filter(|w| w.is_finite())
        .map(|w| w.clamp(0.1, 1.0));
    let scale = layout
        .scale
        .filter(|s| s.is_finite())
        .map(|s| s.clamp(0.4, 2.0));
    let align = match layout.align {
        Some(BlockAlign::Center) => "center",
        Some(BlockAlign::Right) => "right",
        _ => "left",
    };
    let mut open = format!(
        "#align({align}, block(width: {:.2}%)[\n",
        width.unwrap_or(1.0) * 100.0
    );
    if layout.align.is_some() {
        open.push_str(&format!("#set align({align})\n"));
    }
    if let Some(scale) = scale {
        open.push_str(&format!("#set text(size: {scale:.3}em)\n"));
    }
    (open, "])\n".to_string())
}

/// One column per block when the counts match (the common "left | right"
/// authoring), otherwise contiguous, roughly even groups.
fn split_into_columns(blocks: &[SafeBlock], count: usize) -> Vec<&[SafeBlock]> {
    if blocks.is_empty() {
        return vec![&[]; count];
    }
    let size = blocks.len().div_ceil(count);
    let mut groups: Vec<&[SafeBlock]> = blocks.chunks(size).collect();
    groups.resize(count, &[]);
    groups
}

/// Typst source for the whole deck. `assets` holds the virtual paths the
/// compiler loaded; images outside it render as a visible placeholder.
pub fn write_slide_deck(deck: &SlideDeck, assets: &HashSet<String>) -> Result<String, WriteError> {
    let mut writer = Writer {
        out: String::new(),
        assets,
        theme: Palette::from_theme(&deck.theme),
    };
    writer.preamble(deck);
    if deck.slides.is_empty() {
        writer.push("#page[]\n");
    }
    for (index, slide) in deck.slides.iter().enumerate() {
        let number = index + 1;
        match slide.layout {
            SlideLayout::Title => writer.title_slide(deck, slide)?,
            SlideLayout::Section => writer.section_slide(deck, slide, number)?,
            SlideLayout::Content => writer.content_slide(deck, slide, number)?,
        }
    }
    Ok(writer.out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn string_literals_cannot_escape_into_markup() {
        assert_eq!(string_literal(r#"a"b\c"#), r#""a\"b\\c""#);
        assert_eq!(
            string_literal("// = *x* #y $z$\nnext"),
            "\"// = *x* #y $z$ next\""
        );
        assert_eq!(multiline_string_literal("a\n\"b\""), r#""a\n\"b\"""#);
    }

    #[test]
    fn rejects_invalid_colors_and_languages() {
        assert_eq!(valid_hex("#ABCDEF", "#000000"), "rgb(\"#ABCDEF\")");
        assert_eq!(valid_hex("red\")#x", "#000000"), "rgb(\"#000000\")");
        assert_eq!(code_language(Some("rust")), Some("rust"));
        assert_eq!(code_language(Some("rust\", x: (")), None);
        assert_eq!(language_code("ko-KR"), Some("ko"));
        assert_eq!(language_code("x\""), None);
    }

    #[test]
    fn diagram_paths_match_the_frontend_hash() {
        // Mirrors diagramAssets.test.ts.
        assert_eq!(
            diagram_asset_path("graph TD"),
            "diagrams/af925188acfd5d45.svg"
        );
    }

    #[test]
    fn block_layouts_are_clamped() {
        let layout = BlockLayout {
            width: Some(5.0),
            scale: Some(0.8),
            align: Some(BlockAlign::Center),
        };
        let (open, close) = layout_wrapper(&layout);
        assert_eq!(
            open,
            "#align(center, block(width: 100.00%)[\n#set align(center)\n#set text(size: 0.800em)\n"
        );
        assert_eq!(close, "])\n");
        let (open, _) = layout_wrapper(&BlockLayout {
            width: Some(f64::NAN),
            scale: Some(9.0),
            align: None,
        });
        assert_eq!(
            open,
            "#align(left, block(width: 100.00%)[\n#set text(size: 2.000em)\n"
        );
    }

    #[test]
    fn youtube_links_use_only_validated_ids() {
        let video = |id: &str| SlideVideo {
            at: 0,
            source: VideoSource::Youtube { id: id.into() },
            poster: None,
            title: None,
            start: Some(30),
            layout: None,
        };
        assert_eq!(
            youtube_watch_url(&video("dQw4w9WgXcQ")).as_deref(),
            Some("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s")
        );
        assert_eq!(youtube_watch_url(&video("dQw4w9WgXc\"")), None);
        assert_eq!(youtube_watch_url(&video("short")), None);
    }

    #[test]
    fn splits_columns_evenly() {
        let block = || SafeBlock::ThematicBreak {
            location: crate::safe_document::SafeSourceLocation { line: None },
        };
        let blocks = vec![block(), block(), block()];
        let groups = split_into_columns(&blocks, 2);
        assert_eq!(
            groups.iter().map(|g| g.len()).collect::<Vec<_>>(),
            vec![2, 1]
        );
        let groups = split_into_columns(&blocks[..1], 3);
        assert_eq!(
            groups.iter().map(|g| g.len()).collect::<Vec<_>>(),
            vec![1, 0, 0]
        );
    }
}
