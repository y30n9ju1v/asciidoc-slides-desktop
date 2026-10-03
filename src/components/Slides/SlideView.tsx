import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ptToPx, SLIDE_HEIGHT_PX, SLIDE_WIDTH_PX, type Slide, type SlideDeck } from '../../services/slideDeck';
import { isDarkSlideTheme, type SlideTheme } from '../../services/slideThemes';
import { SlideAssetsContext } from './SlideAssetsContext';
import { SlideBlocks } from './SlideBlocks';

/**
 * Theme colors go in as `--theme-*` on the slide element; CSS maps them to
 * the `--slide-*` variables content uses. Inline custom properties beat any
 * stylesheet rule, so the hero override (title/section slides) must remap
 * `--slide-*` rather than set the inline variables directly.
 */
function themeVariables(theme: SlideTheme): CSSProperties {
  return {
    '--theme-bg': theme.background,
    '--theme-text': theme.text,
    '--theme-muted': theme.muted,
    '--theme-accent': theme.accent,
    '--slide-hero-bg': theme.heroBackground,
    '--slide-hero-text': theme.heroText,
    '--slide-code-bg': theme.codeBackground,
    '--slide-code-text': theme.codeText,
    '--slide-table-header-bg': theme.tableHeaderBackground,
    '--slide-table-header-text': theme.tableHeaderText,
    '--slide-table-border': theme.tableBorder,
    '--slide-title-size': `${ptToPx(theme.titleSize)}px`,
    '--slide-body-size': `${ptToPx(theme.bodySize)}px`,
    // Relative, so a block's `[.small]`/`font-size=` also scales its code.
    '--slide-code-ratio': theme.codeSize / theme.bodySize,
  } as CSSProperties;
}

const FIT_EPSILON = 0.005;

/**
 * Shrinks the slide body when it overflows: lays it out wider, then scales
 * it down to fit - the same rule as the PDF writer's `fit-body`. Layout runs
 * in the slide's own 1280x720 space, so the result doesn't depend on how
 * large the preview is.
 */
function FitBody({ children }: { children: ReactNode }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [factor, setFactor] = useState(1);

  useLayoutEffect(() => {
    const area = areaRef.current;
    const body = bodyRef.current;
    if (!area || !body) return;
    const measure = () => {
      const available = area.clientHeight;
      body.style.width = '100%';
      const natural = body.scrollHeight;
      let next = 1;
      // Laid out 1/next wider, the body is no taller than `natural`, so
      // scaling by `next` always fits.
      if (available > 0 && natural > available) next = available / natural;
      body.style.width = `${100 / next}%`;
      setFactor((current) => (Math.abs(current - next) > FIT_EPSILON ? next : current));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    Array.from(body.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  });

  return (
    <div ref={areaRef} className="slide-body-area">
      <div
        ref={bodyRef}
        className="slide-body"
        style={{ width: `${100 / factor}%`, transform: factor < 1 ? `scale(${factor})` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}

function SlideSurface({ deck, slide, number }: { deck: SlideDeck; slide: Slide; number: number }) {
  if (slide.layout === 'title') {
    const byline = [deck.metadata.author, deck.metadata.date].filter(Boolean).join('  ·  ');
    return (
      <>
        {!deck.style.heroFill && <div className="slide-divider-bar" />}
        <div className="slide-title" style={{ fontSize: `calc(var(--slide-title-size) * 1.4)` }}>
          {slide.title}
        </div>
        {slide.subtitle && <div className="slide-subtitle">{slide.subtitle}</div>}
        {byline && <div className="slide-byline">{byline}</div>}
        {slide.blocks.length > 0 && (
          <div className="slide-body-area" style={{ fontSize: '0.85em' }}>
            <div className="slide-body">
              <SlideBlocks blocks={slide.blocks} layouts={slide.blockLayouts} />
            </div>
          </div>
        )}
      </>
    );
  }
  if (slide.layout === 'section') {
    return (
      <>
        <div className="slide-divider-bar" />
        <div className="slide-title" style={{ fontSize: `calc(var(--slide-title-size) * 1.25)` }}>
          {slide.title}
        </div>
        {slide.blocks.length > 0 && (
          <div className="slide-body-area">
            <div className="slide-body">
              <SlideBlocks blocks={slide.blocks} layouts={slide.blockLayouts} />
            </div>
          </div>
        )}
        <div className="slide-number">{number}</div>
      </>
    );
  }
  return (
    <>
      {!slide.hideTitle && slide.title && <div className="slide-title">{slide.title}</div>}
      <FitBody>
        <SlideBlocks blocks={slide.blocks} layouts={slide.blockLayouts} />
      </FitBody>
      <div className="slide-number">{number}</div>
    </>
  );
}

interface SlideViewProps {
  deck: SlideDeck;
  index: number;
  documentDir: string | null;
}

/** One slide, drawn at its logical 1280x720 size and scaled to the frame's width. */
export function SlideView({ deck, index, documentDir }: SlideViewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const slide = deck.slides[index];

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setScale(frame.clientWidth / SLIDE_WIDTH_PX);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const isHero = slide && slide.layout !== 'content';
  return (
    <div ref={frameRef} className="slide-frame">
      {slide && (
        <SlideAssetsContext.Provider value={{ documentDir, theme: deck.theme }}>
          <div
            className={`slide ${isHero ? 'slide-hero' : 'slide-content'}`}
            data-dark={isDarkSlideTheme(
              isHero && deck.style.heroFill ? { background: deck.theme.heroBackground } : deck.theme,
            )}
            data-font={deck.style.font}
            data-title={deck.style.titleDecoration}
            data-hero-fill={deck.style.heroFill}
            data-hero-align={deck.style.heroAlign}
            style={{
              ...themeVariables(deck.theme),
              width: SLIDE_WIDTH_PX,
              height: SLIDE_HEIGHT_PX,
              transform: `scale(${scale})`,
              visibility: scale > 0 ? 'visible' : 'hidden',
            }}
          >
            <SlideSurface deck={deck} slide={slide} number={index + 1} />
          </div>
        </SlideAssetsContext.Provider>
      )}
    </div>
  );
}
