import { createContext, useContext } from 'react';
import type { SlideTheme } from '../../services/slideThemes';

/** What slide content needs to resolve images and theme-dependent diagrams. */
export interface SlideAssets {
  documentDir: string | null;
  theme: SlideTheme;
  /** True only in presentation mode: videos play there and stay still posters elsewhere. */
  playback: boolean;
}

export const SlideAssetsContext = createContext<SlideAssets | null>(null);

export function useSlideAssets(): SlideAssets {
  const assets = useContext(SlideAssetsContext);
  if (!assets) throw new Error('SlideAssetsContext is missing');
  return assets;
}
