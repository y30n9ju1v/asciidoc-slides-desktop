import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Presenter } from './Presenter';
import { parseSlideDeck } from '../../services/slideDeckService';

vi.mock('./SlideView', () => ({
  SlideView: ({ index }: { index: number }) => (
    <div>
      Slide {index + 1}
      <button type="button">Play video</button>
      <video controls tabIndex={0} />
    </div>
  ),
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setFullscreen: async () => {} }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
});

it('allows keyboard access to video controls while retaining Escape and trapping Tab', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const deck = await parseSlideDeck('== One\n\n== Two');
  const onExit = vi.fn();
  await act(async () => root.render(<Presenter deck={deck} startIndex={0} documentDir={null} onExit={onExit} />));
  const presenter = document.querySelector<HTMLElement>('.presenter')!;
  presenter.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
  );
  expect(document.activeElement).toBe(document.querySelector('video'));
  presenter.focus();
  presenter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(document.querySelector('.presenter-exit'));
  const play = document.querySelector<HTMLButtonElement>('.presenter-stage button')!;
  play.focus();
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  play.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(false);
  expect(presenter.getAttribute('aria-label')).toBe('Slide 1 of 2');
  const video = document.querySelector('video')!;
  const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
  video.dispatchEvent(arrow);
  expect(arrow.defaultPrevented).toBe(false);
  play.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(onExit).toHaveBeenCalledWith(0);
});

it('isolates presentation input, navigates, and restores editor focus on exit', async () => {
  const background = document.createElement('div');
  const editor = document.createElement('textarea');
  background.append(editor);
  document.body.append(background);
  editor.focus();
  const editorKey = vi.fn();
  editor.addEventListener('keydown', editorKey);
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const deck = await parseSlideDeck('== One\n\n== Two');
  const onExit = vi.fn();
  await act(async () => root.render(<Presenter deck={deck} startIndex={0} documentDir={null} onExit={onExit} />));
  const presenter = document.querySelector<HTMLElement>('.presenter')!;
  expect(document.activeElement).toBe(presenter);
  expect(background.hasAttribute('inert')).toBe(true);
  const typing = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
  editor.dispatchEvent(typing);
  expect(typing.defaultPrevented).toBe(true);
  expect(editorKey).not.toHaveBeenCalled();
  await act(async () => presenter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(presenter.getAttribute('aria-label')).toBe('Slide 2 of 2');
  presenter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(onExit).toHaveBeenCalledWith(1);
  await act(async () => root.render(null));
  expect(background.hasAttribute('inert')).toBe(false);
  expect(document.activeElement).toBe(editor);
});
