import React, { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api';
import { IME } from 'monaco-editor/base/common/ime';
// We deliberately load Monaco's minimal `editor.api` entry point rather than
// `editor.main` (which drags in every bundled language and inflates the bundle
// several-fold). That entry point ships no editor *contributions*, though, and
// monaco-vim delegates two of its commands to built-in Monaco actions: `o`/`O`
// to insertLineAfter, and `=` to formatSelection. Without these registered,
// those keys throw "command not found" and leave Vim in an inconsistent state.
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations';
import 'monaco-editor/editor/contrib/format/browser/formatActions';
import type { VimAdapterInstance } from 'monaco-vim';
import {
  asciidocLanguageId,
  asciidocDarkThemeId,
  asciidocLightThemeId,
  ensureAsciidocHighlighting,
} from './shikiHighlighter';
import { remapHangulKeydown } from './koreanVimKeymap';
import type { ColorMode } from '../../hooks/useAppPreferences';
import { applyEditorValue } from '../../services/editorEdits';

/** A request to move the cursor to a line; `seq` makes repeated requests for the same line distinct. */
export interface RevealRequest {
  line: number;
  seq: number;
}

/** Text to insert at the cursor; `seq` makes repeated inserts distinct. */
export interface InsertRequest {
  text: string;
  seq: number;
}

interface AsciidocEditorProps {
  documentId: number;
  value: string;
  onChange: (value: string) => void;
  onCursorLineChange?: (line: number) => void;
  vimMode: boolean;
  colorMode: ColorMode;
  fontSize: number;
  revealRequest?: RevealRequest | null;
  insertRequest?: InsertRequest | null;
}

export const AsciidocEditor: React.FC<AsciidocEditorProps> = ({
  documentId,
  value,
  onChange,
  onCursorLineChange,
  vimMode,
  colorMode,
  fontSize,
  revealRequest,
  insertRequest,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const statusBarRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const isUpdatingFromProp = useRef<boolean>(false);
  const currentDocumentId = useRef(documentId);
  const vimSubModeRef = useRef<string>('normal');
  const [highlightingReady, setHighlightingReady] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [vimError, setVimError] = useState<string | null>(null);
  const cursorLineRef = useRef(onCursorLineChange);
  useEffect(() => {
    cursorLineRef.current = onCursorLineChange;
  }, [onCursorLineChange]);

  const activeMonacoTheme = colorMode === 'dark' ? asciidocDarkThemeId : asciidocLightThemeId;

  useEffect(() => {
    let cancelled = false;
    ensureAsciidocHighlighting().then(
      () => {
        if (!cancelled) setHighlightingReady(true);
      },
      (error: unknown) => {
        if (!cancelled) setInitializationError(String(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [setupAttempt]);

  // Update Monaco theme when colorMode changes
  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(activeMonacoTheme);
    }
  }, [activeMonacoTheme]);

  // Updating Monaco options preserves the current model, undo stack, cursor,
  // and Vim adapter; recreating the editor for a visual preference would not.
  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize });
  }, [fontSize]);

  // Jump to a slide's heading when it is selected in the preview.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !revealRequest || revealRequest.line < 1) return;
    editor.revealLineInCenterIfOutsideViewport(revealRequest.line);
    editor.setPosition({ lineNumber: revealRequest.line, column: 1 });
  }, [revealRequest]);

  // Insert a snippet (e.g. an image macro from the file tree) on its own line at the cursor.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const position = editor?.getPosition();
    if (!editor || !model || !position || !insertRequest) return;
    const lineText = model.getLineContent(position.lineNumber);
    const text = lineText.trim() ? `\n${insertRequest.text}\n` : `${insertRequest.text}\n`;
    const column = lineText.trim() ? model.getLineMaxColumn(position.lineNumber) : 1;
    const range = new monaco.Range(position.lineNumber, column, position.lineNumber, column);
    editor.pushUndoStop();
    editor.executeEdits('insert-image', [{ range, text, forceMoveMarkers: true }]);
    editor.pushUndoStop();
    editor.focus();
  }, [insertRequest]);

  // Initialize vanilla Monaco Editor directly on DOM container, once the
  // AsciiDoc TextMate grammar/theme has finished loading.
  useEffect(() => {
    if (!containerRef.current || !highlightingReady) return;

    const editor = monaco.editor.create(containerRef.current, {
      value: value,
      language: asciidocLanguageId,
      theme: activeMonacoTheme,
      fontSize,
      fontFamily: "Fira Code, Consolas, 'Courier New', monospace",
      lineNumbers: 'on',
      wordWrap: 'on',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      smoothScrolling: true,
      readOnly: false,
      tabSize: 2,
    });

    editorRef.current = editor;
    const cursorSubscription = editor.onDidChangeCursorPosition((event) => {
      cursorLineRef.current?.(event.position.lineNumber);
    });

    // Listen to typing & content changes
    const subscription = editor.onDidChangeModelContent(() => {
      if (isUpdatingFromProp.current) return;
      const currentVal = editor.getValue();
      onChange(currentVal);
    });

    // Auto-focus editor on load
    editor.focus();

    return () => {
      subscription.dispose();
      cursorSubscription.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightingReady]);

  // Attach/detach monaco-vim once the editor exists and whenever the toggle changes.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !vimMode) return;
    let cancelled = false;
    let remapSub: monaco.IDisposable | null = null;
    let vimAdapter: VimAdapterInstance | null = null;

    // With a CJK input method active, pressing a key composes text through the
    // IME (compositionstart/-end on Monaco's hidden textarea) rather than going
    // through keydown, and keydown's preventDefault() does not stop that - so in
    // Normal mode the jamo would land in the document instead of running the Vim
    // command. Monaco exposes a first-class switch for exactly this: disabling
    // the IME makes it mark its hidden textarea readonly, which suppresses
    // composition outright while keydown still fires normally. So we disable the
    // IME for every mode except Insert, and restore it on the way back.
    const syncIme = (subMode: string) => {
      vimSubModeRef.current = subMode;
      if (subMode === 'insert') {
        IME.enable();
      } else {
        IME.disable();
      }
    };
    syncIme('normal');

    // Belt and braces: even with composition suppressed, a platform may still
    // report the localized character (e.g. "ㄹ") as KeyboardEvent.key. This
    // listener runs before monaco-vim's own, so the key is normalized back to
    // its QWERTY equivalent before monaco-vim resolves which command it is.
    // Vim mode is opt-in, so do not make every editor startup download its
    // command engine. The dynamic import also isolates its sizeable keymap
    // from the normal editing path in the production bundle.
    void import('monaco-vim')
      .then(({ initVimMode }) => {
        if (cancelled) return;
        setVimError(null);
        remapSub = editor.onKeyDown((e) => {
          if (vimSubModeRef.current !== 'insert') {
            remapHangulKeydown(e.browserEvent);
          }
        });

        // monaco-vim is hoisted in this multi-workspace repository, so its
        // .d.ts can resolve a sibling workspace's Monaco version even though
        // Vite aliases its runtime import to this app's copy. Both versions
        // expose this stable editor surface; keep that package-resolution
        // detail out of the runtime path with a narrow boundary cast.
        vimAdapter = initVimMode(editor as unknown as Parameters<typeof initVimMode>[0], statusBarRef.current);
        vimAdapter.on('vim-mode-change', (ev: { mode: string }) => syncIme(ev.mode));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          IME.enable();
          setVimError(`Could not enable Vim mode: ${String(error)}. Turn Vim mode off and on to retry.`);
        }
      });

    return () => {
      cancelled = true;
      remapSub?.dispose();
      vimAdapter?.dispose();
      // IME.enabled is global state - never leave it off once Vim mode is
      // switched off or the editor unmounts.
      IME.enable();
    };
  }, [vimMode, highlightingReady]);

  // Synchronize external value changes (e.g. Open File, New File)
  useEffect(() => {
    if (!editorRef.current) return;
    isUpdatingFromProp.current = true;
    try {
      applyEditorValue(editorRef.current, value, currentDocumentId.current !== documentId);
      currentDocumentId.current = documentId;
    } finally {
      isUpdatingFromProp.current = false;
    }
  }, [value, documentId, highlightingReady]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
      {initializationError && (
        <div role="alert" className="p-3 text-sm text-[var(--destructive)]">
          Could not initialize the editor: {initializationError}. Your document has not been changed.
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              setInitializationError(null);
              setSetupAttempt((attempt) => attempt + 1);
            }}
          >
            Retry editor
          </button>
        </div>
      )}
      {vimMode && vimError && (
        <div role="alert" className="p-3 text-sm text-[var(--destructive)]">
          {vimError}
        </div>
      )}
      {vimMode && <div ref={statusBarRef} className="vim-status-bar" />}
    </div>
  );
};
