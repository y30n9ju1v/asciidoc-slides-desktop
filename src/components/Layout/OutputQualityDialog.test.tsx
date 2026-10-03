import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { OutputQualityDialog } from './OutputQualityDialog';
import { parseSlideDeck } from '../../services/slideDeckService';

const run = vi.fn();
vi.mock('../../hooks/useOutputQuality', () => ({
  useOutputQuality: () => ({
    run,
    result: { busy: false, issues: [{ severity: 'warning', message: 'Check slide 2', slideIndex: 1 }] },
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function mount(disabled = false) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  const deck = await parseSlideDeck('= Example\n\n== Second\n\nText');
  await act(async () =>
    root.render(
      <OutputQualityDialog
        open
        onOpenChange={onOpenChange}
        deck={deck}
        disabled={disabled}
        directory={null}
        onSelect={onSelect}
      />,
    ),
  );
  return { onSelect, onOpenChange };
}

it('checks either format and closes before navigating to a slide issue', async () => {
  const { onSelect, onOpenChange } = await mount();
  const buttons = [...document.querySelectorAll('button')];
  await act(async () => buttons.find((button) => button.textContent === 'Check PDF')!.click());
  expect(run).toHaveBeenLastCalledWith('pdf');
  await act(async () => buttons.find((button) => button.textContent === 'Check PowerPoint')!.click());
  expect(run).toHaveBeenLastCalledWith('pptx');
  await act(async () => buttons.find((button) => button.textContent?.includes('Check slide 2'))!.click());
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(onSelect).toHaveBeenCalledWith(1);
  expect(onOpenChange.mock.invocationCallOrder[0]).toBeLessThan(onSelect.mock.invocationCallOrder[0]);
});

it('does not offer checks or outdated results while the preview is stale', async () => {
  await mount(true);
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Waiting for an up-to-date preview');
  expect(document.body.textContent).not.toContain('Check PDF');
  expect(document.body.textContent).not.toContain('Check slide 2');
});
