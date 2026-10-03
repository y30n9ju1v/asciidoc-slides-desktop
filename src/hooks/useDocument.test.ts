import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ask } from '@tauri-apps/plugin-dialog';
import * as files from '../services/documentFileAdapter';
import { deferred, renderHook } from '../test/renderHook';
import { useDocument } from './useDocument';

vi.mock('../services/documentFileAdapter');
vi.mock('../services/imageStore', () => ({ clearImageCache: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn() }));
const close = vi.hoisted(() => ({
  handler: null as null | ((event: { preventDefault: () => void }) => Promise<void>),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (handler: typeof close.handler) => {
      close.handler = handler;
      return () => {};
    },
  }),
}));

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
  it('opens the only deck in a selected folder', async () => {
    const hook = await renderHook(useDocument);
    vi.mocked(files.chooseDeckFolder).mockResolvedValue({ folder: '/talks', decks: ['/talks/one.adoc'] });
    await act(async () => expect(await hook.current.openFolder()).toEqual([]));
    expect(hook.current).toMatchObject({ path: '/talks/one.adoc', explorerRoot: '/talks' });
  });

  it('returns multiple decks for selection without replacing the current document', async () => {
    const hook = await renderHook(useDocument);
    const decks = ['/talks/one.adoc', '/talks/two.adoc'];
    vi.mocked(files.chooseDeckFolder).mockResolvedValue({ folder: '/talks', decks });
    await act(async () => expect(await hook.current.openFolder()).toEqual(decks));
    expect(hook.current.path).toBeNull();
    expect(files.readDocumentText).not.toHaveBeenCalled();
  });

  it('keeps the document when folder selection is cancelled', async () => {
    const hook = await renderHook(useDocument);
    await act(async () => hook.current.setText('keep edits'));
    vi.mocked(files.chooseDeckFolder).mockResolvedValue(null);
    await act(async () => expect(await hook.current.openFolder()).toEqual([]));
    expect(hook.current).toMatchObject({ text: 'keep edits', isDirty: true, explorerRoot: null });
  });

  it('does not write when Save As folder authorization is cancelled', async () => {
    const hook = await renderHook(useDocument);
    await act(async () => hook.current.setText('keep edits'));
    vi.mocked(files.chooseDocumentSavePath).mockResolvedValue(null);
    await act(async () => expect(await hook.current.saveAs()).toBe(false));
    expect(files.writeDocumentText).not.toHaveBeenCalled();
    expect(hook.current).toMatchObject({ text: 'keep edits', isDirty: true, path: null });
  });

  it('ignores a folder picker result after a newer document operation', async () => {
    const hook = await renderHook(useDocument);
    const picker = deferred<files.DeckFolder | null>();
    vi.mocked(files.chooseDeckFolder).mockReturnValueOnce(picker.promise);
    let pending!: Promise<string[]>;
    await act(async () => {
      pending = hook.current.openFolder();
    });
    await act(async () => hook.current.openPath('/new/deck.adoc'));
    await act(async () => {
      picker.resolve({ folder: '/old', decks: ['/old/one.adoc', '/old/two.adoc'] });
      expect(await pending).toEqual([]);
    });
    expect(hook.current.explorerRoot).toBe('/new');
  });
  it('refuses to close when edits change during discard confirmation', async () => {
    const hook = await renderHook(useDocument);
    await act(async () => hook.current.setText('first edit'));
    const answer = deferred<boolean>();
    vi.mocked(ask).mockReturnValueOnce(answer.promise);
    const event = { preventDefault: vi.fn() };
    const pending = close.handler!(event);
    await act(async () => hook.current.setText('new edit'));
    answer.resolve(true);
    await pending;
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(hook.current.text).toBe('new edit');
  });

  it('blocks duplicate close requests while a confirmation is pending', async () => {
    const hook = await renderHook(useDocument);
    await act(async () => hook.current.setText('edited'));
    const answer = deferred<boolean>();
    vi.mocked(ask).mockReturnValueOnce(answer.promise);
    const first = { preventDefault: vi.fn() };
    const second = { preventDefault: vi.fn() };
    const pending = close.handler!(first);
    await close.handler!(second);
    expect(second.preventDefault).toHaveBeenCalledOnce();
    expect(ask).toHaveBeenCalledOnce();
    answer.resolve(true);
    await pending;
    expect(first.preventDefault).not.toHaveBeenCalled();
  });
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
  it('reports startup read failures instead of silently keeping the sample deck', async () => {
    vi.mocked(files.takeLaunchDocument).mockResolvedValueOnce('/missing.adoc');
    vi.mocked(files.readDocumentText).mockRejectedValueOnce(new Error('permission denied'));
    const hook = await renderHook(useDocument);
    expect(hook.current.error).toContain('permission denied');
    expect(hook.current.path).toBeNull();
  });
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
