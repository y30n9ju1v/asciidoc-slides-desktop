import { plainText, resolveSafeAssetRef, type SafeDiagnostic } from '../../packages/asciidoc-typst/typescript/src';
import { imageMimeType } from './deckAssets';
import { fileExtension, ownValue } from './pathNames';
import type { BlockLayout, SlideVideo, VideoSource } from './slideDeck';

/** The parts of an Asciidoctor `video` node this module reads. */
export interface VideoNode {
  title?: string | null;
  attributes?: Record<string, unknown>;
  lineno?: number | null;
  sourceLocation?: { lineno?: number | null } | null;
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const OTHER_PROVIDERS = new Set(['vimeo', 'wistia']);
const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
};

export function videoMimeType(path: string): string | null {
  return ownValue(VIDEO_MIME_BY_EXTENSION, fileExtension(path));
}

export function isYoutubeId(value: string): boolean {
  return YOUTUBE_ID_RE.test(value);
}

function youtubeUrl(target: string): URL | null {
  try {
    const url = new URL(target);
    const host = url.hostname.replace(/^(www|m)\./, '');
    return url.protocol === 'https:' && ['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host) ? url : null;
  } catch {
    return null;
  }
}

/** A YouTube video ID from a bare ID or a youtu.be / watch / embed / shorts URL. */
export function youtubeIdOf(target: string): string | null {
  if (isYoutubeId(target)) return target;
  const url = youtubeUrl(target);
  if (!url) return null;
  const candidates = [url.searchParams.get('v'), url.pathname.split('/').filter(Boolean).pop()];
  return candidates.find((candidate): candidate is string => !!candidate && isYoutubeId(candidate)) ?? null;
}

/** Whole seconds from `start=90`, or YouTube's `t=90` / `t=90s` URL parameter. */
function startSeconds(attribute: unknown, target: string): number | null {
  const raw = typeof attribute === 'string' ? attribute : (youtubeUrl(target)?.searchParams.get('t') ?? '');
  const match = /^(\d{1,6})s?$/.exec(raw.trim());
  return match ? Number(match[1]) : null;
}

type VideoDiagnostic = { diagnostic: SafeDiagnostic };
type ParsedVideo = { video: Omit<SlideVideo, 'at' | 'layout'>; diagnostics: SafeDiagnostic[] } | VideoDiagnostic;

function diagnostic(node: VideoNode, code: SafeDiagnostic['code'], message: string): VideoDiagnostic {
  const line = node.sourceLocation?.lineno ?? node.lineno ?? null;
  return {
    diagnostic: { code, severity: code === 'unsafe-asset-target' ? 'error' : 'warning', message, location: { line } },
  };
}

function documentRelative(target: string): string | null {
  const ref = resolveSafeAssetRef(target);
  return ref?.kind === 'document-relative' ? ref.relativePath : null;
}

/** Recheck runtime values before converting them into a file read or iframe URL. */
export function isVideoSource(source: VideoSource): boolean {
  if (source.kind === 'youtube') return isYoutubeId(source.id);
  return (
    source.kind === 'file' &&
    documentRelative(source.relativePath) === source.relativePath &&
    videoMimeType(source.relativePath) !== null
  );
}

function sourceOf(node: VideoNode, target: string, provider: string): VideoSource | VideoDiagnostic {
  if (provider === 'youtube' || youtubeUrl(target)) {
    const id = youtubeIdOf(target);
    return id
      ? { kind: 'youtube', id }
      : diagnostic(node, 'unsupported-block', `"${target}" is not a YouTube video ID or link.`);
  }
  if (OTHER_PROVIDERS.has(provider) || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return diagnostic(node, 'unsupported-block', 'Only local video files and YouTube videos are supported.');
  }
  const relativePath = documentRelative(target);
  if (!relativePath)
    return diagnostic(node, 'unsafe-asset-target', `Video "${target}" must be inside the deck's folder.`);
  if (!videoMimeType(relativePath)) {
    return diagnostic(
      node,
      'unsupported-block',
      `"${target}" is not a supported video file (.mp4, .m4v, .mov, .webm, .ogv).`,
    );
  }
  return { kind: 'file', relativePath };
}

function posterTarget(attributes: Record<string, unknown>, provider: string): string | null {
  return (
    [attributes.cover, provider ? null : attributes.poster]
      .find((value): value is string => typeof value === 'string' && value.trim() !== '')
      ?.trim() ?? null
  );
}

function posterOf(candidate: string | null): string | null {
  const relativePath = candidate ? documentRelative(candidate.trim()) : null;
  return relativePath && imageMimeType(relativePath) ? relativePath : null;
}

function providerOf(value: unknown): string {
  const provider = typeof value === 'string' ? value.toLowerCase() : '';
  return provider === 'youtube' || OTHER_PROVIDERS.has(provider) ? provider : '';
}

/**
 * Reads a `video::` block. Local files must stay inside the deck's folder
 * and YouTube IDs are validated, because both later become a file read and
 * an embed URL. Anything else yields a positioned diagnostic instead.
 */
export function parseVideoNode(node: VideoNode): ParsedVideo {
  const attributes = node.attributes ?? {};
  const target = typeof attributes.target === 'string' ? attributes.target.trim() : '';
  if (!target) return diagnostic(node, 'unsupported-block', 'A video needs a file path or YouTube ID.');
  const provider = providerOf(attributes.poster);
  const source = sourceOf(node, target, provider);
  if ('diagnostic' in source) return source;
  const candidate = posterTarget(attributes, provider);
  const poster = posterOf(candidate);
  return {
    diagnostics:
      candidate && !poster
        ? [
            diagnostic(node, 'unsafe-asset-target', 'Video poster must be a supported image inside the deck folder.')
              .diagnostic,
          ]
        : [],
    video: {
      source,
      poster,
      title: node.title ? plainText(node.title) || null : null,
      start: startSeconds(attributes.start, target),
    },
  };
}

/** Builds the slide's video entry at its position among the normalized blocks. */
export function placeVideo(
  video: Omit<SlideVideo, 'at' | 'layout'>,
  at: number,
  layout: BlockLayout | null,
): SlideVideo {
  return { ...video, at, layout };
}

/** The watch page for a YouTube video, used for links in PDF and "Open in YouTube". */
export function youtubeWatchUrl(id: string, start: number | null): string {
  if (!isYoutubeId(id)) throw new Error('Invalid YouTube video ID.');
  return `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`;
}

/** The privacy-enhanced embed used for in-app playback and PowerPoint online video. */
export function youtubeEmbedUrl(id: string, start: number | null, autoplay = false): string {
  if (!isYoutubeId(id)) throw new Error('Invalid YouTube video ID.');
  const params = new URLSearchParams();
  if (start) params.set('start', String(start));
  if (autoplay) params.set('autoplay', '1');
  params.set('rel', '0');
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

/**
 * The embed link PowerPoint's online-video player expects. PowerPoint
 * recognizes youtube.com embeds; the privacy-enhanced domain is for the app.
 */
export function youtubePowerPointUrl(id: string, start: number | null): string {
  if (!isYoutubeId(id)) throw new Error('Invalid YouTube video ID.');
  return `https://www.youtube.com/embed/${id}${start ? `?start=${start}` : ''}`;
}
