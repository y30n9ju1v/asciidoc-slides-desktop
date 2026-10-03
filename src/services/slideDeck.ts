import type { SafeBlock, SafeDiagnostic } from '../../packages/asciidoc-typst/typescript/src';
import type { SlideStyle } from './slideStyles';
import type { SlideTheme } from './slideThemes';

/**
 * The serializable contract between the AsciiDoc parser and every slide
 * output (live preview, PPTX, native PDF). Slide bodies reuse the
 * SafeDocument block vocabulary from `packages/asciidoc-typst`, so a slide
 * carries document *data* only - never HTML, DOM nodes, or Typst source.
 * `src-tauri/src/slide_deck.rs` is the Rust mirror of this shape.
 */
export const SLIDE_DECK_VERSION = 1;

/** 16:9 at PowerPoint's default "widescreen" size: 13.333in x 7.5in. */
export const SLIDE_WIDTH_IN = 13.333;
export const SLIDE_HEIGHT_IN = 7.5;
/** Logical preview pixels per inch; 1pt = 1/72in, so 1pt = 4/3px. */
export const PX_PER_IN = 96;
export const SLIDE_WIDTH_PX = Math.round(SLIDE_WIDTH_IN * PX_PER_IN);
export const SLIDE_HEIGHT_PX = Math.round(SLIDE_HEIGHT_IN * PX_PER_IN);

export function ptToPx(pt: number): number {
  return (pt * PX_PER_IN) / 72;
}

export type SlideLayout = 'title' | 'section' | 'content';

/**
 * Author-controlled sizing of one top-level slide block, from AsciiDoc
 * roles and attributes: `[.small]`, `[.large]`, `[.center]`,
 * `[width=60%]`, `[font-size=80%]`.
 */
export interface BlockLayout {
  /** Fraction of the slide body width, 0.1-1. */
  width: number | null;
  /** Font-size multiplier, 0.4-2. */
  scale: number | null;
  align: 'left' | 'center' | 'right' | null;
}

export type VideoSource = { kind: 'file'; relativePath: string } | { kind: 'youtube'; id: string };

/**
 * A `video::` block placed directly on a slide. SafeDocument has no video
 * block, so videos travel beside `blocks` and are drawn before `blocks[at]`
 * (`at === blocks.length` means after the last block).
 */
export interface SlideVideo {
  at: number;
  source: VideoSource;
  /** Document-relative poster image (`poster=` for files, `cover=` for either). */
  poster: string | null;
  /** The block title (`.Title` above the macro). */
  title: string | null;
  /** Start offset in whole seconds. */
  start: number | null;
  layout: BlockLayout | null;
}

export interface Slide {
  layout: SlideLayout;
  title: string;
  /** Second title line, shown only by the title layout. */
  subtitle: string;
  /** Hides the title bar of a content slide (`[%notitle]`). */
  hideTitle: boolean;
  blocks: SafeBlock[];
  /** Parallel to `blocks`: sizing for each top-level block, or null. */
  blockLayouts: (BlockLayout | null)[];
  videos: SlideVideo[];
  /** Plain-text speaker notes from `[.notes]` blocks and `[NOTE.speaker]`. */
  notes: string;
  /** 1-based source line of the slide's heading, for editor navigation. */
  line: number | null;
}

export interface SlideDeckMetadata {
  title: string;
  subtitle: string;
  author: string;
  date: string;
  language: string;
}

export interface SlideDeck {
  version: typeof SLIDE_DECK_VERSION;
  metadata: SlideDeckMetadata;
  theme: SlideTheme;
  style: SlideStyle;
  slides: Slide[];
  diagnostics: SafeDiagnostic[];
}
