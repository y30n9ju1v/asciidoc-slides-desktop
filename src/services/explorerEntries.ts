import { readDirectory } from './documentFileAdapter';
import { imageMimeType, joinPath } from './deckAssets';
import { videoMimeType } from './slideVideo';

export interface Entry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/** Directories first, then files; hidden entries and symlinks are skipped. */
export async function listDirectory(directory: string): Promise<Entry[]> {
  const entries = await readDirectory(directory);
  return entries
    .filter((entry) => !entry.name.startsWith('.') && !entry.isSymlink)
    .map((entry) => ({ name: entry.name, path: joinPath(directory, entry.name), isDirectory: entry.isDirectory }))
    .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
}

export type EntryKind = 'directory' | 'deck' | 'image' | 'video' | 'other';

export function entryKind(entry: Entry): EntryKind {
  if (entry.isDirectory) return 'directory';
  if (/\.(adoc|asciidoc)$/i.test(entry.name)) return 'deck';
  if (imageMimeType(entry.name) !== null) return 'image';
  return videoMimeType(entry.name) !== null ? 'video' : 'other';
}
