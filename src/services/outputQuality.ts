import type { SlideDeck } from './slideDeck';
import { layoutBlocks } from './pptxLayout';

export interface QualityIssue {
  severity: 'error' | 'warning';
  message: string;
  slideIndex?: number;
}

/** Conservative PPTX layout estimate, not a claim about measured PDF glyph bounds. */
export function inspectLayoutQuality(deck: SlideDeck): QualityIssue[] {
  return deck.slides.flatMap((slide, slideIndex) => {
    const box = { x: 0, y: 0, w: 12.133, h: slide.hideTitle ? 6.3 : 5.1 };
    const frames = layoutBlocks(slide.blocks, box, deck.theme, slide.blockLayouts, slide.videos);
    const issues: QualityIssue[] = [];
    if (frames.some((frame) => frame.box.y + frame.box.h > box.h + 0.05))
      issues.push({
        severity: 'warning',
        slideIndex,
        message: `Slide ${slideIndex + 1}: content may overflow. Split it into multiple slides.`,
      });
    if (frames.some((frame) => 'fontSize' in frame && frame.fontSize < 12))
      issues.push({
        severity: 'warning',
        slideIndex,
        message: `Slide ${slideIndex + 1}: estimated text size is below 12pt. Reduce content or increase its size.`,
      });
    return issues;
  });
}
