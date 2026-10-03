import { expect, it, vi } from 'vitest';
import { readDirectory } from './documentFileAdapter';
import { entryKind, listDirectory } from './explorerEntries';

vi.mock('./documentFileAdapter', () => ({ readDirectory: vi.fn() }));

it('sorts directories first and excludes hidden entries and symlinks', async () => {
  vi.mocked(readDirectory).mockResolvedValue([
    { name: 'demo.MP4', isDirectory: false, isFile: true, isSymlink: false },
    { name: 'slides', isDirectory: true, isFile: false, isSymlink: false },
    { name: '.private', isDirectory: true, isFile: false, isSymlink: false },
    { name: 'escape', isDirectory: true, isFile: false, isSymlink: true },
  ]);
  const entries = await listDirectory('/deck');
  expect(entries.map((entry) => entry.path)).toEqual(['/deck/slides', '/deck/demo.MP4']);
  expect(entries.map(entryKind)).toEqual(['directory', 'video']);
});
