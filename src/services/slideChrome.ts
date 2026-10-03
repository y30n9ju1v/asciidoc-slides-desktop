import { plainText } from '../../packages/asciidoc-typst/typescript/src';
import type { Slide, SlideChrome } from './slideDeck';

export interface ChromeSettings {
  header?: unknown;
  footer?: unknown;
  numbers?: unknown;
  titleNumber?: unknown;
  start?: unknown;
}

const enabled = (value: unknown, fallback: boolean) =>
  value == null ? fallback : String(value).toLowerCase() !== 'false';
const label = (value: unknown) =>
  plainText(String(value ?? ''))
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 160);

function defaultNumberVisible(global: ChromeSettings, layout: Slide['layout']) {
  return enabled(global.numbers, true) && (layout !== 'title' || enabled(global.titleNumber, false));
}

/** Hidden numbers still count the physical slide; a split slide gets its own number. */
export function resolveSlideChrome(
  global: ChromeSettings,
  local: ChromeSettings,
  layout: Slide['layout'],
  index: number,
): SlideChrome {
  if (layout === 'closing') {
    return resolveSlideChrome({ ...global, header: '', footer: '', numbers: false }, local, 'content', index);
  }
  const start = Number(global.start ?? 1);
  const first = Number.isInteger(start) && start >= 0 && start <= 9999 ? start : 1;
  const defaultVisible = defaultNumberVisible(global, layout);
  return {
    header: label(local.header ?? global.header),
    footer: label(local.footer ?? global.footer),
    pageNumber: enabled(local.numbers, defaultVisible) ? String(first + index) : '',
  };
}

export function slideChrome(slide: Slide, index: number): SlideChrome {
  return (
    slide.chrome ?? {
      header: '',
      footer: '',
      pageNumber: ['title', 'closing'].includes(slide.layout) ? '' : String(index + 1),
    }
  );
}
