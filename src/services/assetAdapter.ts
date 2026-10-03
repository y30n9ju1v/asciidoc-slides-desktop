import { invoke } from '@tauri-apps/api/core';

/** Native canonical-path check: symlinks must not escape this deck, even into another granted folder. */
export function resolveDocumentAsset(documentRoot: string, relativePath: string): Promise<string> {
  return invoke('resolve_deck_asset', { documentRoot, relativePath });
}
