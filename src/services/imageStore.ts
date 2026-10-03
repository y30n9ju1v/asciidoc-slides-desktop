import { readFile } from '@tauri-apps/plugin-fs';
import { imageMimeType, joinPath } from './deckAssets';

/**
 * Reads document-relative images through the fs plugin, whose scope only
 * contains folders of decks the user picked in a native dialog. Results are
 * cached per absolute path until `clearImageCache` (e.g. a different deck).
 */
export interface ImageResult {
  blob: Blob | null;
  /** Why the image could not be read, shown in the slide placeholder. */
  error: string | null;
}

const cache = new Map<string, Promise<ImageResult>>();
const listeners = new Set<() => void>();
let revision = 0;

export const imageCacheRevision = () => revision;
export function subscribeImages(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function readImage(absolutePath: string): Promise<ImageResult> {
  const mime = imageMimeType(absolutePath);
  if (!mime) return { blob: null, error: 'unsupported image type' };
  try {
    const bytes = await readFile(absolutePath);
    return { blob: new Blob([bytes], { type: mime }), error: null };
  } catch (error) {
    return { blob: null, error: String(error) };
  }
}

export function loadImageResult(documentDir: string | null, relativePath: string): Promise<ImageResult> {
  if (!documentDir) return Promise.resolve({ blob: null, error: 'save the deck first so images resolve next to it' });
  const absolutePath = joinPath(documentDir, relativePath);
  let pending = cache.get(absolutePath);
  if (!pending) {
    pending = readImage(absolutePath);
    cache.set(absolutePath, pending);
  }
  return pending;
}

export async function loadImage(documentDir: string | null, relativePath: string): Promise<Blob | null> {
  return (await loadImageResult(documentDir, relativePath)).blob;
}

export function clearImageCache(): void {
  cache.clear();
  revision++;
  listeners.forEach((listener) => listener());
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Natural pixel size of an image, used to letterbox it inside a PPTX frame. */
export function imageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** Rasterizes an SVG string to a PNG data URL (PowerPoint's SVG support varies). */
export async function svgToPngDataUrl(
  svg: string,
  scale = 2,
): Promise<{ url: string; width: number; height: number } | null> {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const size = await imageSize(svgUrl);
    if (!size) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(size.width * scale);
    canvas.height = Math.ceil(size.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return null;
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG could not be rasterized'));
      image.src = svgUrl;
    });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { url: canvas.toDataURL('image/png'), width: size.width, height: size.height };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
