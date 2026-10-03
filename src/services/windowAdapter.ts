import { getCurrentWindow } from '@tauri-apps/api/window';

/** Native window boundary with a plain-browser presentation fallback. */
export async function setPresentationFullscreen(enabled: boolean): Promise<void> {
  try {
    await getCurrentWindow().setFullscreen(enabled);
  } catch {
    // A failed fullscreen request still leaves a usable full-window presenter.
    if (enabled) await document.documentElement.requestFullscreen?.().catch(() => undefined);
    else if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  }
}

export async function setApplicationTitle(title: string): Promise<void> {
  document.title = title;
  try {
    await getCurrentWindow().setTitle(title);
  } catch {
    // Browser preview has no native title bar.
  }
}

export interface CloseRequest {
  preventDefault(): void;
}

/** Subscribes to the window's close request; resolves to an unsubscribe (a no-op outside Tauri). */
export async function onWindowCloseRequested(handler: (event: CloseRequest) => Promise<void>): Promise<() => void> {
  try {
    return await getCurrentWindow().onCloseRequested(handler);
  } catch {
    return () => undefined;
  }
}
