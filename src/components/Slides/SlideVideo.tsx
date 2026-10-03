import { useState, type CSSProperties, type MouseEvent } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import type { SlideVideo as SlideVideoModel } from '../../services/slideDeck';
import { isVideoSource, youtubeEmbedUrl } from '../../services/slideVideo';
import { localVideoUrl, openYoutubeVideo } from '../../services/videoStore';
import { useSlideAssets } from './SlideAssetsContext';
import { useSlideImageUrl } from './useSlideImageUrl';

const posterRef = (video: SlideVideoModel) =>
  video.poster ? ({ kind: 'document-relative', relativePath: video.poster } as const) : null;

/** Clicks on a video must not advance the presentation. */
const keepClick = (event: MouseEvent) => event.stopPropagation();

function videoLabel(video: SlideVideoModel): string {
  if (video.title) return video.title;
  return video.source.kind === 'youtube' ? 'YouTube video' : (video.source.relativePath.split('/').pop() ?? 'Video');
}

/** Poster image (or a plain card) with a play badge - what every non-playing state shows. */
function VideoPoster({ video, onPlay }: { video: SlideVideoModel; onPlay?: () => void }) {
  const poster = useSlideImageUrl(posterRef(video));
  const style: CSSProperties = poster.url ? { backgroundImage: `url("${poster.url}")` } : {};
  const content = (
    <>
      <span className="slide-video-badge" aria-hidden="true">
        <Play />
      </span>
      {!poster.url && <span className="slide-video-label">{videoLabel(video)}</span>}
    </>
  );
  return onPlay ? (
    <button
      type="button"
      className="slide-video-poster"
      style={style}
      aria-label={`Play ${videoLabel(video)}`}
      onClick={onPlay}
    >
      {content}
    </button>
  ) : (
    <div className="slide-video-poster" style={style} role="img" aria-label={`Video: ${videoLabel(video)}`}>
      {content}
    </div>
  );
}

function LocalPlayer({ video, relativePath }: { video: SlideVideoModel; relativePath: string }) {
  const [failed, setFailed] = useState(false);
  const { documentDir } = useSlideAssets();
  const poster = useSlideImageUrl(posterRef(video));
  if (!documentDir) return <div role="alert">Save the deck beside its video before playing.</div>;
  if (failed)
    return (
      <div role="alert">Could not play {relativePath}. Check that the file exists and its codec is supported.</div>
    );
  // The asset protocol streams the file in ranges instead of loading it into memory.
  const source = localVideoUrl(documentDir, relativePath, video.start);
  return (
    <video
      className="slide-video-frame"
      aria-label={videoLabel(video)}
      src={source}
      poster={poster.url ?? undefined}
      controls
      tabIndex={0}
      preload="metadata"
      onError={() => setFailed(true)}
    >
      {videoLabel(video)}
    </video>
  );
}

function YoutubePlayer({ video, id }: { video: SlideVideoModel; id: string }) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openInBrowser = () =>
    void openYoutubeVideo(id, video.start).catch((reason: unknown) =>
      setError(`Could not open YouTube: ${String(reason)}`),
    );
  if (!playing) {
    return (
      <div className="slide-video-stack">
        <VideoPoster video={video} onPlay={() => setPlaying(true)} />
        <button type="button" className="slide-video-external" onClick={openInBrowser}>
          <ExternalLink /> Open in YouTube
        </button>
        {error && <div role="alert">{error}</div>}
      </div>
    );
  }
  // Privacy-enhanced domain only; the sandbox lets the player run but never
  // navigate the app window or open popups.
  return (
    <iframe
      className="slide-video-frame"
      src={youtubeEmbedUrl(id, video.start, true)}
      title={videoLabel(video)}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      allowFullScreen
    />
  );
}

/**
 * A slide video. While editing it is a still poster, so the editor never
 * streams video or contacts YouTube; in presentation mode local files play
 * in place and YouTube plays after a click.
 */
export function SlideVideo({ video }: { video: SlideVideoModel }) {
  const { playback } = useSlideAssets();
  if (!isVideoSource(video.source)) return <div role="alert">Invalid video source.</div>;
  const player = !playback ? (
    <VideoPoster video={video} />
  ) : video.source.kind === 'file' ? (
    <LocalPlayer
      key={`${video.source.relativePath}:${video.start}`}
      video={video}
      relativePath={video.source.relativePath}
    />
  ) : (
    <YoutubePlayer key={`${video.source.id}:${video.start}`} video={video} id={video.source.id} />
  );
  return (
    <figure className="slide-figure slide-video" onClick={playback ? keepClick : undefined}>
      {player}
      {video.title && <figcaption>{video.title}</figcaption>}
    </figure>
  );
}
