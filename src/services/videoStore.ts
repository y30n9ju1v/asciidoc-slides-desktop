import { readFile, stat } from '@tauri-apps/plugin-fs';
import { resolveDocumentAsset } from './assetAdapter';
import { blobToDataUrl } from './imageStore';
import { fileExtension } from './pathNames';
import { isVideoSource, videoMimeType } from './slideVideo';
import { convertFileSrc } from '@tauri-apps/api/core';

export async function localVideoUrl(documentDir: string, relativePath: string, start: number | null): Promise<string> {
  if (!isVideoSource({ kind: 'file', relativePath })) throw new Error('Video must be inside the deck folder.');
  return `${convertFileSrc(await resolveDocumentAsset(documentDir, relativePath))}${start ? `#t=${start}` : ''}`;
}

/** PowerPoint embeds the whole file, and building it needs the bytes in memory several times over. */
export const MAX_EMBEDDED_VIDEO_BYTES = 300 * 1024 * 1024;

export type VideoData = { data: string; extn: string } | { error: string };

/**
 * Reads a deck video for embedding in PPTX. The size is checked before
 * reading so an oversized file is reported instead of exhausting memory.
 */
export async function loadVideoData(documentDir: string | null, relativePath: string): Promise<VideoData> {
  const mime = videoMimeType(relativePath);
  if (!documentDir) return { error: 'save the deck first so videos resolve next to it' };
  if (!isVideoSource({ kind: 'file', relativePath })) return { error: 'video must be inside the deck folder' };
  if (!mime) return { error: 'unsupported video type' };
  try {
    const path = await resolveDocumentAsset(documentDir, relativePath);
    const info = await stat(path);
    if (info.size > MAX_EMBEDDED_VIDEO_BYTES) {
      return { error: `larger than ${MAX_EMBEDDED_VIDEO_BYTES / 1024 / 1024} MB` };
    }
    const bytes = await readFile(path);
    if (bytes.byteLength > MAX_EMBEDDED_VIDEO_BYTES) return { error: 'video grew beyond the embedding size limit' };
    const extn = fileExtension(relativePath) || 'mp4';
    return { data: await blobToDataUrl(new Blob([bytes], { type: mime })), extn };
  } catch (error) {
    return { error: String(error) };
  }
}
