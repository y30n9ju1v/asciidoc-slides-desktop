import { expect, it, vi } from 'vitest';
import { renderMermaidSvg } from './mermaidRenderer';
import { slideThemeById } from './slideThemes';

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock('mermaid', () => ({ default: mermaid }));

it('sanitizes generated SVG before any renderer receives it', async () => {
  mermaid.render.mockResolvedValueOnce({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="bad()"><script>bad()</script><text>safe</text><a href="https://example.com"><text>link</text></a><foreignObject>html</foreignObject></svg>',
  });
  const svg = await renderMermaidSvg('test sanitization', slideThemeById('light'));
  expect(svg).toContain('safe');
  expect(svg).not.toMatch(/onload|<script|<a\s|foreignObject/);
});

it('handles initialization failure and continues processing later diagrams', async () => {
  mermaid.initialize.mockImplementationOnce(() => {
    throw new Error('setup failed');
  });
  expect(await renderMermaidSvg('failure', slideThemeById('light'))).toBeNull();
  mermaid.render.mockResolvedValueOnce({ svg: '<svg><text>next</text></svg>' });
  expect(await renderMermaidSvg('next diagram', slideThemeById('light'))).toContain('next');
});
