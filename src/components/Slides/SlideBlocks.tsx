import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import hljs from 'highlight.js/lib/common';
import katex from 'katex';
import type {
  SafeAssetRef,
  SafeBlock,
  SafeInline,
  SafeListItem,
  SafeTableCell,
} from '../../../packages/asciidoc-typst/typescript/src';
import { renderMermaidSvg } from '../../services/mermaidRenderer';
import { dispatchBlock, dispatchInline, type BlockHandlers, type InlineHandlers } from '../../services/safeDispatch';
import type { BlockLayout, Slide } from '../../services/slideDeck';
import { slideItems } from '../../services/slideItems';
import { SlideVideo } from './SlideVideo';
import { useSlideAssets } from './SlideAssetsContext';
import { useSlideImageUrl } from './useSlideImageUrl';

/**
 * Renders SafeDocument blocks as React elements. Text is always React text
 * (escaped); the only HTML strings injected come from highlight.js (which
 * escapes its input), KaTeX with `trust: false`, and Mermaid in strict mode.
 */

const SAFE_LINK_RE = /^(https?:\/\/|mailto:)/i;

const ADMONITION_COLORS: Record<string, string> = {
  note: '#2563eb',
  tip: '#16a34a',
  important: '#7c3aed',
  warning: '#d97706',
  caution: '#dc2626',
};

function MissingImage({ alt, reason }: { alt: string; reason: string | null }) {
  return (
    <div className="slide-missing">
      Image not shown: {alt}
      {reason && <div style={{ fontSize: '0.8em', marginTop: 4 }}>{reason}</div>}
    </div>
  );
}

function SlideImage({ asset, alt, caption }: { asset: SafeAssetRef; alt: string; caption: string | null }) {
  const { url, error, loading } = useSlideImageUrl(asset);
  if (loading) return <div className="slide-figure" style={{ minHeight: 120 }} />;
  return (
    <figure className="slide-figure">
      {url ? <img src={url} alt={alt} draggable={false} /> : <MissingImage alt={alt} reason={error} />}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function InlineImage({ asset, alt }: { asset: SafeAssetRef; alt: string }) {
  const { url } = useSlideImageUrl(asset);
  return url ? (
    <img src={url} alt={alt} style={{ display: 'inline', height: '1em', verticalAlign: '-0.15em' }} />
  ) : (
    <>{alt}</>
  );
}

function Diagram({ code }: { code: string }) {
  const { theme } = useSlideAssets();
  const [svg, setSvg] = useState<{ code: string; svg: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void renderMermaidSvg(code, theme).then((result) => {
      if (!cancelled) setSvg({ code, svg: result });
    });
    return () => {
      cancelled = true;
    };
  }, [code, theme]);
  if (svg?.code === code && svg.svg) {
    return (
      <figure className="slide-figure">
        <div className="slide-diagram" dangerouslySetInnerHTML={{ __html: svg.svg }} />
      </figure>
    );
  }
  return (
    <pre>
      <code>{code}</code>
    </pre>
  );
}

function CodeBlock({
  code,
  language,
  highlights = [],
}: {
  code: string;
  language: string | null;
  highlights?: number[];
}) {
  const html = useMemo(() => {
    if (!language || !hljs.getLanguage(language)) return null;
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch {
      return null;
    }
  }, [code, language]);
  if (highlights.length)
    return (
      <pre className="hljs slide-highlight-code">
        <code>
          {code.split('\n').map((line, index) => (
            <span key={index} className="slide-code-line" data-highlight={highlights.includes(index + 1)}>
              <span aria-hidden="true" className="slide-code-number">
                {index + 1}
              </span>
              {line || ' '}
            </span>
          ))}
        </code>
      </pre>
    );
  return <pre className="hljs">{html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}</pre>;
}

function MathView({ tex, display }: { tex: string; display: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, output: 'html' });
    } catch {
      return null;
    }
  }, [tex, display]);
  if (!html) return <code>{tex}</code>;
  return display ? (
    <div className="slide-math-block" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function Inlines({ inlines }: { inlines: SafeInline[] }) {
  return (
    <>
      {inlines.map((inline, index) => (
        <Inline key={index} inline={inline} />
      ))}
    </>
  );
}

function Inline({ inline }: { inline: SafeInline }) {
  return dispatchInline(INLINE_VIEWS, inline, undefined);
}

const wrap =
  (Tag: 'strong' | 'em' | 'sup' | 'sub' | 'mark') =>
  (inline: { children: SafeInline[] }): ReactNode => (
    <Tag>
      <Inlines inlines={inline.children} />
    </Tag>
  );

const noteView = (inline: { children: SafeInline[] }): ReactNode => (
  <span style={{ color: 'var(--slide-muted)', fontSize: '0.7em' }}>
    {' ('}
    <Inlines inlines={inline.children} />)
  </span>
);

const INLINE_VIEWS: InlineHandlers<ReactNode> = {
  text: (inline) => inline.value,
  strong: wrap('strong'),
  emphasis: wrap('em'),
  superscript: wrap('sup'),
  subscript: wrap('sub'),
  mark: wrap('mark'),
  code: (inline) => <code>{inline.value}</code>,
  math: (inline) => <MathView tex={inline.tex} display={false} />,
  link: (inline) => {
    const children = inline.children.length ? <Inlines inlines={inline.children} /> : inline.target;
    // Links never navigate the app window; they are styled text here and
    // become real hyperlinks in PPTX/PDF.
    return SAFE_LINK_RE.test(inline.target) ? <a title={inline.target}>{children}</a> : <>{children}</>;
  },
  footnote: noteView,
  endnote: noteView,
  inlineImage: (inline) => <InlineImage asset={inline.asset} alt={inline.alt} />,
  citation: (inline) => `[${inline.key}]`,
};

function ListItems({ items }: { items: SafeListItem[] }) {
  return items.map((item, index) => (
    <li key={index}>
      {item.checked === true ? '☑ ' : item.checked === false ? '☐ ' : null}
      <Inlines inlines={item.inlines} />
      {item.blocks.length > 0 && <Blocks blocks={item.blocks} />}
    </li>
  ));
}

function TableBlock({ rows, hasHeader }: { rows: SafeTableCell[][]; hasHeader: boolean }) {
  const columns = Math.max(0, ...rows.map((row) => row.length));
  const [head, body] = hasHeader ? [rows.slice(0, 1), rows.slice(1)] : [[], rows];
  const cells = (row: SafeTableCell[], Tag: 'th' | 'td') =>
    Array.from({ length: columns }, (_, index) => (
      <Tag key={index}>{row[index] ? <Inlines inlines={row[index].inlines} /> : null}</Tag>
    ));
  return (
    <table>
      {head.length > 0 && (
        <thead>
          {head.map((row, index) => (
            <tr key={index}>{cells(row, 'th')}</tr>
          ))}
        </thead>
      )}
      <tbody>
        {body.map((row, index) => (
          <tr key={index}>{cells(row, 'td')}</tr>
        ))}
      </tbody>
    </table>
  );
}

function splitIntoColumns(blocks: SafeBlock[], count: number): SafeBlock[][] {
  if (blocks.length === 0) return Array.from({ length: count }, () => []);
  const size = Math.ceil(blocks.length / count);
  return Array.from({ length: count }, (_, index) => blocks.slice(index * size, (index + 1) * size));
}

function Caption({ text }: { text: string | null | undefined }) {
  return text ? <div className="slide-caption">{text}</div> : null;
}

function Block({ block }: { block: SafeBlock }) {
  return dispatchBlock(BLOCK_VIEWS, block, undefined);
}

const titledContainer = (block: { title: string | null; blocks: SafeBlock[] }): ReactNode => (
  <div>
    {block.title && <strong>{block.title}</strong>}
    <Blocks blocks={block.blocks} />
  </div>
);

const BLOCK_VIEWS: BlockHandlers<ReactNode> = {
  paragraph: (block) => (
    <p>
      <Inlines inlines={block.inlines} />
    </p>
  ),
  section: (block) => (
    <div>
      <div className="slide-subheading">{block.title}</div>
      <Blocks blocks={block.blocks} />
    </div>
  ),
  container: titledContainer,
  formal: titledContainer,
  documentPart: titledContainer,
  columns: (block) => (
    <div className="slide-columns" style={{ gridTemplateColumns: `repeat(${block.count}, minmax(0, 1fr))` }}>
      {splitIntoColumns(block.blocks, block.count).map((group, index) => (
        <div key={index}>
          <Blocks blocks={group} />
        </div>
      ))}
    </div>
  ),
  code: (block) => (
    <div>
      <Caption text={block.caption} />
      <CodeBlock code={block.code} language={block.language} />
    </div>
  ),
  diagram: (block) => <Diagram code={block.code} />,
  mathBlock: (block) => <MathView tex={block.tex} display />,
  image: (block) => <SlideImage asset={block.asset} alt={block.alt} caption={block.caption} />,
  list: (block) => {
    const Tag = block.ordered ? 'ol' : 'ul';
    return (
      <Tag>
        <ListItems items={block.items} />
      </Tag>
    );
  },
  descriptionList: (block) => (
    <dl className="slide-dl">
      {block.items.map((item, index) => (
        <div key={index}>
          <dt>
            <Inlines inlines={item.termInlines} />
          </dt>
          <dd>
            <Inlines inlines={item.descriptionInlines} />
            {item.descriptionBlocks.length > 0 && <Blocks blocks={item.descriptionBlocks} />}
          </dd>
        </div>
      ))}
    </dl>
  ),
  quote: (block) => {
    const source = [block.attribution, block.citation].filter(Boolean).join(', ');
    return (
      <blockquote>
        <Inlines inlines={block.inlines} />
        {source && <footer>— {source}</footer>}
      </blockquote>
    );
  },
  admonition: (block) => (
    <div
      className="slide-admonition"
      style={{ '--admonition-color': ADMONITION_COLORS[block.kind] ?? ADMONITION_COLORS.note } as CSSProperties}
    >
      <span className="slide-admonition-label">{block.kind.toUpperCase()}</span>
      <Inlines inlines={block.inlines} />
    </div>
  ),
  table: (block) => (
    <div>
      <Caption text={block.caption} />
      <TableBlock rows={block.rows} hasHeader={block.hasHeader} />
    </div>
  ),
  thematicBreak: () => <hr />,
  pageBreak: () => null,
};

function layoutStyle(layout: BlockLayout): CSSProperties {
  return {
    width: layout.width ? `${layout.width * 100}%` : undefined,
    fontSize: layout.scale ? `${layout.scale}em` : undefined,
    marginLeft: layout.align === 'center' || layout.align === 'right' ? 'auto' : undefined,
    marginRight: layout.align === 'center' ? 'auto' : undefined,
    textAlign: layout.align ?? undefined,
  };
}

/** A slide's top-level blocks and videos in source order, each wrapped in its author-set sizing. */
export function SlideBlocks({ slide }: { slide: Pick<Slide, 'blocks' | 'blockLayouts' | 'videos'> }) {
  return (
    <>
      {slideItems(slide).map((item, index) => {
        const layout = item.kind === 'block' ? item.layout : item.video.layout;
        const content =
          item.kind === 'block' ? <TopBlock block={item.block} layout={layout} /> : <SlideVideo video={item.video} />;
        return layout ? (
          <div key={index} className="slide-sized" data-align={layout.align ?? undefined} style={layoutStyle(layout)}>
            {content}
          </div>
        ) : (
          <Fragment key={index}>{content}</Fragment>
        );
      })}
    </>
  );
}

function TopBlock({ block, layout }: { block: SafeBlock; layout: BlockLayout | null }) {
  if (block.type !== 'code' || !layout?.codeHighlights?.length) return <Block block={block} />;
  return (
    <div>
      <Caption text={block.caption} />
      <CodeBlock code={block.code} language={block.language} highlights={layout.codeHighlights} />
    </div>
  );
}

export function Blocks({ blocks }: { blocks: SafeBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </>
  );
}
