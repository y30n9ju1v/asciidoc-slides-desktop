import type { ReactNode } from 'react';
import { EditorTextSizeControl } from './EditorTextSizeControl';
import { MAX_EDITOR_FONT_SIZE, MIN_EDITOR_FONT_SIZE } from '../../services/editorPreferences';
import {
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  Moon,
  PanelLeft,
  Play,
  Presentation,
  Save,
  Settings2,
  Sun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ColorMode } from '../../hooks/useAppPreferences';
import type { ExportFormat } from '../../services/exportService';
import { SLIDE_STYLES, type SlideStyleId } from '../../services/slideStyles';
import { SLIDE_THEMES, type SlideThemeId } from '../../services/slideThemes';

interface AppHeaderProps {
  fileName: string;
  isDirty: boolean;
  slideCount: number;
  themeId: SlideThemeId;
  styleId: SlideStyleId;
  exporting: ExportFormat | null;
  canPresent: boolean;
  colorMode: ColorMode;
  vimMode: boolean;
  editorFontSize: number;
  onEditorFontSizeChange: (size: number) => void;
  explorerOpen: boolean;
  onExplorerToggle: () => void;
  onNew: () => void;
  onOpen: () => void;
  onOpenFolder: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onThemeChange: (id: SlideThemeId) => void;
  onStyleChange: (id: SlideStyleId) => void;
  onExport: (format: ExportFormat) => void;
  onPresent: () => void;
  onColorModeChange: (mode: ColorMode) => void;
  onVimModeChange: (enabled: boolean) => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function AppHeader(props: AppHeaderProps) {
  const { fileName, isDirty, slideCount, themeId, styleId, exporting, colorMode, vimMode } = props;
  return (
    <header className="app-header flex h-12 shrink-0 items-center gap-1 border-b bg-[var(--bg-header)] px-2">
      <div className="flex items-center gap-2 px-2 text-sm font-semibold">
        <Presentation className="size-4 text-[var(--color-brand)]" />
        <span className="hidden lg:inline">AsciiDoc Slides</span>
      </div>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <IconButton label={props.explorerOpen ? 'Hide files' : 'Show files'} onClick={props.onExplorerToggle}>
        <PanelLeft />
      </IconButton>
      <IconButton label={`New deck (${MOD}N)`} onClick={props.onNew}>
        <FilePlus2 />
      </IconButton>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open">
                <FolderOpen />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Open</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={props.onOpen}>Open file… ({MOD}O)</DropdownMenuItem>
          <DropdownMenuItem onSelect={props.onOpenFolder}>Open folder…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Save">
                <Save />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Save</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={props.onSave}>Save ({MOD}S)</DropdownMenuItem>
          <DropdownMenuItem onSelect={props.onSaveAs}>Save as… ({isMac ? '⇧⌘S' : 'Ctrl+Shift+S'})</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mx-2 flex min-w-0 items-center gap-1.5 text-sm text-[var(--text-muted)]">
        <FileText className="size-3.5 shrink-0" />
        <span className="truncate" title={fileName}>
          {fileName}
        </span>
        {isDirty && (
          <span
            className="size-2 shrink-0 rounded-full bg-[var(--color-warning)]"
            aria-label="Unsaved changes"
            title="Unsaved changes"
          />
        )}
        <span className="ml-1 shrink-0 text-xs text-[var(--text-subtle)]">
          {slideCount} {slideCount === 1 ? 'slide' : 'slides'}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <EditorTextSizeControl fontSize={props.editorFontSize} onChange={props.onEditorFontSizeChange} />
        <Select value={styleId} onValueChange={(value) => props.onStyleChange(value as SlideStyleId)}>
          <SelectTrigger className="h-8 w-[112px]" aria-label="Slide style">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(SLIDE_STYLES).map((style) => (
              <SelectItem key={style.id} value={style.id}>
                {style.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={themeId} onValueChange={(value) => props.onThemeChange(value as SlideThemeId)}>
          <SelectTrigger className="h-8 w-[112px]" aria-label="Slide theme">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(SLIDE_THEMES).map((theme) => (
              <SelectItem key={theme.id} value={theme.id}>
                <span className="inline-block size-3 rounded-sm border" style={{ background: theme.heroBackground }} />
                {theme.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting !== null}>
              <Download />
              {exporting ? `Exporting ${exporting.toUpperCase()}…` : 'Export'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => props.onExport('pptx')}>PowerPoint (.pptx)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onExport('pdf')}>PDF (.pdf)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" onClick={props.onPresent} disabled={!props.canPresent}>
              <Play />
              Present
            </Button>
          </TooltipTrigger>
          <TooltipContent>Present from the current slide (F5)</TooltipContent>
        </Tooltip>

        <IconButton
          label={colorMode === 'dark' ? 'Light mode' : 'Dark mode'}
          onClick={() => props.onColorModeChange(colorMode === 'dark' ? 'light' : 'dark')}
        >
          {colorMode === 'dark' ? <Sun /> : <Moon />}
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Editor settings">
              <Settings2 />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={props.editorFontSize <= MIN_EDITOR_FONT_SIZE}
              onSelect={(event) => {
                event.preventDefault();
                props.onEditorFontSizeChange(props.editorFontSize - 1);
              }}
            >
              Smaller editor text ({props.editorFontSize}px)
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={props.editorFontSize >= MAX_EDITOR_FONT_SIZE}
              onSelect={(event) => {
                event.preventDefault();
                props.onEditorFontSizeChange(props.editorFontSize + 1);
              }}
            >
              Larger editor text ({props.editorFontSize}px)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onVimModeChange(!vimMode)}>
              {vimMode ? '✓ ' : ''}Vim mode
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
