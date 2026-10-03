import { useEffect, useRef, useState } from 'react';
import type { SlideDeck } from '../services/slideDeck';
import type { ExportFormat } from '../services/exportPreflight';
import type { QualityIssue } from '../services/outputQuality';
import { checkOutputQuality } from '../services/qualityCheckService';

export function useOutputQuality(deck: SlideDeck, directory: string | null) {
  const sequence = useRef(0);
  const [result, setResult] = useState<{
    deck: SlideDeck;
    directory: string | null;
    issues: QualityIssue[];
    busy: boolean;
  } | null>(null);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  const run = async (format: ExportFormat) => {
    const ticket = ++sequence.current;
    setResult({ deck, directory, issues: [], busy: true });
    try {
      const issues = await checkOutputQuality(deck, directory, format);
      if (ticket === sequence.current) setResult({ deck, directory, issues, busy: false });
    } catch (error) {
      if (ticket === sequence.current)
        setResult({
          deck,
          directory,
          issues: [{ severity: 'error', message: `Check failed: ${String(error)}` }],
          busy: false,
        });
    }
  };
  return { run, result: result?.deck === deck && result.directory === directory ? result : null };
}
