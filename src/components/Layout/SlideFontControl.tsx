import { useState } from 'react';
import { Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Description as DialogDescription } from '@radix-ui/react-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSystemFonts } from '../../hooks/useSystemFonts';

export function SlideFontControl({ value, onChange }: { value?: string; onChange: (font: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { fonts, error, loading } = useSystemFonts(open);
  const currentFont = value || 'System default';
  const choose = (font: string) => {
    onChange(font);
    setOpen(false);
  };
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 gap-1.5 px-2"
            aria-label={`Slide font: ${currentFont}`}
            title={currentFont}
            onClick={() => setOpen(true)}
          >
            <Type />
            <span className="max-w-28 truncate text-xs">{currentFont}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Slide font: {currentFont}</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-5">
          <DialogHeader>
            <DialogTitle>Slide font</DialogTitle>
            <DialogDescription>
              Installed fonts only. Check your text in the preview; not every font supports Korean or every symbol. Code
              and math use separate fonts.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Current: {currentFont}</p>
          <input
            className="h-9 rounded-md border bg-background px-3 text-sm"
            aria-label="Search fonts"
            placeholder="Search installed fonts…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button variant="outline" onClick={() => choose('')}>
            Use system default
          </Button>
          {loading && <p role="status">Loading installed fonts…</p>}
          {error && <p role="alert">Could not load fonts. Close and reopen to retry. {error}</p>}
          {!loading && !error && (
            <div className="max-h-64 overflow-y-auto" role="group" aria-label="Installed fonts">
              {fonts
                .filter((font) => font.toLowerCase().includes(query.toLowerCase()))
                .map((font) => (
                  <Button
                    className="w-full justify-start"
                    variant={value === font ? 'secondary' : 'ghost'}
                    key={font}
                    aria-pressed={value === font}
                    onClick={() => choose(font)}
                  >
                    {font}
                  </Button>
                ))}
              {fonts.length === 0 && <p>No readable system fonts found.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
