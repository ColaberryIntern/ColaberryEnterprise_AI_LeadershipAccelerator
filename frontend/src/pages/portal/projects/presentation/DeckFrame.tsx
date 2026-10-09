import React, { useMemo } from 'react';

/**
 * The one place generated HTML is allowed to render, and the walls around it.
 *
 * WHAT IS BEING CONTAINED. This markup came out of a language model, from a prompt
 * built partly from text a student typed. Treat it as hostile: it may contain a
 * `<script>`, an `<iframe>`, a form posting somewhere, a `fetch` to an arbitrary
 * endpoint, or a `top.location = ...` that navigates the whole portal away.
 *
 * The portal it would be rendering inside holds an authenticated session. So the
 * question is not "is this deck probably fine" — it is "what can this markup reach if
 * it is not".
 *
 * THREE INDEPENDENT WALLS, because any one of them can be got around:
 *
 *   1. `sandbox` with NOTHING enabled. No `allow-scripts`, so script never runs. No
 *      `allow-same-origin`, so even if it did it would be in an opaque origin with no
 *      access to the portal's cookies, localStorage or session. No `allow-top-navigation`,
 *      so it cannot move the page the student is on. No `allow-forms`, no `allow-popups`.
 *      An empty sandbox attribute is the maximum restriction, not the absence of one.
 *
 *   2. A Content-Security-Policy meta inside the document itself, `default-src 'none'`
 *      with styles and images allowed inline/data only. Belt and braces: if a future
 *      edit ever adds `allow-scripts` to the sandbox, the CSP still has no script source
 *      to permit.
 *
 *   3. `srcDoc`, never `src`. The content is never fetched from a URL, so there is no
 *      request that could carry a cookie and no origin for it to inherit.
 *
 * WHY AN IFRAME AT ALL rather than sanitising and inlining. Sanitisers are a
 * denylist race: every year brings a new mutation-XSS vector that a well-maintained
 * sanitiser missed. The iframe's guarantee does not depend on correctly enumerating
 * what is dangerous.
 */

export interface DeckFrameProps {
  /** Audience-safe markup. Speaker notes must already have been removed. */
  html: string;
  title: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * `default-src 'none'` denies everything not named: no scripts, no fetch/XHR, no
 * frames, no form posts, no fonts, no media from anywhere. Styles and images are
 * allowed only inline or as data URIs, so a deck still LOOKS like a deck without
 * being able to reach the network.
 */
export const DECK_CSP = [
  "default-src 'none'",
  "img-src data: blob:",
  "style-src 'unsafe-inline'",
  "font-src data:",
].join('; ');

/** Everything the frame is allowed to do. Deliberately empty. */
export const DECK_SANDBOX = '';

/**
 * A complete, standalone document. The deck also has to work OFFLINE — a student
 * presenting from a hotel lobby cannot depend on a stylesheet request — so the styles
 * are inline and nothing is referenced externally.
 */
export function deckDocument(html: string, title: string): string {
  const safeTitle = String(title || 'Deck').replace(/[<>&]/g, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${DECK_CSP}">
<title>${safeTitle}</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 32px;
    background: #ffffff;
    color: #10243E;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0B131F; color: #E8EEF6; }
  }
  section { page-break-after: always; break-after: page; margin: 0 0 40px; }
  h1, h2 { line-height: 1.2; }
  img { max-width: 100%; height: auto; }
  /* Printing is how a deck becomes a PDF handout, so one slide per page. */
  @media print { body { padding: 0; } section { margin: 0; } }
</style>
</head>
<body>${html}</body>
</html>`;
}

const DeckFrame: React.FC<DeckFrameProps> = ({ html, title, className, style }) => {
  const doc = useMemo(() => deckDocument(html, title), [html, title]);
  return (
    <iframe
      // An empty sandbox is the MAXIMUM restriction. Adding a single token here —
      // allow-scripts especially — reopens everything the three walls above close.
      sandbox={DECK_SANDBOX}
      srcDoc={doc}
      title={title}
      referrerPolicy="no-referrer"
      className={className}
      style={{ width: '100%', border: '1px solid var(--ps-line, #E3E8EF)', borderRadius: 8, background: '#fff', ...style }}
      data-testid="ps-deck-frame"
    />
  );
};

export default DeckFrame;
