import type { SafeBlock, SafeInline } from '../../packages/asciidoc-typst/typescript/src';

/**
 * Exhaustive per-variant handler tables for SafeDocument nodes. A table
 * keeps each renderer's mapping flat (one small function per block type)
 * and the compiler reports any variant a renderer forgets.
 */
export type BlockOf<K extends SafeBlock['type']> = Extract<SafeBlock, { type: K }>;
export type InlineOf<K extends SafeInline['type']> = Extract<SafeInline, { type: K }>;

export type BlockHandlers<R, C = void> = { [K in SafeBlock['type']]: (block: BlockOf<K>, context: C) => R };
export type InlineHandlers<R, C = void> = { [K in SafeInline['type']]: (inline: InlineOf<K>, context: C) => R };

export function dispatchBlock<R, C>(handlers: BlockHandlers<R, C>, block: SafeBlock, context: C): R {
  return (handlers[block.type] as (block: SafeBlock, context: C) => R)(block, context);
}

export function dispatchInline<R, C>(handlers: InlineHandlers<R, C>, inline: SafeInline, context: C): R {
  return (handlers[inline.type] as (inline: SafeInline, context: C) => R)(inline, context);
}
