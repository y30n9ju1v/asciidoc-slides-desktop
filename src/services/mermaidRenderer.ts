import { isDarkSlideTheme, type SlideTheme } from './slideThemes';
import DOMPurify from 'dompurify';

/**
 * Renders Mermaid sources to standalone SVG. Labels use SVG <text> rather
 * than HTML <foreignObject>, which the native PDF renderer and canvas
 * rasterization (for PPTX) cannot draw. `securityLevel: 'strict'` keeps
 * Mermaid's own sanitizer on for user-authored diagram text.
 */
let mermaidModule: Promise<typeof import('mermaid').default> | null = null;
let renderCounter = 0;
const cache = new Map<string, Promise<string | null>>();

function loadMermaid() {
  mermaidModule ??= import('mermaid').then((module) => module.default);
  return mermaidModule;
}

async function render(code: string, dark: boolean): Promise<string | null> {
  const id = `slide-mermaid-${renderCounter++}`;
  try {
    const mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      fontFamily: "'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    });
    const { svg } = await mermaid.render(id, code);
    return DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['foreignObject', 'a'],
    });
  } catch {
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
    return null;
  }
}

// Mermaid keeps global configuration, so renders run one at a time.
let queue: Promise<unknown> = Promise.resolve();

export function renderMermaidSvg(code: string, theme: SlideTheme): Promise<string | null> {
  const dark = isDarkSlideTheme(theme);
  const key = `${dark ? 'dark' : 'light'}\u0000${code}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = queue.then(() => render(code, dark));
    queue = pending.catch(() => null);
    cache.set(key, pending);
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  }
  return pending;
}
