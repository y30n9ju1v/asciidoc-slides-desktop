import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ask } from '@tauri-apps/plugin-dialog';
import * as files from '../services/documentFileAdapter';
import { deferred, renderHook } from '../test/renderHook';
import { useDocument } from './useDocument';

vi.mock('../services/documentFileAdapter');
vi.mock('../services/imageStore', () => ({ clearImageCache: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested: async () => () => {} }) }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ask).mockResolvedValue(true);
  vi.mocked(files.takeLaunchDocument).mockResolvedValue(null);
  vi.mocked(files.onLaunchDocument).mockResolvedValue(() => {});
  vi.mocked(files.readDocumentText).mockImplementation(async (path) => `${path} content`);
  vi.mocked(files.chooseDocumentSavePath).mockResolvedValue('/A-copy.adoc');
  vi.mocked(files.writeDocumentText).mockResolvedValue();
});

describe('document operation ownership', () => {
  it.each(['save', 'saveAs'] as const)('does not apply a late %s to another document', async (action) => {
    const hook = await renderHook(useDocument);
    await act(async () => hook.current.openPath('/A.adoc'));
    const write = deferred<void>();
    vi.mocked(files.writeDocumentText).mockReturnValueOnce(write.promise);
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = hook.current[action]();
    });
    await act(async () => hook.current.openPath('/B.adoc'));
    await act(async () => {
      write.resolve();
      await pending;
    });
    expect(hook.current).toMatchObject({ path: '/B.adoc', text: '/B.adoc content', isDirty: false });
    await act(async () => hook.current.save());
    expect(files.writeDocumentText).toHaveBeenLastCalledWith('/B.adoc', '/B.adoc content', '/B.adoc content');
  });

  it('preserves newer edits while marking only the saved snapshot as baseline', async () => {
    const hook = await renderHook(useDocument);
    await act(async () => hook.current.openPath('/A.adoc'));
    await act(async () => hook.current.setText('saved revision'));
    const write = deferred<void>();
    vi.mocked(files.writeDocumentText).mockReturnValueOnce(write.promise);
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = hook.current.save();
    });
    await act(async () => hook.current.setText('newer revision'));
    await act(async () => {
      write.resolve();
      await pending;
    });
    expect(hook.current).toMatchObject({ text: 'newer revision', isDirty: true });
    await act(async () => hook.current.save());
    expect(files.writeDocumentText).toHaveBeenLastCalledWith('/A.adoc', 'newer revision', 'saved revision');
  });

  it('ignores older file reads arriving after a newer selection', async () => {
    const hook = await renderHook(useDocument);
    const read = deferred<string>();
    vi.mocked(files.readDocumentText).mockReturnValueOnce(read.promise);
    let pending!: Promise<void>;
    await act(async () => {
      pending = hook.current.openPath('/A.adoc');
    });
    await act(async () => hook.current.openPath('/B.adoc'));
    await act(async () => {
      read.resolve('A');
      await pending;
    });
    expect(hook.current.path).toBe('/B.adoc');
  });

  it('does not replace edits made while a file is loading', async () => {
    const hook = await renderHook(useDocument);
    const read = deferred<string>();
    vi.mocked(files.readDocumentText).mockReturnValueOnce(read.promise);
    let pending!: Promise<void>;
    await act(async () => {
      pending = hook.current.openPath('/A.adoc');
    });
    await act(async () => hook.current.setText('keep this'));
    await act(async () => {
      read.resolve('A');
      await pending;
    });
    expect(hook.current).toMatchObject({ text: 'keep this', path: null, isDirty: true });
  });

  it('cancels Save As if the document changes while choosing its destination', async () => {
    const hook = await renderHook(useDocument);
    const picker = deferred<string | null>();
    vi.mocked(files.chooseDocumentSavePath).mockReturnValueOnce(picker.promise);
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = hook.current.saveAs();
    });
    await act(async () => hook.current.openPath('/B.adoc'));
    await act(async () => {
      picker.resolve('/A-copy.adoc');
      expect(await pending).toBe(false);
    });
    expect(files.writeDocumentText).not.toHaveBeenCalled();
  });

  it('keeps dirty content on failed saves and permits retry', async () => {
    const hook = await renderHook(useDocument);
    await act(async () => hook.current.openPath('/A.adoc'));
    await act(async () => hook.current.setText('edited'));
    vi.mocked(files.writeDocumentText).mockRejectedValueOnce(new Error('conflict'));
    await act(async () => {
      await expect(hook.current.save()).rejects.toThrow('conflict');
    });
    expect(hook.current.isDirty).toBe(true);
    await act(async () => hook.current.save());
    expect(hook.current.isDirty).toBe(false);
  });

  it('checks unsaved edits when a deck is chosen from the folder dialog', async () => {
    const hook = await renderHook(useDocument);
    await act(async () => hook.current.setText('unsaved'));
    vi.mocked(ask).mockResolvedValue(false);
    await act(async () => hook.current.openPath('/B.adoc'));
    expect(files.readDocumentText).not.toHaveBeenCalled();
    expect(hook.current.text).toBe('unsaved');
  });
});

describe('decks handed over by the OS', () => {
  it('opens a deck delivered while running, after asking about unsaved work', async () => {
    let deliver!: () => void;
    vi.mocked(files.onLaunchDocument).mockImplementation(async (handler) => {
      deliver = handler;
      return () => {};
    });
    const hook = await renderHook(useDocument);
    await act(async () => hook.current.setText('edited'));
    vi.mocked(ask).mockResolvedValueOnce(false);
    vi.mocked(files.takeLaunchDocument).mockResolvedValueOnce('/Finder.adoc');
    await act(async () => deliver());
    expect(hook.current).toMatchObject({ path: null, text: 'edited' });
    vi.mocked(files.takeLaunchDocument).mockResolvedValueOnce('/Finder.adoc');
    await act(async () => deliver());
    expect(hook.current).toMatchObject({ path: '/Finder.adoc', text: '/Finder.adoc content' });
  });
});
