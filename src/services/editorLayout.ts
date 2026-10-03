export const MIN_EDITOR_FRACTION = 0.2;
export const MAX_EDITOR_FRACTION = 0.75;
export const MIN_PREVIEW_WIDTH = 240;

/** Fractions are relative to the workspace, but the editor starts after the explorer. */
export function editorFractionAt(clientX: number, editorLeft: number, workspaceWidth: number): number {
  if (workspaceWidth <= 0) return MIN_EDITOR_FRACTION;
  return Math.min(MAX_EDITOR_FRACTION, Math.max(MIN_EDITOR_FRACTION, (clientX - editorLeft) / workspaceWidth));
}

export function clampEditorFraction(fraction: number, workspaceWidth: number, explorerWidth: number): number {
  if (workspaceWidth <= 0) return fraction;
  const maximum = Math.min(
    MAX_EDITOR_FRACTION,
    (workspaceWidth - explorerWidth - 7 - MIN_PREVIEW_WIDTH) / workspaceWidth,
  );
  return Math.max(MIN_EDITOR_FRACTION, Math.min(maximum, fraction));
}
