import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { chooseExportFile, confirmExportWarnings, writeBinaryFile } from './documentFileAdapter';
import { buildPptx } from './pptxExporter';
import { parseSlideDeck } from './slideDeckService';
import { clearImageCache } from './imageStore';
import { exportDocument } from './exportService';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('./documentFileAdapter');
vi.mock('./pptxExporter', () => ({ buildPptx: vi.fn() }));
vi.mock('./imageStore', () => ({ clearImageCache: vi.fn() }));
vi.mock('./mermaidRenderer', () => ({ renderMermaidSvg: vi.fn() }));
vi.mock('./slideDeckService');
const realParser = await vi.importActual<typeof import('./slideDeckService')>('./slideDeckService');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(parseSlideDeck).mockImplementation(realParser.parseSlideDeck);
  vi.mocked(chooseExportFile).mockResolvedValue('/out.pptx');
  vi.mocked(confirmExportWarnings).mockResolvedValue(true);
  vi.mocked(buildPptx).mockResolvedValue(new Uint8Array([1]));
});

it('parses the captured current source and uses its matching asset root', async () => {
  await exportDocument('pptx', { text: '== Latest\nnew edit', path: '/B/deck.adoc', documentDir: '/B' });
  expect(parseSlideDeck).toHaveBeenCalledWith('== Latest\nnew edit');
  expect(buildPptx).toHaveBeenCalledWith(
    expect.objectContaining({ slides: [expect.objectContaining({ title: 'Latest' })] }),
    '/B',
  );
  expect(chooseExportFile).toHaveBeenCalledWith('deck.pptx', 'PowerPoint', ['pptx']);
  expect(clearImageCache).toHaveBeenCalledOnce();
  expect(writeBinaryFile).toHaveBeenCalledOnce();
});

it('does not export an older preview when parsing fails', async () => {
  vi.mocked(parseSlideDeck).mockRejectedValueOnce(new Error('parse failed'));
  await expect(exportDocument('pptx', { text: 'broken', path: null, documentDir: null })).rejects.toThrow(
    'parse failed',
  );
  expect(chooseExportFile).not.toHaveBeenCalled();
  expect(buildPptx).not.toHaveBeenCalled();
});

it('lets users cancel a lossy PPTX before choosing or writing an output', async () => {
  vi.mocked(confirmExportWarnings).mockResolvedValue(false);
  expect(
    await exportDocument('pptx', { text: '== S\n\nstem:[x] and image:icon.png[Icon]', path: null, documentDir: null }),
  ).toBeNull();
  expect(confirmExportWarnings).toHaveBeenCalledWith(
    expect.arrayContaining([expect.stringContaining('equations'), expect.stringContaining('inline images')]),
  );
  expect(chooseExportFile).not.toHaveBeenCalled();
  expect(writeBinaryFile).not.toHaveBeenCalled();
});

it('writes only after warnings are accepted and handles picker cancellation', async () => {
  const snapshot = { text: '== S\n\nstem:[x]', path: null, documentDir: null };
  await exportDocument('pptx', snapshot);
  expect(writeBinaryFile).toHaveBeenCalledOnce();
  vi.mocked(chooseExportFile).mockResolvedValue(null);
  expect(await exportDocument('pptx', snapshot)).toBeNull();
  expect(writeBinaryFile).toHaveBeenCalledOnce();
});

it('blocks error diagnostics rather than asking to bypass them', async () => {
  await expect(
    exportDocument('pdf', { text: '== S\n\n++++\n<script>bad()</script>\n++++', path: null, documentDir: null }),
  ).rejects.toThrow();
  expect(confirmExportWarnings).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

it('passes the captured source and root to PDF and propagates write failures', async () => {
  await exportDocument('pdf', { text: '== PDF\ncontent', path: '/B/deck.adoc', documentDir: '/B' });
  expect(invoke).toHaveBeenCalledWith('export_slides_pdf', {
    outputPath: '/out.pptx',
    requestJson: expect.stringContaining('"documentRoot":"/B"'),
  });
  vi.mocked(writeBinaryFile).mockRejectedValueOnce(new Error('disk full'));
  await expect(exportDocument('pptx', { text: '== S\ncontent', path: null, documentDir: null })).rejects.toThrow(
    'disk full',
  );
});
