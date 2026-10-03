import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FileExplorer } from './FileExplorer';
import { listDirectory } from '../../services/explorerEntries';

vi.mock('../../services/explorerEntries', async (original) => ({
  ...(await original<typeof import('../../services/explorerEntries')>()),
  listDirectory: vi.fn(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('removes old folder entries immediately when the root changes', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  vi.mocked(listDirectory)
    .mockResolvedValueOnce([{ name: 'old.adoc', path: '/old/old.adoc', isDirectory: false }])
    .mockReturnValueOnce(new Promise(() => {}));
  const view = (folder: string) => (
    <FileExplorer root={folder} activePath={null} onOpenDeck={vi.fn()} onInsertMedia={vi.fn()} />
  );
  try {
    await act(async () => root.render(view('/old')));
    expect(host.textContent).toContain('old.adoc');
    await act(async () => root.render(view('/new')));
    expect(host.textContent).not.toContain('old.adoc');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
