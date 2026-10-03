import { useCallback, useEffect, useRef, useState } from 'react';
import { ask } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  chooseDeckFolder,
  chooseDocumentSavePath,
  chooseDocumentToOpen,
  onLaunchDocument,
  readDocumentText,
  takeLaunchDocument,
  writeDocumentText,
} from '../services/documentFileAdapter';
import { clearImageCache } from '../services/imageStore';
import { STARTER_DECK } from '../services/starterDeck';
import { directoryOf } from '../services/deckAssets';

interface DocumentState {
  id: number;
  path: string | null;
  text: string;
  /** Text as last read from or written to disk; for an untitled deck, its starting text. */
  baseline: string;
}

async function confirmDiscard(): Promise<boolean> {
  try {
    return await ask('You have unsaved changes. Discard them?', { title: 'Unsaved changes', kind: 'warning' });
  } catch {
    return window.confirm('You have unsaved changes. Discard them?');
  }
}

async function diskText(path: string): Promise<string | null> {
  try {
    return await readDocumentText(path);
  } catch {
    return null;
  }
}

/**
 * The open deck: its path, text, and dirty state, plus open/save/new
 * actions. Saving is atomic and refuses to overwrite a file that changed on
 * disk since it was opened (see document_store.rs).
 */
export function useDocument() {
  const [state, setState] = useState<DocumentState>({ id: 0, path: null, text: STARTER_DECK, baseline: STARTER_DECK });
  /** A folder picked with "Open folder"; the explorer shows it instead of the deck's own folder. */
  const [folder, setFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDirty = state.text !== state.baseline;
  const stateRef = useRef(state);
  const transition = useRef(0);
  const saving = useRef(false);
  const commit = useCallback((next: DocumentState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const setText = useCallback((text: string) => commit({ ...stateRef.current, text }), [commit]);

  const beginTransition = useCallback(async () => {
    const sequence = ++transition.current;
    const current = stateRef.current;
    const allowed = current.text === current.baseline || (await confirmDiscard());
    if (!allowed || sequence !== transition.current || current !== stateRef.current) return null;
    return { sequence, document: current };
  }, []);

  const isCurrent = useCallback(
    (ticket: { sequence: number; document: DocumentState }) =>
      ticket.sequence === transition.current && ticket.document === stateRef.current,
    [],
  );

  const newDocument = useCallback(async () => {
    const ticket = await beginTransition();
    if (!ticket || !isCurrent(ticket)) return;
    clearImageCache();
    setFolder(null);
    commit({ id: stateRef.current.id + 1, path: null, text: STARTER_DECK, baseline: STARTER_DECK });
  }, [beginTransition, isCurrent, commit]);

  const loadPath = useCallback(
    async (path: string, ticket: { sequence: number; document: DocumentState }) => {
      const text = await readDocumentText(path);
      if (!isCurrent(ticket)) return;
      clearImageCache();
      commit({ id: stateRef.current.id + 1, path, text, baseline: text });
    },
    [isCurrent, commit],
  );

  const openDocument = useCallback(async () => {
    const ticket = await beginTransition();
    if (!ticket) return;
    const path = await chooseDocumentToOpen();
    if (path && isCurrent(ticket)) await loadPath(path, ticket);
  }, [beginTransition, isCurrent, loadPath]);

  /** Every UI entry point checks the document again, including the folder's deck picker. */
  const openDeckFromTree = useCallback(
    async (path: string) => {
      if (path === stateRef.current.path) return;
      const ticket = await beginTransition();
      if (ticket) await loadPath(path, ticket);
    },
    [beginTransition, loadPath],
  );

  /**
   * Picks a folder. One deck inside opens directly; several are returned for
   * the caller to choose from (then passed to `openPath`).
   */
  const openFolder = useCallback(async (): Promise<string[]> => {
    const sequence = ++transition.current;
    const original = stateRef.current;
    const picked = await chooseDeckFolder();
    if (!picked || sequence !== transition.current || original !== stateRef.current) return [];
    setFolder(picked.folder);
    if (picked.decks.length === 0)
      throw new Error('No .adoc files directly in that folder. Pick one from the file tree.');
    if (picked.decks.length === 1) {
      await openDeckFromTree(picked.decks[0]);
      return [];
    }
    return picked.decks;
  }, [openDeckFromTree]);

  const persist = useCallback(
    async (asNew: boolean): Promise<boolean> => {
      if (saving.current) return false;
      saving.current = true;
      const original = stateRef.current;
      try {
        const choosePath = asNew || !original.path;
        const path = choosePath ? await chooseDocumentSavePath() : original.path;
        if (!path || stateRef.current.id !== original.id) return false;
        const snapshot = stateRef.current;
        const expected = choosePath ? await diskText(path) : snapshot.baseline;
        if (stateRef.current.id !== original.id) return false;
        await writeDocumentText(path, snapshot.text, expected);
        if (stateRef.current.id === original.id) {
          commit({ ...stateRef.current, path, baseline: snapshot.text });
          clearImageCache();
        }
        return true;
      } finally {
        saving.current = false;
      }
    },
    [commit],
  );
  const saveAs = useCallback(() => persist(true), [persist]);
  const save = useCallback(() => persist(false), [persist]);

  // Open the deck the app was launched with (command line, Finder "Open With").
  useEffect(() => {
    const ticket = { sequence: transition.current, document: stateRef.current };
    takeLaunchDocument()
      .then((path) => (path && isCurrent(ticket) ? loadPath(path, ticket) : undefined))
      .catch((reason: unknown) => setError(`Could not open the launch document: ${String(reason)}`));
  }, [loadPath, isCurrent]);

  // A deck handed over while running (macOS "Open With") asks about unsaved work first.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    onLaunchDocument(() => {
      void takeLaunchDocument()
        .then((path) => (path ? openDeckFromTree(path) : undefined))
        .catch((reason: unknown) => {
          if (!disposed) setError(`Could not open the requested document: ${String(reason)}`);
        });
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openDeckFromTree]);

  // Ask before closing the window with unsaved work.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    let confirming = false;
    try {
      void getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (confirming || saving.current) {
            event.preventDefault();
            return;
          }
          const current = stateRef.current;
          const sequence = transition.current;
          if (current.text === current.baseline) return;
          confirming = true;
          try {
            const allowed = await confirmDiscard();
            if (
              !allowed ||
              disposed ||
              saving.current ||
              current !== stateRef.current ||
              sequence !== transition.current
            )
              event.preventDefault();
          } catch {
            event.preventDefault();
          } finally {
            confirming = false;
          }
        })
        .then((dispose) => {
          if (disposed) dispose();
          else unlisten = dispose;
        })
        .catch(() => undefined);
    } catch {
      // Not running inside Tauri (plain browser preview).
    }
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return {
    id: state.id,
    error,
    path: state.path,
    documentDir: state.path ? directoryOf(state.path) : null,
    /** The folder shown in the file tree. */
    explorerRoot: folder ?? (state.path ? directoryOf(state.path) : null),
    openDeckFromTree,
    text: state.text,
    isDirty,
    setText,
    newDocument,
    openDocument,
    openFolder,
    openPath: openDeckFromTree,
    save,
    saveAs,
  };
}
