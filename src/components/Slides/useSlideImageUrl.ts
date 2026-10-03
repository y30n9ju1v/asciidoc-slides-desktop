import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SafeAssetRef } from '../../../packages/asciidoc-typst/typescript/src';
import { imageCacheRevision, loadImageResult, subscribeImages } from '../../services/imageStore';
import { useSlideAssets } from './SlideAssetsContext';

export interface ObjectUrlState {
  url: string | null;
  error: string | null;
  loading: boolean;
}

/** A blob URL for a document-relative image, re-read when the image cache is refreshed. */
export function useSlideImageUrl(asset: SafeAssetRef | null): ObjectUrlState {
  const revision = useSyncExternalStore(subscribeImages, imageCacheRevision);
  const { documentDir } = useSlideAssets();
  const relativePath = asset?.kind === 'document-relative' ? asset.relativePath : null;
  const [state, setState] = useState<{ key: string; url: string | null; error: string | null } | null>(null);
  const key = `${revision}\u0000${documentDir}\u0000${relativePath}`;

  useEffect(() => {
    if (!relativePath) return;
    let cancelled = false;
    let url: string | null = null;
    void loadImageResult(documentDir, relativePath).then((result) => {
      if (cancelled) return;
      url = result.blob ? URL.createObjectURL(result.blob) : null;
      setState({ key, url, error: result.error });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [documentDir, relativePath, key]);

  if (!asset) return { url: null, error: null, loading: false };
  if (!relativePath) return { url: null, error: 'remote images are not embedded', loading: false };
  return state?.key === key
    ? { url: state.url, error: state.error, loading: false }
    : { url: null, error: null, loading: true };
}
