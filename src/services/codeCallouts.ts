import type { SafeBlock } from '../../packages/asciidoc-typst/typescript/src';

/** Keep adjacent listings and explanation lists together through SafeDocument normalization. */
export function groupCodeCallouts<T extends { context?: string }>(nodes: T[]): T[][] {
  const groups: T[][] = [];
  for (const node of nodes) {
    const previous = groups[groups.length - 1];
    if (node.context === 'colist' && previous?.length === 1 && previous[0].context === 'listing') {
      previous.push(node);
    } else groups.push([node]);
  }
  return groups;
}

/** Lower callouts to ordinary safe code/paragraphs so all three outputs share the same numbering. */
export function expandCodeCallouts(blocks: SafeBlock[]): SafeBlock[] {
  return blocks.flatMap(expandBlock);
}

function expandBlock(block: SafeBlock): SafeBlock[] {
  if (block.type === 'code' && block.callouts?.length) {
    const { callouts: parsedCallouts, ...code } = block;
    // Asciidoctor coids identify occurrences, not displayed numbers (one number may occur twice).
    const callouts = parsedCallouts.map((item, index) => ({ ...item, number: index + 1 }));
    let automatic = 0;
    const numbers = new Set(callouts.map((item) => item.number));
    const source = code.code.replace(/(?:<(?:\d+|\.)>[ \t]*)+$/gm, (markers) =>
      markers.replace(/<(\d+|\.)>/g, (marker, value: string) => {
        const number = value === '.' ? ++automatic : Number(value);
        return numbers.has(number) ? `(${number})` : marker;
      }),
    );
    return [
      { ...code, code: source },
      ...callouts.map((item): SafeBlock => ({
        type: 'paragraph',
        text: `(${item.number}) ${item.text}`,
        inlines: [{ type: 'text', value: `(${item.number}) ` }, ...item.inlines],
        location: block.location,
      })),
    ];
  }
  if ('blocks' in block) return [{ ...block, blocks: expandCodeCallouts(block.blocks) }];
  if (block.type === 'list') {
    return [{ ...block, items: block.items.map((item) => ({ ...item, blocks: expandCodeCallouts(item.blocks) })) }];
  }
  return [block];
}
