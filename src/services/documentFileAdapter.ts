import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { readDir, readTextFile, writeFile } from '@tauri-apps/plugin-fs';
import { ask } from '@tauri-apps/plugin-dialog';

export function confirmExportWarnings(messages: string[]): Promise<boolean> {
  return ask(`${messages.join('\n\n')}\n\nExport with these changes?`, {
    title: 'Review export warnings',
    kind: 'warning',
    okLabel: 'Export anyway',
    cancelLabel: 'Cancel',
  });
}

/** Asks before discarding unsaved edits; falls back to the browser prompt outside Tauri. */
export async function confirmDiscardChanges(): Promise<boolean> {
  try {
    return await ask('You have unsaved changes. Discard them?', { title: 'Unsaved changes', kind: 'warning' });
  } catch {
    return window.confirm('You have unsaved changes. Discard them?');
  }
}

/** Native PDF compile and write; `outputPath` must come from `chooseExportFile`. */
export function exportSlidesPdf(requestJson: string, outputPath: string): Promise<void> {
  return invoke('export_slides_pdf', { requestJson, outputPath });
}

export interface DeckFolder {
  folder: string;
  /** Absolute paths of the `.adoc`/`.asciidoc` files directly inside `folder`. */
  decks: string[];
}

/** Folder picker; grants the folder (and its images) to the fs scope. */
export function chooseDeckFolder(): Promise<DeckFolder | null> {
  return invoke('choose_deck_folder');
}

/** Launch deck, returned only after its containing folder is selected in the native picker. */
export function takeLaunchDocument(): Promise<string | null> {
  return invoke('take_launch_document');
}

/** Fires when the OS hands a deck to the running app; read it with `takeLaunchDocument`. */
export function onLaunchDocument(handler: () => void): Promise<() => void> {
  return listen('launch-document', handler);
}

/** Choose a name, then authorize its containing folder; cancellation returns null. */
export function chooseDocumentSavePath(): Promise<string | null> {
  return invoke('choose_document_save_path');
}

export function chooseExportFile(
  defaultPath: string,
  filterName: string,
  extensions: string[],
): Promise<string | null> {
  return invoke('choose_export_file', { defaultPath, filterName, extensions });
}

export const readDocumentText = readTextFile;
export const readDirectory = readDir;

/** Atomic save that refuses to overwrite a file changed on disk since `expected`. */
export function writeDocumentText(path: string, content: string, expected: string | null = null): Promise<void> {
  return invoke('save_document_atomic', { path, content, expected });
}

export function writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
  return writeFile(path, bytes);
}
