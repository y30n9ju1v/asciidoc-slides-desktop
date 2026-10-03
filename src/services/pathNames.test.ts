import { describe, expect, it } from 'vitest';
import { baseName, fileExtension, ownValue, stemName } from './pathNames';
import { imageMimeType } from './deckAssets';
import { videoMimeType } from './slideVideo';

describe('pathNames', () => {
  it('reads the last component with either separator', () => {
    expect(baseName('/Users/me/deck/slides.adoc')).toBe('slides.adoc');
    expect(baseName('C:\\deck\\slides.adoc')).toBe('slides.adoc');
    expect(baseName('/Users/me/deck/')).toBe('deck');
    expect(baseName('')).toBe('');
  });

  it('only treats a dot inside the last component as an extension', () => {
    expect(fileExtension('images/Chart.PNG')).toBe('png');
    expect(fileExtension('png')).toBe('');
    expect(fileExtension('.hidden')).toBe('');
    expect(fileExtension('v1.2/notes')).toBe('');
    expect(stemName('/talks/deck.v2.adoc')).toBe('deck.v2');
    expect(stemName('/talks/README')).toBe('README');
  });

  it('never resolves inherited object keys', () => {
    expect(ownValue({ png: 'image/png' }, 'constructor')).toBeNull();
    expect(imageMimeType('x.constructor')).toBeNull();
    expect(imageMimeType('png')).toBeNull();
    expect(videoMimeType('clip.toString')).toBeNull();
    expect(imageMimeType('a/b.SVG')).toBe('image/svg+xml');
    expect(videoMimeType('clip.MOV')).toBe('video/quicktime');
  });
});
