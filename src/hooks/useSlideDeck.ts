import { useEffect, useRef, useState } from 'react';
import type { SlideDeck } from '../services/slideDeck';
import { parseSlideDeck } from '../services/slideDeckService';

const PARSE_DELAY_MS = 180;

/**
 * Parses the source into a deck after typing pauses. The last good deck stays
 * visible while a newer revision parses or if it fails, and an older parse
 * that resolves late never replaces a newer one.
 */
export function useSlideDeck(source: string, documentId = 0) {
  const [result, setResult] = useState<{ deck: SlideDeck; source: string; documentId: number } | null>(null);
  const [failure, setFailure] = useState<{ message: string; source: string; documentId: number } | null>(null);
  const sequence = useRef(0);
  const isFirstParse = useRef(true);

  useEffect(() => {
    let disposed = false;
    const current = ++sequence.current;
    const delay = isFirstParse.current ? 0 : PARSE_DELAY_MS;
    isFirstParse.current = false;
    const timer = window.setTimeout(() => {
      parseSlideDeck(source).then(
        (parsed) => {
          if (disposed || current !== sequence.current) return;
          setResult({ deck: parsed, source, documentId });
          setFailure(null);
        },
        (reason: unknown) => {
          if (!disposed && current === sequence.current) setFailure({ message: String(reason), source, documentId });
        },
      );
    }, delay);
    return () => {
      window.clearTimeout(timer);
      disposed = true;
    };
  }, [source, documentId]);

  const deck = result?.documentId === documentId ? result.deck : null;
  const error = failure?.source === source && failure.documentId === documentId ? failure.message : null;
  const isStale = !deck || result?.source !== source;
  return { deck, error, isStale, isParsing: isStale && !error };
}
