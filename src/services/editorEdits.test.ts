import { expect, it, vi } from 'vitest';
import type { editor } from 'monaco-editor/editor/editor.api';
import { applyEditorValue, textReplacement } from './editorEdits';
import { withHeaderAttribute } from './headerAttributes';

it('only replaces the theme, keeping body positions outside the edit', () => {
  const before = '= Title\n:slide-theme: light\n\n== Slide\nKeep my edits';
  const after = withHeaderAttribute(before, 'slide-theme', 'ocean');
  const change = textReplacement(before, after);
  expect(before.slice(0, change.start) + change.text + before.slice(change.end)).toBe(after);
  expect(change.end).toBeLessThan(before.indexOf('== Slide'));
});

it('uses undoable edits for the current document and resets even identical new documents', () => {
  const executeEdits = vi.fn();
  const setValue = vi.fn();
  const pushUndoStop = vi.fn();
  const api = {
    getModel: () => ({
      getValue: () => 'abc',
      getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
    }),
    executeEdits,
    setValue,
    pushUndoStop,
  } as unknown as editor.IStandaloneCodeEditor;
  applyEditorValue(api, 'axc', false);
  expect(setValue).not.toHaveBeenCalled();
  expect(executeEdits).toHaveBeenCalledWith('document-attribute', [
    {
      range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 3 },
      text: 'x',
      forceMoveMarkers: true,
    },
  ]);
  expect(pushUndoStop).toHaveBeenCalledTimes(2);
  applyEditorValue(api, 'abc', true);
  expect(setValue).toHaveBeenCalledWith('abc');
});
