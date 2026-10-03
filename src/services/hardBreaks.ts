import type { SafeBlock, SafeInline } from '../../packages/asciidoc-typst/typescript/src';

/**
 * AsciiDoc's forced line break (a line ending in " +") has no SafeInline node
 * of its own - the shared model is a separate project - so the slide model
 * carries it inside text values as U+2028 (LINE SEPARATOR). Every output
 * renders that character as a break: the preview as <br>, PPTX as a soft
 * break inside the paragraph, PDF as `#linebreak()`. Ordinary newlines
 * remain soft wraps. `slide_writer.rs` mirrors the constant.
 */
export const HARD_BREAK = ' ';

const HARD_BREAK_RE = / \+\n[ \t]*/g;

function expandInline(inline: SafeInline): SafeInline {
  if (inline.type === 'text') return { ...inline, value: inline.value.replace(HARD_BREAK_RE, HARD_BREAK) };
  if ('children' in inline) return { ...inline, children: inline.children.map(expandInline) };
  return inline;
}

const expandInlines = (inlines: SafeInline[]) => inlines.map(expandInline);

function expandBlock(block: SafeBlock): SafeBlock {
  switch (block.type) {
    case 'paragraph':
    case 'quote':
    case 'admonition':
      return { ...block, inlines: expandInlines(block.inlines) };
    case 'list':
      return {
        ...block,
        items: block.items.map((item) => ({
          ...item,
          inlines: expandInlines(item.inlines),
          blocks: expandHardBreaks(item.blocks),
        })),
      };
    case 'descriptionList':
      return {
        ...block,
        items: block.items.map((item) => ({
          ...item,
          termInlines: expandInlines(item.termInlines),
          descriptionInlines: expandInlines(item.descriptionInlines),
          descriptionBlocks: expandHardBreaks(item.descriptionBlocks),
        })),
      };
    case 'table':
      return {
        ...block,
        rows: block.rows.map((row) => row.map((cell) => ({ ...cell, inlines: expandInlines(cell.inlines) }))),
      };
    default:
      return 'blocks' in block ? { ...block, blocks: expandHardBreaks(block.blocks) } : block;
  }
}

/**
 * Turns " +" line endings in prose text into hard breaks everywhere inlines
 * occur (paragraphs, quotes, admonitions, lists, description lists, table
 * cells, nested containers). Code, math, and literal text are untouched.
 */
export function expandHardBreaks(blocks: SafeBlock[]): SafeBlock[] {
  return blocks.map(expandBlock);
}

/** Splits text into the segments between hard breaks. */
export function splitHardBreaks(value: string): string[] {
  return value.split(HARD_BREAK);
}
