import { Description } from '@radix-ui/react-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OutputQuality } from '../Slides/OutputQuality';
import type { SlideDeck } from '../../services/slideDeck';

export function OutputQualityDialog({
  open,
  onOpenChange,
  deck,
  disabled,
  directory,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deck: SlideDeck | null;
  disabled: boolean;
  directory: string | null;
  onSelect: (index: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Output quality check</DialogTitle>
          <Description className="text-xs text-muted-foreground">
            Choose an output format. Select a slide-specific issue to return to its slide and source.
          </Description>
        </DialogHeader>
        {deck && !disabled ? (
          <OutputQuality
            deck={deck}
            directory={directory}
            onSelect={(index) => {
              onOpenChange(false);
              onSelect(index);
            }}
          />
        ) : (
          <p className="px-5 pb-5" role="status">
            Waiting for an up-to-date preview. Resolve any parsing errors first.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
