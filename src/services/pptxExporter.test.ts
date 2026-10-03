import { describe, expect, it } from 'vitest';
import { buildPptx } from './pptxExporter';
import { layoutBlocks } from './pptxLayout';
import { parseSlideDeck } from './slideDeckService';

const DECK = `= 발표 제목: 부제목
홍길동
:revdate: 2026-10-03

== 목록과 *강조*
* 첫째 *굵게* 와 \`code\`
** 중첩 항목
. 번호 https://example.com[링크]

[.notes]
--
발표자 노트입니다.
--

== 표와 코드
[cols="1,1"]
|===
| 이름 | 값
| a | 1
|===

[source,rust]
----
fn main() {}
----

[columns]
--
왼쪽

오른쪽
--
`;

async function unzipText(bytes: Uint8Array): Promise<Map<string, string>> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const files = new Map<string, string>();
  for (const name of Object.keys(zip.files)) {
    if (name.endsWith('.xml')) files.set(name, await zip.files[name].async('string'));
  }
  return files;
}

describe('buildPptx', () => {
  it('rejects unresolved images and posters rather than exporting placeholders', async () => {
    for (const content of ['image::missing.png[Missing]', 'video::dQw4w9WgXcQ[youtube,cover=missing.png]']) {
      const deck = await parseSlideDeck(`== Missing\n\n${content}`);
      await expect(buildPptx(deck, null)).rejects.toThrow('Could not render');
    }
  });
  it('writes editable slides with bullets, tables, and speaker notes', async () => {
    const deck = await parseSlideDeck(DECK);
    const files = await unzipText(await buildPptx(deck, null));
    const slides = [...files.keys()].filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slides).toHaveLength(3);
    const second = files.get('ppt/slides/slide2.xml')!;
    expect(second).toContain('첫째 ');
    expect(second).toContain('<a:buChar');
    expect(second).toContain('lvl="1"');
    expect(second).toContain('<a:buAutoNum');
    expect(second).toContain('<a:hlinkClick');
    const third = files.get('ppt/slides/slide3.xml')!;
    expect(third).toContain('<a:tbl>');
    expect(third).toContain('fn main() {}');
    const notes = [...files.entries()].filter(([name]) => name.startsWith('ppt/notesSlides/')).map(([, xml]) => xml);
    expect(notes.join('')).toContain('발표자 노트입니다.');
  });

  it('narrows, centers, and shrinks sized blocks', async () => {
    const deck = await parseSlideDeck('== S\n[.small.center,width=50%]\n|===\n| a | b\n|===\n');
    const [table] = layoutBlocks(
      deck.slides[0].blocks,
      { x: 0, y: 0, w: 12, h: 5 },
      deck.theme,
      deck.slides[0].blockLayouts,
    );
    expect(table.kind).toBe('table');
    expect(table.box).toMatchObject({ x: 3, w: 6 });
    expect(table.kind === 'table' && table.fontSize).toBeCloseTo(deck.theme.bodySize * 0.8 * 0.8);
  });

  it('builds every style', async () => {
    for (const style of ['classic', 'underline', 'banner', 'minimal', 'elegant']) {
      const deck = await parseSlideDeck(`= T\n:slide-style: ${style}\n\n[.section]\n== P\n\n== S\nBody.\n`);
      const files = await unzipText(await buildPptx(deck, null));
      expect(files.get('ppt/slides/slide3.xml')).toContain('Body.');
    }
  });

  it('shrinks fonts when a slide body overflows', async () => {
    const long = Array.from({ length: 40 }, (_, i) => `* Item ${i}`).join('\n');
    const deck = await parseSlideDeck(`== Long\n${long}\n`);
    const [frame] = layoutBlocks(deck.slides[0].blocks, { x: 0, y: 0, w: 12, h: 5.5 }, deck.theme);
    expect(frame.kind).toBe('text');
    expect(frame.kind === 'text' && frame.fontSize).toBeLessThan(deck.theme.bodySize);
  });
});
