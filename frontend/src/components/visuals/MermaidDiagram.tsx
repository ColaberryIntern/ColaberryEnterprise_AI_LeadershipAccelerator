import React, { useEffect, useId, useRef, useState } from 'react';

/**
 * MermaidDiagram
 * --------------
 * Renders a Mermaid chart client-side, themed to the Colaberry brand.
 * Mermaid is loaded at RUNTIME from a CDN (never bundled) via a dynamic
 * `import()` with `webpackIgnore`, so it adds nothing to the app bundle and
 * is fetched only on pages that actually use a diagram.
 *
 * Graceful fallback: if the CDN import or the render throws (offline, CSP
 * block, malformed chart), the component shows a tasteful captioned
 * placeholder card instead of crashing the surrounding page.
 */

interface MermaidDiagramProps {
  /** Mermaid source text (e.g. a `flowchart TD ...` string). */
  chart: string;
  /** Optional caption rendered beneath the diagram (and in the fallback). */
  caption?: string;
  /** Optional stable id; one is generated when omitted. */
  id?: string;
}

// Brand-tuned Mermaid theme. Kept as a module constant so the object identity
// is stable and it isn't reconstructed on every render.
const THEME_VARIABLES = {
  primaryColor: '#FFE7E8',
  primaryTextColor: '#1A1A1A',
  lineColor: '#367895',
  primaryBorderColor: '#FB2832',
  fontFamily: 'Roboto, sans-serif',
} as const;

const MERMAID_CDN =
  'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

type RenderState = 'loading' | 'ready' | 'error';

function MermaidDiagram({ chart, caption, id }: MermaidDiagramProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  // Mermaid requires a DOM-id-safe string (no colons, which useId can emit).
  const diagramId = (id ?? `mermaid-${reactId}`).replace(/[^a-zA-Z0-9_-]/g, '-');

  const [state, setState] = useState<RenderState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function renderChart(): Promise<void> {
      setState('loading');
      try {
        // Mermaid ships no first-party types for the ESM CDN build, and we
        // deliberately keep it out of package.json (loaded at runtime only),
        // so there is nothing to type against here. `any` is justified: the
        // module shape is external and unbundled. We still guard every call.
        // (No eslint-disable here: react-scripts' eslint config does not load
        // @typescript-eslint/no-explicit-any, so a disable comment for it would
        // itself error — see frontend/CLAUDE.md. The bare `any` lints clean.)
        const m: any = await import(
          /* webpackIgnore: true */ MERMAID_CDN as string
        );

        const mermaid = m?.default ?? m;
        if (!mermaid || typeof mermaid.render !== 'function') {
          throw new Error('Mermaid module did not expose a render() function');
        }

        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: THEME_VARIABLES,
        });

        const { svg } = await mermaid.render(`${diagramId}-svg`, chart);
        if (cancelled) return;

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
        setState('ready');
      } catch {
        // Offline / CSP-blocked CDN / invalid chart syntax all land here.
        // We intentionally do not surface the raw error to the UI; the
        // fallback card is the user-facing recovery path.
        if (!cancelled) {
          if (containerRef.current) containerRef.current.innerHTML = '';
          setState('error');
        }
      }
    }

    void renderChart();

    return () => {
      cancelled = true;
    };
  }, [chart, diagramId]);

  return (
    <figure className="cb-mermaid" data-state={state}>
      <style>{`
        .cb-mermaid {
          margin: 0;
          padding: var(--space-6);
          background: var(--surface-card);
          border: var(--border-1) solid var(--border-subtle);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          overflow-x: auto;
        }
        .cb-mermaid__canvas {
          display: flex;
          justify-content: center;
          min-height: var(--space-16);
        }
        .cb-mermaid__canvas svg {
          max-width: 100%;
          height: auto;
        }
        .cb-mermaid__caption {
          margin-top: var(--space-4);
          color: var(--text-muted);
          font-family: var(--font-body);
          font-size: var(--fs-caption);
          line-height: var(--lh-normal);
          text-align: center;
        }
        /* Loading + fallback share a calm, centered, on-brand placeholder. */
        .cb-mermaid__placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-3);
          min-height: var(--space-20);
          padding: var(--space-8) var(--space-6);
          color: var(--text-muted);
          font-family: var(--font-body);
          font-size: var(--fs-body-sm);
          text-align: center;
        }
        .cb-mermaid__badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: var(--space-12);
          height: var(--space-12);
          border-radius: var(--radius-circle);
          background: var(--surface-brand-subtle);
          color: var(--brand-accent);
          font-size: var(--fs-h4);
          line-height: 1;
        }
        .cb-mermaid__placeholder-title {
          color: var(--text-body);
          font-weight: var(--fw-medium);
        }
        /* Reduced-motion: kill the loading spin entirely. */
        .cb-mermaid__spinner {
          width: var(--space-8);
          height: var(--space-8);
          border-radius: var(--radius-circle);
          border: var(--border-3) solid var(--border-subtle);
          border-top-color: var(--brand-accent);
          animation: cb-mermaid-spin var(--dur-slower) linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .cb-mermaid__spinner {
            animation: none;
            border-top-color: var(--border-default);
          }
        }
        @keyframes cb-mermaid-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {state === 'loading' && (
        <div className="cb-mermaid__placeholder" role="status" aria-live="polite">
          <span className="cb-mermaid__spinner" aria-hidden="true" />
          <span>Rendering diagram&hellip;</span>
        </div>
      )}

      {state === 'error' && (
        <div className="cb-mermaid__placeholder" role="img" aria-label={caption ?? 'Diagram unavailable'}>
          <span className="cb-mermaid__badge" aria-hidden="true">&#9650;</span>
          <span className="cb-mermaid__placeholder-title">Diagram preview unavailable</span>
          <span>{caption ?? 'This visual could not be rendered in your current environment.'}</span>
        </div>
      )}

      {/* The live render target. Hidden until ready so empty/loading states
          don't flash a blank box; kept mounted so the ref is always present. */}
      <div
        ref={containerRef}
        className="cb-mermaid__canvas"
        role="img"
        aria-label={caption ?? 'Diagram'}
        style={{ display: state === 'ready' ? 'flex' : 'none' }}
      />

      {caption && state === 'ready' && (
        <figcaption className="cb-mermaid__caption">{caption}</figcaption>
      )}
    </figure>
  );
}

export default MermaidDiagram;
