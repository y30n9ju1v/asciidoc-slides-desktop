import { describe, expect, it } from 'vitest';
import {
  deckDiagramSources,
  deckImagePaths,
  diagramAssetPath,
  directoryOf,
  joinPath,
  pathRelativeTo,
} from './deckAssets';
import { parseSlideDeck } from './slideDeckService';

describe('deckAssets', () => {
  it('hashes diagram sources exactly like the native writer', () => {
    // Mirrors slide_writer.rs::diagram_paths_match_the_frontend_hash.
    expect(diagramAssetPath('graph TD')).toBe('diagrams/af925188acfd5d45.svg');
  });

  it('collects block, nested, and inline images plus diagrams', async () => {
    const deck = await parseSlideDeck(
      '= T\n\n== A\nimage::images/a.png[A]\n\n* item image:icons/i.png[I]\n\n[columns]\n--\nimage::images/b.png[B]\n--\n\n== B\n[source,mermaid]\n----\ngraph TD\n----\n',
    );
    expect(deckImagePaths(deck).sort()).toEqual(['icons/i.png', 'images/a.png', 'images/b.png']);
    expect(deckDiagramSources(deck)).toEqual(['graph TD']);
  });

  it('joins and splits paths', () => {
    expect(directoryOf('/Users/me/deck/slides.adoc')).toBe('/Users/me/deck');
    expect(joinPath('/Users/me/deck/', 'images/a.png')).toBe('/Users/me/deck/images/a.png');
    expect(joinPath('C:\\deck', 'a.png')).toBe('C:\\deck\\a.png');
  });

  it('makes tree paths relative to the deck folder', () => {
    expect(pathRelativeTo('/deck', '/deck/images/a.png')).toBe('images/a.png');
    expect(pathRelativeTo('/deck/', '/deck/a.png')).toBe('a.png');
    expect(pathRelativeTo('/deck', '/deck-other/a.png')).toBeNull();
    expect(pathRelativeTo('/deck/sub', '/deck/a.png')).toBeNull();
  });
});
