//! Rust mirror of `src/services/slideDeck.ts` and the PDF request built by
//! `src/services/pdfExporter.ts`. Slide bodies reuse the SafeDocument block
//! vocabulary from the `asciidoc-typst` submodule, so the WebView only ever
//! hands this side *data* - never Typst source.
use crate::safe_document::SafeBlock;
use serde::Deserialize;

pub const SUPPORTED_DECK_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SlideLayout {
    Title,
    Section,
    Content,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BlockAlign {
    Left,
    Center,
    Right,
}

/// Author-set sizing of one top-level block; the writer clamps both numbers.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockLayout {
    pub width: Option<f64>,
    pub scale: Option<f64>,
    pub align: Option<BlockAlign>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Slide {
    pub layout: SlideLayout,
    pub title: String,
    pub subtitle: String,
    pub hide_title: bool,
    pub blocks: Vec<SafeBlock>,
    /// Parallel to `blocks`; missing entries mean "no sizing".
    #[serde(default)]
    pub block_layouts: Vec<Option<BlockLayout>>,
    /// Videos drawn before `blocks[at]`; see `slideItems.ts`.
    #[serde(default)]
    pub videos: Vec<SlideVideo>,
    #[allow(dead_code)]
    pub notes: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum VideoSource {
    File {
        #[serde(rename = "relativePath")]
        relative_path: String,
    },
    /// Re-validated by the writer before it becomes part of a URL.
    Youtube { id: String },
}

/// A video placed directly on a slide. PDF cannot play it, so the writer
/// draws its poster with a play badge and, for YouTube, a link to it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideVideo {
    pub at: usize,
    pub source: VideoSource,
    pub poster: Option<String>,
    pub title: Option<String>,
    pub start: Option<u32>,
    pub layout: Option<BlockLayout>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideDeckMetadata {
    pub title: String,
    #[allow(dead_code)]
    pub subtitle: String,
    pub author: String,
    pub date: String,
    pub language: String,
}

/// Colors arrive as strings and are re-validated as `#rrggbb` by the writer
/// before they are interpolated; sizes are clamped there too.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideTheme {
    pub background: String,
    pub text: String,
    pub muted: String,
    pub accent: String,
    pub hero_background: String,
    pub hero_text: String,
    pub code_background: String,
    pub code_text: String,
    pub table_header_background: String,
    pub table_header_text: String,
    pub table_border: String,
    pub title_size: f64,
    pub body_size: f64,
    pub code_size: f64,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StyleFont {
    Sans,
    Serif,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TitleDecoration {
    None,
    Underline,
    Band,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HeroAlign {
    Left,
    Center,
}

/// Mirror of `slideStyles.ts`: closed enums only, so nothing free-form
/// reaches the Typst source.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideStyle {
    pub font: StyleFont,
    pub title_decoration: TitleDecoration,
    pub hero_fill: bool,
    pub hero_align: HeroAlign,
}

impl Default for SlideStyle {
    fn default() -> Self {
        Self {
            font: StyleFont::Sans,
            title_decoration: TitleDecoration::None,
            hero_fill: true,
            hero_align: HeroAlign::Left,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideDeck {
    pub version: u32,
    pub metadata: SlideDeckMetadata,
    pub theme: SlideTheme,
    #[serde(default)]
    pub style: SlideStyle,
    pub slides: Vec<Slide>,
}

/// A Mermaid diagram the frontend already rendered to SVG text, keyed by the
/// virtual path the writer derives from the diagram source.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagramAsset {
    pub path: String,
    pub svg: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlidePdfRequest {
    pub deck: SlideDeck,
    /// The folder of the open deck file. Re-checked against the fs plugin's
    /// dialog-granted scope before any image is read from it.
    pub document_root: Option<String>,
    /// Document-relative image paths the deck references.
    #[serde(default)]
    pub assets: Vec<String>,
    #[serde(default)]
    pub diagrams: Vec<DiagramAsset>,
}
