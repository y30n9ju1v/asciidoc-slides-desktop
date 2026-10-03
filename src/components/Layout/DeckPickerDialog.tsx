import { FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DeckPickerDialogProps {
  decks: string[];
  onPick: (path: string) => void;
  onClose: () => void;
}

/** Lets the user choose which deck to open when a folder holds several. */
export function DeckPickerDialog({ decks, onPick, onClose }: DeckPickerDialogProps) {
  return (
    <Dialog open={decks.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Open a deck</DialogTitle>
        </DialogHeader>
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {decks.map((path) => (
            <li key={path}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
                onClick={() => onPick(path)}
              >
                <FileText className="size-4 shrink-0 text-[var(--text-muted)]" />
                <span className="truncate">{path.split(/[\\/]/).pop()}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
