import type { editor } from 'monaco-editor/editor/editor.api';

/** The smallest contiguous replacement, preserving cursor markers outside the changed header. */
export function textReplacement(before: string, after: string) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = before.length;
  let afterEnd = after.length;
  while (end > start && afterEnd > start && before[end - 1] === after[afterEnd - 1]) {
    end--;
    afterEnd--;
  }
  return { start, end, text: after.slice(start, afterEnd) };
}

/** New documents reset history; changes to the current document are undoable edits. */
export function applyEditorValue(editor: editor.IStandaloneCodeEditor, value: string, replaceDocument: boolean) {
  if (replaceDocument) {
    editor.setValue(value);
    return;
  }
  const model = editor.getModel();
  if (!model || model.getValue() === value) return;
  const edit = textReplacement(model.getValue(), value);
  const start = model.getPositionAt(edit.start);
  const end = model.getPositionAt(edit.end);
  editor.pushUndoStop();
  editor.executeEdits('document-attribute', [
    {
      range: {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      },
      text: edit.text,
      forceMoveMarkers: true,
    },
  ]);
  editor.pushUndoStop();
}
