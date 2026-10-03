import type { SafeBlock, SafeInline } from '../../packages/asciidoc-typst/typescript/src';
import { dispatchBlock, dispatchInline, type BlockHandlers, type InlineHandlers } from './safeDispatch';

const children = (inline: { children: SafeInline[] }) => inlinesToPlainText(inline.children);
const note = (inline: { children: SafeInline[] }) => ` (${inlinesToPlainText(inline.children)})`;

const INLINE_TEXT: InlineHandlers<string> = {
  text: (inline) => inline.value,
  code: (inline) => inline.value,
  math: (inline) => inline.tex,
  inlineImage: (inline) => inline.alt,
  citation: (inline) => `[${inline.key}]`,
  footnote: note,
  endnote: note,
  strong: children,
  emphasis: children,
  link: children,
  superscript: children,
  subscript: children,
  mark: children,
};

/** Flattens closed inline nodes to the text a reader sees. */
export function inlinesToPlainText(inlines: SafeInline[]): string {
  return inlines.map((inline) => dispatchInline(INLINE_TEXT, inline, undefined)).join('');
}

const prose = (block: { inlines: SafeInline[] }, indent: string) => indent + inlinesToPlainText(block.inlines);
const nested = (block: { blocks: SafeBlock[] }, indent: string) => blocksToPlainText(block.blocks, indent);
const none = () => '';

const BLOCK_TEXT: BlockHandlers<string, string> = {
  paragraph: prose,
  quote: prose,
  admonition: prose,
  list: (block, indent) =>
    block.items
      .map((item, index) => {
        const marker = block.ordered ? `${index + 1}.` : '-';
        const line = `${indent}${marker} ${inlinesToPlainText(item.inlines)}`;
        const children = blocksToPlainText(item.blocks, `${indent}  `);
        return children ? `${line}\n${children}` : line;
      })
      .join('\n'),
  descriptionList: (block, indent) =>
    block.items.map((item) => `${indent}${item.term}: ${inlinesToPlainText(item.descriptionInlines)}`).join('\n'),
  code: (block) => block.code,
  diagram: (block) => block.code,
  mathBlock: (block) => block.tex,
  table: (block) => block.rows.map((row) => row.map((cell) => cell.text).join('\t')).join('\n'),
  image: (block) => block.alt,
  section: (block, indent) =>
    [indent + block.title, blocksToPlainText(block.blocks, indent)].filter(Boolean).join('\n'),
  container: nested,
  formal: nested,
  columns: nested,
  documentPart: nested,
  thematicBreak: none,
  pageBreak: none,
};

/** Plain text of a block tree, one paragraph per line - used for speaker notes. */
export function blocksToPlainText(blocks: SafeBlock[], indent = ''): string {
  return blocks
    .map((block) => dispatchBlock(BLOCK_TEXT, block, indent))
    .filter((text) => text.length > 0)
    .join('\n');
}
