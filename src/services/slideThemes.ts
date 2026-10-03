/**
 * Slide themes are plain data shared by every output. The preview reads the
 * colors as CSS values, the PPTX exporter as hex strings, and the native PDF
 * writer re-validates each one as `#rrggbb` before it reaches Typst source.
 */
export interface SlideTheme {
  id: SlideThemeId;
  name: string;
  background: string;
  text: string;
  muted: string;
  accent: string;
  /** Background of title and section-divider slides. */
  heroBackground: string;
  heroText: string;
  codeBackground: string;
  codeText: string;
  tableHeaderBackground: string;
  tableHeaderText: string;
  tableBorder: string;
  /** Font sizes in points - identical across preview, PPTX, and PDF. */
  titleSize: number;
  bodySize: number;
  codeSize: number;
}

export type SlideThemeId = 'light' | 'dark' | 'ocean' | 'warm';

const BASE_SIZES = { titleSize: 32, bodySize: 20, codeSize: 14 } as const;

export const SLIDE_THEMES: Record<SlideThemeId, SlideTheme> = {
  light: {
    id: 'light',
    name: 'Light',
    background: '#ffffff',
    text: '#1f2328',
    muted: '#656d76',
    accent: '#6d28d9',
    heroBackground: '#6d28d9',
    heroText: '#ffffff',
    codeBackground: '#f3f4f6',
    codeText: '#1f2328',
    tableHeaderBackground: '#ede9fe',
    tableHeaderText: '#1f2328',
    tableBorder: '#d0d7de',
    ...BASE_SIZES,
  },
  dark: {
    id: 'dark',
    name: 'Dark',
    background: '#1e1e1e',
    text: '#e6e6e6',
    muted: '#9a9a9a',
    accent: '#b389f9',
    heroBackground: '#121212',
    heroText: '#ffffff',
    codeBackground: '#2a2a2a',
    codeText: '#e6e6e6',
    tableHeaderBackground: '#2f2a45',
    tableHeaderText: '#ffffff',
    tableBorder: '#3a3a3a',
    ...BASE_SIZES,
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    background: '#f7fafc',
    text: '#102a43',
    muted: '#486581',
    accent: '#0b7285',
    heroBackground: '#102a43',
    heroText: '#f0f4f8',
    codeBackground: '#e6eef5',
    codeText: '#102a43',
    tableHeaderBackground: '#d9e8f5',
    tableHeaderText: '#102a43',
    tableBorder: '#bcccdc',
    ...BASE_SIZES,
  },
  warm: {
    id: 'warm',
    name: 'Warm',
    background: '#fbf7f0',
    text: '#3d2c1e',
    muted: '#7a6552',
    accent: '#c2410c',
    heroBackground: '#3d2c1e',
    heroText: '#fbf7f0',
    codeBackground: '#f1e9dc',
    codeText: '#3d2c1e',
    tableHeaderBackground: '#f6dcc8',
    tableHeaderText: '#3d2c1e',
    tableBorder: '#e2d3bf',
    ...BASE_SIZES,
  },
};

export const DEFAULT_SLIDE_THEME_ID: SlideThemeId = 'light';

export function slideThemeById(id: unknown): SlideTheme {
  const key = typeof id === 'string' ? id.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(SLIDE_THEMES, key)
    ? SLIDE_THEMES[key as SlideThemeId]
    : SLIDE_THEMES[DEFAULT_SLIDE_THEME_ID];
}

/** Perceived brightness of the slide background (YIQ). */
export function isDarkSlideTheme(theme: Pick<SlideTheme, 'background'>): boolean {
  const hex = theme.background.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/** The document attribute that selects a deck's theme, e.g. `:slide-theme: dark`. */
export const SLIDE_THEME_ATTRIBUTE = 'slide-theme';
