import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { HARD_BREAK } from './hardBreaks';
import { buildPptx } from './pptxExporter';
import { parseSlideDeck } from './slideDeckService';
import { blocksToPlainText } from './safeText';

/** Serializes the blocks without each node's raw `text`, which keeps the author's original characters. */
const firstInlines = async (source: string) => {
  const deck = await parseSlideDeck(`== S\n\n${source}`);
  return JSON.stringify(deck.slides[0].blocks, function (this: Record<string, unknown>, key, value) {
    return key === 'text' && 'inlines' in this ? undefined : value;
  });
};

describe('hard line breaks', () => {
  it('turns " +" line endings into breaks but keeps plain newlines soft', async () => {
    const json = await firstInlines('첫 줄 +\n둘째 줄\n셋째 줄');
    expect(json).toContain(`첫 줄${HARD_BREAK}둘째 줄\\n셋째 줄`);
    expect(json).not.toContain('첫 줄 +');
  });

  it('works after inline formatting and inside lists, tables, quotes, and admonitions', async () => {
    const cases = [
      '*굵게* +\n다음 줄',
      '* 항목 하나 +\n  이어지는 줄',
      '|===\n| 셀 첫 줄 +\n셀 둘째 줄\n|===',
      '[quote]\n____\n인용 +\n둘째\n____',
      'NOTE: 알림 +\n둘째 줄',
      '용어:: 설명 +\n이어짐',
    ];
    for (const source of cases) expect(await firstInlines(source)).toContain(HARD_BREAK);
  });

  it('leaves code, spans, and other uses of plus alone', async () => {
    const json = await firstInlines('`a + b`\n\n1 + 2 = 3\n\n[source]\n----\nx +\ny\n----');
    expect(json).not.toContain(HARD_BREAK);
    expect(json).toContain('x +\\ny');
    expect(json).toContain('1 + 2 = 3');
  });

  it('shows up as a newline in speaker notes', async () => {
    const deck = await parseSlideDeck('== S\n\n[.notes]\n--\n첫 줄 +\n둘째 줄\n--');
    expect(deck.slides[0].notes).toBe('첫 줄\n둘째 줄');
    expect(blocksToPlainText(deck.slides[0].blocks)).toBe('');
  });

  it('exports a break inside the same PowerPoint paragraph', async () => {
    const deck = await parseSlideDeck('== S\n\n첫 줄 +\n둘째 줄\n\n새 문단');
    const zip = await JSZip.loadAsync(await buildPptx(deck, null));
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const paragraph = xml.split('<a:p>').find((part) => part.includes('첫 줄'))!;
    expect(paragraph).toContain('<a:br');
    expect(paragraph).toContain('둘째 줄');
    expect(paragraph).not.toContain('새 문단');
    expect(xml).not.toContain(HARD_BREAK);
  });
});
