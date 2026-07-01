import React from 'react';
import { Link } from 'react-router-dom';

/**
 * SectionFigure — a reusable image + text "figure" block.
 *
 * Renders a responsive two-column band: the image on one side, the copy on the
 * other. Columns stack vertically on narrow viewports. The image sits in a
 * rounded, soft-shadowed frame with a fixed aspect ratio and `object-fit: cover`
 * so mismatched source dimensions never distort the layout. Broken sources are
 * handled gracefully (the frame keeps its shape and shows a muted placeholder).
 *
 * The optional CTA renders as a react-router <Link> styled with the design
 * system's `.cb-btn` classes (the canonical pattern in this repo — see
 * PublicFooter). The DS button stylesheet is injected app-wide by the real
 * <Button> instances in the public chrome (navbar/footer); this component reuses
 * those class names so the CTA inherits the brand button styling.
 *
 * All visual values are design-system semantic tokens, scoped to this component
 * via a single injected <style> block so the file is fully self-contained.
 */

export interface SectionFigureCta {
  label: string;
  to: string;
}

export interface SectionFigureProps {
  /** Image source URL (required). */
  src: string;
  /** Real, descriptive alt text for the image (required for accessibility). */
  alt: string;
  /** Small uppercase label above the title. */
  eyebrow?: string;
  /** Section heading. */
  title?: string;
  /** Body copy — a single string or an array rendered as paragraphs. */
  body?: string | string[];
  /** Caption shown beneath the image frame (e.g. a credit or note). */
  caption?: string;
  /** Which side the image sits on at desktop width. @default 'right' */
  side?: 'left' | 'right';
  /** Optional call-to-action rendered as a router-aware brand button. */
  cta?: SectionFigureCta;
}

const STYLE_ID = 'cb-section-figure-css';

const CSS = `
.cb-figure {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-8);
  align-items: center;
  width: 100%;
}
.cb-figure__media { order: 1; min-width: 0; }
.cb-figure__copy  { order: 2; min-width: 0; }

/* Two columns from the medium breakpoint up. */
@media (min-width: 768px) {
  .cb-figure { grid-template-columns: 1fr 1fr; gap: var(--space-16); }
  /* Image right (default): copy first, media second. */
  .cb-figure--right .cb-figure__copy  { order: 1; }
  .cb-figure--right .cb-figure__media { order: 2; }
  /* Image left: media first, copy second. */
  .cb-figure--left  .cb-figure__media { order: 1; }
  .cb-figure--left  .cb-figure__copy  { order: 2; }
}

.cb-figure__frame {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-xl);
  overflow: hidden;
  background: var(--surface-sunken);
  box-shadow: var(--shadow-lg);
}
.cb-figure__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Broken-image safety: hide the alt-text/icon glyph the browser would draw,
     letting the muted sunken frame show through instead. */
  color: transparent;
  font-size: 0;
}

.cb-figure__caption {
  margin: var(--space-3) 0 0;
  font-family: var(--font-body);
  font-size: var(--fs-caption);
  line-height: var(--lh-normal);
  color: var(--text-muted);
}

.cb-figure__eyebrow {
  display: inline-block;
  margin: 0 0 var(--space-3);
  font-family: var(--font-body);
  font-size: var(--fs-overline);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-overline);
  text-transform: uppercase;
  color: var(--brand-accent);
}
.cb-figure__title {
  margin: 0 0 var(--space-4);
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  letter-spacing: var(--heading-ls);
  line-height: var(--lh-heading);
  color: var(--text-strong);
  text-wrap: balance;
}
.cb-figure__body {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--fs-body);
  line-height: var(--lh-relaxed);
  color: var(--text-body);
}
.cb-figure__body p { margin: 0 0 var(--space-4); }
.cb-figure__body p:last-child { margin-bottom: 0; }

.cb-figure__cta { margin-top: var(--space-6); }

@media (prefers-reduced-motion: no-preference) {
  .cb-figure__img { transition: transform var(--dur-slow) var(--ease-out); }
  .cb-figure__frame:hover .cb-figure__img { transform: scale(1.03); }
}
`;

function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function SectionFigure({
  src,
  alt,
  eyebrow,
  title,
  body,
  caption,
  side = 'right',
  cta,
}: SectionFigureProps): JSX.Element {
  injectStyles();

  const paragraphs: string[] =
    body === undefined ? [] : Array.isArray(body) ? body : [body];

  return (
    <figure className={`cb-figure cb-figure--${side}`}>
      <div className="cb-figure__media">
        <div className="cb-figure__frame">
          <img
            className="cb-figure__img"
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
          />
        </div>
        {caption ? (
          <figcaption className="cb-figure__caption">{caption}</figcaption>
        ) : null}
      </div>

      <div className="cb-figure__copy">
        {eyebrow ? <span className="cb-figure__eyebrow">{eyebrow}</span> : null}
        {title ? <h2 className="cb-figure__title">{title}</h2> : null}
        {paragraphs.length > 0 ? (
          <div className="cb-figure__body">
            {paragraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        ) : null}
        {cta ? (
          <div className="cb-figure__cta">
            <Link to={cta.to} className="cb-btn cb-btn--primary">
              <span>{cta.label}</span>
            </Link>
          </div>
        ) : null}
      </div>
    </figure>
  );
}

export default SectionFigure;
