import { openUrl } from '@tauri-apps/plugin-opener';
import { youtubeWatchUrl } from './slideVideo';

/**
 * Opens a YouTube watch page in the default browser. The opener capability
 * only allows `https://www.youtube.com/watch*`, and the ID is validated
 * before it reaches the URL.
 */
export function openYoutubeVideo(id: string, start: number | null): Promise<void> {
  return openUrl(youtubeWatchUrl(id, start));
}
