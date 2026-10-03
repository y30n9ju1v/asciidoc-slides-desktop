import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AsciidocEditor } from './AsciidocEditor';
import { ensureAsciidocHighlighting } from './shikiHighlighter';

vi.mock('monaco-editor/editor/editor.api', () => ({}));
vi.mock('monaco-editor/base/common/ime', () => ({ IME: { enable: vi.fn(), disable: vi.fn() } }));
vi.mock('monaco-editor/editor/contrib/linesOperations/browser/linesOperations', () => ({}));
vi.mock('monaco-editor/editor/contrib/format/browser/formatActions', () => ({}));
vi.mock('./shikiHighlighter', () => ({
  ensureAsciidocHighlighting: vi.fn(),
  asciidocLanguageId: 'asciidoc',
  asciidocDarkThemeId: 'dark',
  asciidocLightThemeId: 'light',
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('shows initialization failures and allows retry without changing the source', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  vi.mocked(ensureAsciidocHighlighting)
    .mockRejectedValueOnce(new Error('grammar failed'))
    .mockReturnValueOnce(new Promise(() => {}));
  try {
    await act(async () =>
      root.render(
        <AsciidocEditor
          documentId={1}
          value="keep my text"
          onChange={change}
          vimMode={false}
          colorMode="dark"
          fontSize={14}
        />,
      ),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('grammar failed');
    await act(async () => host.querySelector('button')!.click());
    expect(ensureAsciidocHighlighting).toHaveBeenCalledTimes(2);
    expect(change).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
