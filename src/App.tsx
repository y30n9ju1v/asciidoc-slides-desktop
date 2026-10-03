import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { setApplicationTitle } from './services/windowAdapter';
import { AppHeader } from './components/Layout/AppHeader';
import { OutputQualityDialog } from './components/Layout/OutputQualityDialog';
import { DeckPickerDialog } from './components/Layout/DeckPickerDialog';
import { Presenter } from './components/Slides/Presenter';
import { SlidePreview } from './components/Slides/SlidePreview';
import type { InsertRequest, RevealRequest } from './components/Editor/AsciidocEditor';
import { FileExplorer } from './components/Explorer/FileExplorer';
import { useAppPreferences } from './hooks/useAppPreferences';
import { useDocument } from './hooks/useDocument';
import { useEditorResize } from './hooks/useEditorResize';
import { useImageRefresh } from './hooks/useImageRefresh';
import { useSlideDeck } from './hooks/useSlideDeck';
import { pathRelativeTo } from './services/deckAssets';
import { exportDocument, exportErrorMessage, type ExportFormat } from './services/exportService';
import { slideIndexForLine } from './services/slideNavigation';
import { withHeaderAttribute } from './services/headerAttributes';
import type { SlideDeck } from './services/slideDeck';
import { DEFAULT_SLIDE_STYLE_ID, SLIDE_STYLE_ATTRIBUTE, type SlideStyleId } from './services/slideStyles';
import { DEFAULT_SLIDE_THEME_ID, SLIDE_THEME_ATTRIBUTE, type SlideThemeId } from './services/slideThemes';

// Monaco is the largest chunk; keep it off the first paint.
const AsciidocEditor = lazy(() =>
  import('./components/Editor/AsciidocEditor').then((module) => ({ default: module.AsciidocEditor })),
);

function fileNameOf(path: string | null): string {
  return path?.split(/[\\/]/).pop() ?? 'Untitled.adoc';
}

/** Header-facing facts about the (possibly still loading) deck. */
function deckSummary(deck: SlideDeck | null) {
  return {
    slideCount: deck?.slides.length ?? 0,
    themeId: deck?.theme.id ?? DEFAULT_SLIDE_THEME_ID,
    styleId: deck?.style.id ?? DEFAULT_SLIDE_STYLE_ID,
  };
}

function reportError(action: string) {
  return (error: unknown) => toast.error(`${action}: ${exportErrorMessage(error)}`);
}

export default function App() {
  const [preferences, updatePreferences] = useAppPreferences();
  const document_ = useDocument();
  useEffect(() => {
    if (document_.error) toast.error(document_.error);
  }, [document_.error]);
  const { deck, error: parseError, isStale, isParsing } = useSlideDeck(document_.text, document_.id);
  const refreshImages = useImageRefresh();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealRequest, setRevealRequest] = useState<RevealRequest | null>(null);
  const [insertRequest, setInsertRequest] = useState<InsertRequest | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const exportBusy = useRef(false);
  const [folderDecks, setFolderDecks] = useState<string[]>([]);
  const cursorLine = useRef(1);
  const fileName = fileNameOf(document_.path);
  const summary = deckSummary(deck);
  const showExplorer = preferences.explorerOpen && document_.explorerRoot !== null;
  const { workspaceRef, editorRef, fraction, maxFraction, setFraction, startResize } = useEditorResize(
    preferences.editorFraction,
    showExplorer,
    (editorFraction) => updatePreferences({ editorFraction }),
  );
  const canPresent = presenting && deck !== null && deck.slides.length > 0;

  // Follow the editor cursor, including after edits re-parse the deck.
  useEffect(() => {
    if (deck) setCurrentIndex(slideIndexForLine(deck, cursorLine.current));
  }, [deck]);

  const onCursorLineChange = useCallback(
    (line: number) => {
      cursorLine.current = line;
      if (deck) setCurrentIndex(slideIndexForLine(deck, line));
    },
    [deck],
  );

  const selectSlide = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      const line = deck?.slides[index]?.line;
      if (line) setRevealRequest((previous) => ({ line, seq: (previous?.seq ?? 0) + 1 }));
    },
    [deck],
  );

  useEffect(() => {
    const title = `${fileName}${document_.isDirty ? ' •' : ''} — AsciiDoc Slides`;
    void setApplicationTitle(title);
  }, [fileName, document_.isDirty]);

  const runExport = useCallback(
    async (format: ExportFormat) => {
      if (exportBusy.current) return;
      exportBusy.current = true;
      setExporting(format);
      try {
        const saved = await exportDocument(format, {
          text: document_.text,
          path: document_.path,
          documentDir: document_.documentDir,
        });
        if (saved) toast.success(`Exported ${fileNameOf(saved)}`);
      } catch (error) {
        reportError(`${format.toUpperCase()} export failed`)(error);
      } finally {
        exportBusy.current = false;
        setExporting(null);
      }
    },
    [document_.text, document_.path, document_.documentDir],
  );

  const insertMedia = useCallback(
    (path: string, kind: 'image' | 'video') => {
      const relative = document_.documentDir ? pathRelativeTo(document_.documentDir, path) : null;
      if (relative === null) {
        toast.info('Images and videos must be in the deck’s folder or below it. Open or save a deck there first.');
        return;
      }
      setInsertRequest((previous) => ({ text: `${kind}::${relative}[]`, seq: (previous?.seq ?? 0) + 1 }));
    },
    [document_.documentDir],
  );

  const setHeaderAttribute = useCallback(
    (name: string, value: string) => document_.setText(withHeaderAttribute(document_.text, name, value)),
    [document_],
  );

  const { newDocument, openFolder, save, saveAs } = document_;
  const openDeckFolder = useCallback(() => openFolder().then(setFolderDecks), [openFolder]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (presenting) return;
      if (event.key === 'F5') {
        event.preventDefault();
        if (deck?.slides.length && !isStale) setPresenting(true);
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      const actions: Record<string, () => Promise<unknown>> = {
        s: event.shiftKey ? saveAs : save,
        o: openDeckFolder,
        n: newDocument,
      };
      const action = actions[key];
      if (!action) return;
      event.preventDefault();
      action().catch(reportError('Could not complete that'));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deck, isStale, presenting, newDocument, openDeckFolder, save, saveAs]);

  return (
    <div className="app-container">
      <AppHeader
        canCheckOutput={!isStale}
        onCheckOutput={() => setQualityOpen(true)}
        fontFamily={deck?.fontFamily}
        onFontFamilyChange={(font) => setHeaderAttribute('slide-font', font)}
        fileName={fileName}
        isDirty={document_.isDirty}
        slideCount={summary.slideCount}
        themeId={summary.themeId}
        styleId={summary.styleId}
        exporting={exporting}
        canPresent={!isStale && summary.slideCount > 0}
        colorMode={preferences.colorMode}
        vimMode={preferences.vimMode}
        editorFontSize={preferences.editorFontSize}
        onEditorFontSizeChange={(editorFontSize) => updatePreferences({ editorFontSize })}
        explorerOpen={preferences.explorerOpen}
        onExplorerToggle={() => updatePreferences({ explorerOpen: !preferences.explorerOpen })}
        onNew={() => newDocument().catch(reportError('Could not create a deck'))}
        onOpenFolder={() => openDeckFolder().catch(reportError('Could not open the folder'))}
        onSave={() => save().catch(reportError('Could not save'))}
        onSaveAs={() => saveAs().catch(reportError('Could not save'))}
        onThemeChange={(id: SlideThemeId) => setHeaderAttribute(SLIDE_THEME_ATTRIBUTE, id)}
        onStyleChange={(id: SlideStyleId) => setHeaderAttribute(SLIDE_STYLE_ATTRIBUTE, id)}
        onExport={(format) => void runExport(format)}
        onPresent={() => setPresenting(true)}
        onColorModeChange={(colorMode) => updatePreferences({ colorMode })}
        onVimModeChange={(vimMode) => updatePreferences({ vimMode })}
      />
      <div ref={workspaceRef} className="app-workspace">
        <OutputQualityDialog
          open={qualityOpen}
          onOpenChange={setQualityOpen}
          deck={deck}
          disabled={isStale}
          directory={document_.documentDir}
          onSelect={selectSlide}
        />
        {showExplorer && (
          <aside className="pane-explorer" aria-label="File explorer">
            <FileExplorer
              root={document_.explorerRoot ?? ''}
              activePath={document_.path}
              onOpenDeck={(path) => document_.openDeckFromTree(path).catch(reportError('Could not open the file'))}
              onInsertMedia={insertMedia}
              onRefresh={refreshImages}
            />
          </aside>
        )}
        <div ref={editorRef} className="pane-editor" style={{ width: `${fraction * 100}%` }}>
          <Suspense fallback={<div className="pane-loading">Loading editor…</div>}>
            <AsciidocEditor
              documentId={document_.id}
              value={document_.text}
              onChange={document_.setText}
              onCursorLineChange={onCursorLineChange}
              vimMode={preferences.vimMode}
              colorMode={preferences.colorMode}
              fontSize={preferences.editorFontSize}
              revealRequest={revealRequest}
              insertRequest={insertRequest}
            />
          </Suspense>
        </div>
        <div
          className="pane-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize editor"
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuemin={20}
          aria-valuemax={Math.round(maxFraction * 100)}
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={(event) => {
            const step = event.key === 'ArrowLeft' ? -0.02 : event.key === 'ArrowRight' ? 0.02 : 0;
            if (!step) return;
            event.preventDefault();
            setFraction(fraction + step);
          }}
        />
        <SlidePreview
          deck={deck}
          parseError={parseError}
          isParsing={isParsing}
          currentIndex={currentIndex}
          documentDir={document_.documentDir}
          onSelect={selectSlide}
        />
      </div>
      {canPresent && deck && (
        <Presenter
          deck={deck}
          startIndex={Math.min(currentIndex, deck.slides.length - 1)}
          documentDir={document_.documentDir}
          onExit={(index) => {
            setPresenting(false);
            selectSlide(index);
          }}
        />
      )}
      <DeckPickerDialog
        decks={folderDecks}
        onClose={() => setFolderDecks([])}
        onPick={(path) => {
          setFolderDecks([]);
          document_.openPath(path).catch(reportError('Could not open the file'));
        }}
      />
      <Toaster theme={preferences.colorMode} position="bottom-right" richColors />
    </div>
  );
}
