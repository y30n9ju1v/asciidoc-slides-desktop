import { describe, expect, it } from 'vitest';
import { isSafeLinkTarget, splitIntoColumns } from './slideRules';

describe('slideRules', () => {
  it('allows only web and mail link targets', () => {
    expect(isSafeLinkTarget('https://example.com')).toBe(true);
    expect(isSafeLinkTarget('MAILTO:a@b.c')).toBe(true);
    for (const target of ['javascript:alert(1)', 'file:///etc/passwd', '#anchor', 'chapter.adoc', ' https://x']) {
      expect(isSafeLinkTarget(target)).toBe(false);
    }
  });

  it('splits blocks into exactly the requested number of columns', () => {
    expect(splitIntoColumns([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(splitIntoColumns([1], 3)).toEqual([[1], [], []]);
    expect(splitIntoColumns([], 2)).toEqual([[], []]);
  });
});
