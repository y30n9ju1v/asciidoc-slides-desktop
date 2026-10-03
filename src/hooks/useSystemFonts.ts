import { useEffect, useState } from 'react';
import { listSystemFonts } from '../services/systemFontAdapter';

export function useSystemFonts(open: boolean) {
  const [fonts, setFonts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.resolve()
      .then(() => {
        if (!active) return [];
        setLoading(true);
        setError(null);
        return listSystemFonts();
      })
      .then(
        (names) => {
          if (active) setFonts(names);
        },
        (reason: unknown) => {
          if (active) setError(String(reason));
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);
  return { fonts, error, loading };
}
