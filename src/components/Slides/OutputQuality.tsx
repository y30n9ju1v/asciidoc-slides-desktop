import type { SlideDeck } from '../../services/slideDeck';
import { useOutputQuality } from '../../hooks/useOutputQuality';
import { Button } from '@/components/ui/button';

export function OutputQuality({
  deck,
  directory,
  onSelect,
}: {
  deck: SlideDeck;
  directory: string | null;
  onSelect: (index: number) => void;
}) {
  const { run, result } = useOutputQuality(deck, directory);
  return (
    <div className="px-5 pb-5 text-sm text-muted-foreground">
      <div className="my-2 flex gap-2">
        <Button size="sm" variant="outline" disabled={result?.busy} onClick={() => void run('pdf')}>
          Check PDF
        </Button>
        <Button size="sm" variant="outline" disabled={result?.busy} onClick={() => void run('pptx')}>
          Check PowerPoint
        </Button>
      </div>
      <p>Layout estimates and file/font availability; glyph coverage and video playback require visual review.</p>
      <div className="mt-3 max-h-64 overflow-y-auto" aria-live="polite">
        {result?.busy && <p>Checking…</p>}
        {result && !result.busy && result.issues.length === 0 && <p>No issues found by these checks.</p>}
        {result?.issues.map((issue, index) => (
          <div key={index} className="my-1">
            {issue.slideIndex === undefined ? (
              <span>
                {issue.severity}: {issue.message}
              </span>
            ) : (
              <button className="text-left underline underline-offset-2" onClick={() => onSelect(issue.slideIndex!)}>
                {issue.severity}: {issue.message}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
