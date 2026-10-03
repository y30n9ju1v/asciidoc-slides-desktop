import type { SafeBlock, SafeInline } from '../../packages/asciidoc-typst/typescript/src';
import { fileExtension, ownValue } from './pathNames';
import type { SlideDeck } from './slideDeck';

/** Visits every block in a block tree, including list items, table cells' parents, and containers. */
export function walkBlocks(blocks: SafeBlock[], visit: (block: SafeBlock) => void): void {
  for (const block of blocks) {
    visit(block);
    switch (block.type) {
      case 'section':
      case 'container':
      case 'formal':
      case 'columns':
      case 'documentPart':
        walkBlocks(block.blocks, visit);
        break;
      case 'list':
        block.items.forEach((item) => walkBlocks(item.blocks, visit));
        break;
      case 'descriptionList':
        block.items.forEach((item) => walkBlocks(item.descriptionBlocks, visit));
        break;
    }
  }
}

function inlineImagePaths(inlines: SafeInline[], paths: Set<string>): void {
  for (const inline of inlines) {
    if (inline.type === 'inlineImage') {
      if (inline.asset.kind === 'document-relative') paths.add(inline.asset.relativePath);
    } else if ('children' in inline) {
      inlineImagePaths(inline.children, paths);
    }
  }
}

export function blockInlines(block: SafeBlock): SafeInline[][] {
  switch (block.type) {
    case 'paragraph':
    case 'quote':
    case 'admonition':
      return [block.inlines];
    case 'list':
      return block.items.map((item) => item.inlines);
    case 'descriptionList':
      return block.items.flatMap((item) => [item.termInlines, item.descriptionInlines]);
    case 'table':
      return block.rows.flatMap((row) => row.map((cell) => cell.inlines));
    default:
      return [];
  }
}

function eachDeckBlock(deck: SlideDeck, visit: (block: SafeBlock) => void): void {
  deck.slides.forEach((slide) => walkBlocks(slide.blocks, visit));
}

/** Document-relative image paths (block and inline) referenced anywhere in the deck. */
export function deckImagePaths(deck: SlideDeck): string[] {
  const paths = new Set<string>();
  deck.slides.forEach((slide) => {
    if (slide.backgroundImage) paths.add(slide.backgroundImage);
  });
  eachDeckBlock(deck, (block) => {
    if (block.type === 'image' && block.asset.kind === 'document-relative') paths.add(block.asset.relativePath);
    blockInlines(block).forEach((inlines) => inlineImagePaths(inlines, paths));
  });
  deckPosterPaths(deck).forEach((path) => paths.add(path));
  return [...paths];
}

/** Video posters the deck references, for the PDF writer and the PPTX cover images. */
export function deckPosterPaths(deck: SlideDeck): string[] {
  return deck.slides.flatMap((slide) => slide.videos.flatMap((video) => (video.poster ? [video.poster] : [])));
}

/** Mermaid sources in the deck, de-duplicated. */
export function deckDiagramSources(deck: SlideDeck): string[] {
  const sources = new Set<string>();
  eachDeckBlock(deck, (block) => {
    if (block.type === 'diagram') sources.add(block.code);
  });
  return [...sources];
}

/**
 * FNV-1a 64 of the UTF-8 diagram source - the virtual path the native PDF
 * writer derives independently (`slide_writer.rs::diagram_asset_path`).
 */
export function diagramAssetPath(code: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(code)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `diagrams/${hash.toString(16).padStart(16, '0')}.svg`;
}

export function directoryOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index > 0 ? path.slice(0, index) : path;
}

export function joinPath(directory: string, relative: string): string {
  const separator = directory.includes('\\') && !directory.includes('/') ? '\\' : '/';
  return `${directory.replace(/[\\/]+$/, '')}${separator}${relative}`;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

export function imageMimeType(path: string): string | null {
  return ownValue(MIME_BY_EXTENSION, fileExtension(path));
}

/**
 * `path` relative to the deck's folder with forward slashes, or null when it
 * is outside that folder (image targets may not use `..`).
 */
export function pathRelativeTo(directory: string, path: string): string | null {
  const base = directory.replace(/[\\/]+$/, '');
  if (!path.startsWith(base) || !/[\\/]/.test(path.charAt(base.length))) return null;
  return path.slice(base.length + 1).replace(/\\/g, '/');
}
