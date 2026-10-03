import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, FileText, Folder, Image as ImageIcon, File, RefreshCw } from 'lucide-react';
import { readDir } from '@tauri-apps/plugin-fs';
import { imageMimeType, joinPath } from '../../services/deckAssets';
import { cn } from '@/lib/utils';

interface Entry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface FileExplorerProps {
  onRefresh?: () => void;
  root: string;
  activePath: string | null;
  onOpenDeck: (path: string) => void;
  /** An image clicked in the tree (absolute path). */
  onInsertImage: (path: string) => void;
}

const isDeck = (name: string) => /\.(adoc|asciidoc)$/i.test(name);

/** Directories first, then files; hidden entries are skipped. */
async function listDirectory(directory: string): Promise<Entry[]> {
  const entries = await readDir(directory);
  return entries
    .filter((entry) => !entry.name.startsWith('.') && !entry.isSymlink)
    .map((entry) => ({ name: entry.name, path: joinPath(directory, entry.name), isDirectory: entry.isDirectory }))
    .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
}

type EntryKind = 'directory' | 'deck' | 'image' | 'other';

function entryKind(entry: Entry): EntryKind {
  if (entry.isDirectory) return 'directory';
  if (isDeck(entry.name)) return 'deck';
  return imageMimeType(entry.name) !== null ? 'image' : 'other';
}

const KIND_ICONS = { directory: Folder, deck: FileText, image: ImageIcon, other: File } as const;

interface NodeProps extends Omit<FileExplorerProps, 'root'> {
  entry: Entry;
  root: string;
  depth: number;
  version: number;
}

function ExplorerNode({ entry, root, depth, version, ...actions }: NodeProps) {
  const [open, setOpen] = useState(false);
  const kind = entryKind(entry);
  const active = entry.path === actions.activePath;
  const Icon = KIND_ICONS[kind];
  const onClick = {
    directory: () => setOpen((value) => !value),
    deck: () => actions.onOpenDeck(entry.path),
    image: () => actions.onInsertImage(entry.path),
    other: () => undefined,
  }[kind];

  return (
    <li>
      <button
        type="button"
        disabled={kind === 'other'}
        title={kind === 'image' ? 'Insert this image at the cursor' : entry.name}
        aria-expanded={kind === 'directory' ? open : undefined}
        aria-current={active ? 'true' : undefined}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px] text-[var(--text-muted)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-main)] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent',
          active && 'bg-[var(--item-active-bg)] text-[var(--text-main)]',
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 transition-transform',
            open && 'rotate-90',
            kind !== 'directory' && 'invisible',
          )}
        />
        <Icon className={cn('size-3.5 shrink-0', active && 'text-[var(--color-brand)]')} />
        <span className="truncate">{entry.name}</span>
      </button>
      {open && <DirectoryList directory={entry.path} root={root} depth={depth + 1} version={version} {...actions} />}
    </li>
  );
}

function DirectoryList({ directory, depth, ...rest }: Omit<NodeProps, 'entry'> & { directory: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDirectory(directory).then(
      (result) => {
        if (cancelled) return;
        setEntries(result);
        setError(null);
      },
      (reason: unknown) => !cancelled && setError(String(reason)),
    );
    return () => {
      cancelled = true;
    };
  }, [directory, rest.version]);

  if (error) return <div className="px-3 py-1 text-xs text-[var(--destructive)]">{error}</div>;
  if (!entries) return null;
  if (entries.length === 0 && depth === 0)
    return <div className="px-3 py-2 text-xs text-[var(--text-subtle)]">Empty folder</div>;
  return (
    <ul>
      {entries.map((entry) => (
        <ExplorerNode key={entry.path} entry={entry} depth={depth} {...rest} />
      ))}
    </ul>
  );
}

/** The open deck's folder as a tree: decks open on click, images insert an `image::` line. */
export function FileExplorer({ root, onRefresh, ...actions }: FileExplorerProps) {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  // Pick up files added outside the app when the window regains focus.
  useEffect(() => {
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 text-xs font-semibold tracking-wide text-[var(--text-subtle)] uppercase">
        <span className="truncate" title={root}>
          {root.split(/[\\/]/).filter(Boolean).pop()}
        </span>
        <button
          type="button"
          aria-label="Refresh"
          title="Refresh"
          className="rounded p-1 hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-main)]"
          onClick={() => {
            refresh();
            onRefresh?.();
          }}
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-1 pb-2" aria-label="Files">
        <DirectoryList directory={root} root={root} depth={0} version={version} {...actions} />
      </nav>
    </div>
  );
}
