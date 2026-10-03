import { useEffect } from 'react';
import { clearImageCache } from '../services/imageStore';

/** Refresh images even when the explorer is hidden. The source document is never replaced. */
export function useImageRefresh() {
  useEffect(() => {
    window.addEventListener('focus', clearImageCache);
    return () => window.removeEventListener('focus', clearImageCache);
  }, []);
  return clearImageCache;
}
