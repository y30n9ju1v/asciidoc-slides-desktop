import { expect, it } from 'vitest';
import { parseSlideDeck } from './slideDeckService';
import { inspectExport } from './exportPreflight';

it('reports equations and inline images with affected slides and remedies', async () => {
  const deck = await parseSlideDeck(
    '== Equations\n\nstem:[x^2] and image:chart.png[Chart]\n\n== More\n\n[stem]\n++++\ny^2\n++++',
  );
  const issues = inspectExport(deck, 'pptx');
  expect(issues.map((issue) => issue.message).join('\n')).toContain('Slide 1 (Equations)');
  expect(issues.map((issue) => issue.message).join('\n')).toContain('inline images');
  expect(issues.map((issue) => issue.message).join('\n')).toContain('Slide 2 (More)');
  expect(inspectExport(deck, 'pdf')).toEqual([]);
});

it('finds inline content in lists, tables and nested formatting', async () => {
  const deck = await parseSlideDeck('== S\n\n* stem:[x] and image:icon.png[Icon]\n\n|===\n| stem:[y]\n|===');
  expect(inspectExport(deck, 'pptx')).toHaveLength(2);
});

it('blocks empty decks and carries parser errors through preflight', async () => {
  const deck = await parseSlideDeck('');
  expect(inspectExport(deck, 'pdf')).toEqual([{ severity: 'error', message: 'Add a slide before exporting.' }]);
  const unsafe = await parseSlideDeck('== S\n\n++++\n<script>bad()</script>\n++++');
  expect(inspectExport(unsafe, 'pptx').some((issue) => issue.severity === 'error')).toBe(true);
});
