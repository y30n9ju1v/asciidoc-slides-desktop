import { invoke } from '@tauri-apps/api/core';

/** Read-only system inventory, using the same font scanner as native PDF export. */
export function listSystemFonts(): Promise<string[]> {
  return invoke('list_system_fonts');
}
