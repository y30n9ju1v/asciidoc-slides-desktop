import { useEffect, useState } from 'react';
import { localVideoUrl } from '../services/videoStore';

export function useLocalVideoUrl(root: string | null, path: string, start: number | null) {
  const key = `${root}\u0000${path}\u0000${start}`;
  const [result, setResult] = useState<{ key: string; url: string | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!root) return;
    let disposed = false;
    localVideoUrl(root, path, start).then(
      (url) => {
        if (!disposed) setResult({ key, url, error: null });
      },
      (error: unknown) => {
        if (!disposed) setResult({ key, url: null, error: String(error) });
      },
    );
    return () => {
      disposed = true;
    };
  }, [root, path, start, key]);
  return result?.key === key ? result : { url: null, error: null };
}
