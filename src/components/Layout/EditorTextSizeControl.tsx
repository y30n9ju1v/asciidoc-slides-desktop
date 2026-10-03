import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MAX_EDITOR_FONT_SIZE, MIN_EDITOR_FONT_SIZE } from '../../services/editorPreferences';

/** Adapted from Pages: keep text-size controls beside editor settings. */
export function EditorTextSizeControl({ fontSize, onChange }: { fontSize: number; onChange: (size: number) => void }) {
  return (
    <div
      className="hidden items-center rounded-md border bg-background p-0.5 shadow-sm sm:flex"
      role="group"
      aria-label="Editor text size"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            aria-label="Decrease editor text size"
            className="size-7 text-muted-foreground"
            disabled={fontSize <= MIN_EDITOR_FONT_SIZE}
            onClick={() => onChange(fontSize - 1)}
            size="icon"
            variant="ghost"
          >
            <Minus className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Smaller editor text</TooltipContent>
      </Tooltip>
      <span className="min-w-9 select-none text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">
        {fontSize}px
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            aria-label="Increase editor text size"
            className="size-7 text-muted-foreground"
            disabled={fontSize >= MAX_EDITOR_FONT_SIZE}
            onClick={() => onChange(fontSize + 1)}
            size="icon"
            variant="ghost"
          >
            <Plus className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Larger editor text</TooltipContent>
      </Tooltip>
    </div>
  );
}
