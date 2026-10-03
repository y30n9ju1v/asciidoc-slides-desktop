import { Description } from '@radix-ui/react-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CHEAT_SHEET_ENTRIES } from './cheatSheetEntries';

export function CheatSheetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>AsciiDoc Cheat sheet</DialogTitle>
          <Description className="text-sm text-muted-foreground">
            슬라이드 작성에 자주 쓰는 문법입니다. 예제를 선택해 복사할 수 있습니다.
          </Description>
        </DialogHeader>
        <div className="min-h-0 space-y-6 overflow-y-auto px-5 pb-5" tabIndex={0} role="region" aria-label="문법 예제">
          {CHEAT_SHEET_ENTRIES.map((entry) => (
            <section key={entry.title}>
              <h3 className="text-sm font-semibold">{entry.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{entry.note}</p>
              <pre className="mt-2 select-text overflow-x-auto rounded-md border bg-muted p-3 text-xs leading-relaxed">
                <code>{entry.code}</code>
              </pre>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
