import { useCallback, useEffect, useState } from 'react';
import { clampEditorFontSize, DEFAULT_EDITOR_FONT_SIZE } from '../services/editorPreferences';

export type ColorMode = 'dark' | 'light';

export interface AppPreferences {
  colorMode: ColorMode;
  vimMode: boolean;
  editorFontSize: number;
  /** Editor pane width as a fraction of the window. */
  editorFraction: number;
  explorerOpen: boolean;
}

const STORAGE_KEY = 'asciidoc-slides:preferences';
const DEFAULTS: AppPreferences = {
  colorMode: 'dark',
  vimMode: false,
  editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
  editorFraction: 0.42,
  explorerOpen: true,
};

function readPreferences(): AppPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AppPreferences>;
    return {
      colorMode: stored.colorMode === 'light' ? 'light' : 'dark',
      vimMode: stored.vimMode === true,
      editorFontSize: clampEditorFontSize(stored.editorFontSize),
      editorFraction:
        typeof stored.editorFraction === 'number'
          ? Math.min(0.75, Math.max(0.2, stored.editorFraction))
          : DEFAULTS.editorFraction,
      explorerOpen: stored.explorerOpen !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Per-machine UI preferences. Storage failures fall back to defaults. */
export function useAppPreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(readPreferences);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Preferences are a convenience; the app works without persisting them.
    }
    document.documentElement.dataset.colorMode = preferences.colorMode;
  }, [preferences]);

  const update = useCallback((patch: Partial<AppPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      return { ...next, editorFontSize: clampEditorFontSize(next.editorFontSize) };
    });
  }, []);

  return [preferences, update] as const;
}
