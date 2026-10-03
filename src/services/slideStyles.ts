/**
 * Slide styles shape the layout and typography independently of the color
 * theme. Like themes, they are plain data read by all three renderers; the
 * native PDF writer accepts only these closed enum values.
 */
export interface SlideStyle {
  id: SlideStyleId;
  name: string;
  font: 'sans' | 'serif';
  /** How content-slide titles are set off from the body. */
  titleDecoration: 'none' | 'underline' | 'band';
  /** Title and section slides filled with the theme's hero color, or plain. */
  heroFill: boolean;
  heroAlign: 'left' | 'center';
}

export type SlideStyleId = 'classic' | 'underline' | 'banner' | 'minimal' | 'elegant';

export const SLIDE_STYLES: Record<SlideStyleId, SlideStyle> = {
  classic: { id: 'classic', name: 'Classic', font: 'sans', titleDecoration: 'none', heroFill: true, heroAlign: 'left' },
  underline: {
    id: 'underline',
    name: 'Underline',
    font: 'sans',
    titleDecoration: 'underline',
    heroFill: true,
    heroAlign: 'center',
  },
  banner: { id: 'banner', name: 'Banner', font: 'sans', titleDecoration: 'band', heroFill: true, heroAlign: 'left' },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    font: 'sans',
    titleDecoration: 'none',
    heroFill: false,
    heroAlign: 'left',
  },
  elegant: {
    id: 'elegant',
    name: 'Elegant',
    font: 'serif',
    titleDecoration: 'underline',
    heroFill: false,
    heroAlign: 'center',
  },
};

export const DEFAULT_SLIDE_STYLE_ID: SlideStyleId = 'classic';
export const SLIDE_STYLE_ATTRIBUTE = 'slide-style';

export function slideStyleById(id: unknown): SlideStyle {
  const key = typeof id === 'string' ? id.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(SLIDE_STYLES, key)
    ? SLIDE_STYLES[key as SlideStyleId]
    : SLIDE_STYLES[DEFAULT_SLIDE_STYLE_ID];
}
