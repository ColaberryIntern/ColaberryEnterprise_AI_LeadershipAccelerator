import React, { useEffect, useRef, useState } from 'react';
import { getGovBuildSpec, type GovBuildSpec } from '../../../services/factoryApi';

/**
 * BuildSpecPanel — the post-approval Build step's AI read: a lengthy build SPEC (the capabilities and
 * functionality we would build) plus advisory buyer-system RESEARCH (the platform(s) the buyer likely
 * runs, so "connect to their system" becomes a concrete integration target).
 *
 * Advisory only: generated from the ESTABLISHED requirement statements + the opportunity context, it
 * changes no gate and authors no requirement-cited story (that stays deterministic). The research is
 * LLM-knowledge-based (no live web search), so it is clearly labelled "verify". The last result is kept
 * in localStorage (per-viewer convenience) so a revisit does not force a re-run; a "Re-run" stays available.
 *
 * The spec can be long, so it is CLAMPED by default with a measured "Show more / Show less" toggle — the
 * toggle appears only when the content actually overflows the clamp, so a short spec shows no pointless button.
 */
const CLAMP_PX = 340;

/**
 * MarkdownBody — a dependency-free, lightweight Markdown renderer for AI text (the build spec / buyer-system
 * research). The model emits headings (`##`), **bold**, `code`, and numbered/bulleted lists; we render those as
 * real headings/strong/lists so the text reads like a document instead of a wall of literal asterisks. We avoid
 * react-markdown on purpose — it ships as pure ESM and breaks CRA's Jest transform.
 */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0; let k = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] != null) parts.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2] != null) parts.push(<code key={k++}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownBody({ text }: { text: string }): React.ReactElement {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0; let key = 0;
  const isList = (l: string) => /^\s*(\d+\.|[-*])\s+/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (h) { blocks.push(<div key={key++} className="fw-semibold mt-2 mb-1">{renderInline(h[2])}</div>); i++; continue; }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(<li key={items.length} className="mb-1">{renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>); i++; }
      blocks.push(<ol key={key++} className="mb-2 ps-3">{items}</ol>); continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(<li key={items.length} className="mb-1">{renderInline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>); i++; }
      blocks.push(<ul key={key++} className="mb-2 ps-3">{items}</ul>); continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isList(lines[i]) && !/^\s*#{1,6}\s+/.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={key++} className="mb-2">{renderInline(para.join(' '))}</p>);
  }
  return <div className="small">{blocks}</div>;
}

export function BuildSpecPanel({ canonical, requirements, title, buyer, daysLeft }: {
  canonical: string;
  requirements: { id: string; text: string }[];
  title?: string | null;
  buyer?: string | null;
  daysLeft?: number | null;
}): React.ReactElement {
  const storeKey = `govBuildSpec:${canonical}`;
  const [spec, setSpec] = useState<GovBuildSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { const raw = localStorage.getItem(storeKey); if (raw) setSpec(JSON.parse(raw) as GovBuildSpec); } catch { /* storage may be unavailable */ }
  }, [storeKey]);
  // Measure whether the rendered content exceeds the clamp, so the toggle shows only when it is needed.
  // scrollHeight reports the full content height even while the container is clamped (overflow hidden).
  useEffect(() => {
    const el = contentRef.current;
    setOverflowing(!!spec && !!el && el.scrollHeight > CLAMP_PX + 8);
  }, [spec]);
  const run = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const s = await getGovBuildSpec(canonical, { requirements, title: title ?? null, buyer: buyer ?? null, daysLeft: daysLeft ?? null });
      setSpec(s);
      setExpanded(false);
      try { localStorage.setItem(storeKey, JSON.stringify(s)); } catch { /* ignore */ }
    } catch { setErr('Could not generate the build spec right now.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-3">
      <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || requirements.length === 0} onClick={() => { void run(); }}>
        <i className="ri-sparkling-2-line me-1" aria-hidden="true" />{busy ? 'Generating…' : spec ? 'Re-run build spec + research' : 'Generate build spec + research (AI)'}
      </button>
      {requirements.length === 0 && <div className="small text-secondary mt-1">Establish the cited requirements first — the spec reads from them.</div>}
      {err && <div className="alert alert-warning py-2 mt-2 mb-0 small" role="status">{err}</div>}
      {spec && (spec.spec || spec.research) && (
        <div className="mt-1">
          <div ref={contentRef} style={!expanded ? { maxHeight: CLAMP_PX, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to bottom, #000 78%, transparent)', maskImage: 'linear-gradient(to bottom, #000 78%, transparent)' } : undefined}>
            <div className="row g-3">
              {spec.spec && (
                <div className="col-12">
                  <div className="border rounded p-3 h-100">
                    <div className="fw-semibold small mb-1"><i className="ri-tools-line me-1" aria-hidden="true" />Build spec — capabilities &amp; functionality</div>
                    <MarkdownBody text={spec.spec} />
                  </div>
                </div>
              )}
              {spec.research && (
                <div className="col-12">
                  <div className="border rounded p-3 h-100">
                    <div className="fw-semibold small mb-1"><i className="ri-search-eye-line me-1" aria-hidden="true" />Buyer-system research <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1">advisory — verify</span></div>
                    <MarkdownBody text={spec.research} />
                  </div>
                </div>
              )}
            </div>
          </div>
          {overflowing && (
            <button type="button" className="btn btn-link btn-sm px-0 mt-1 text-decoration-none" onClick={() => setExpanded((e) => !e)}>
              <i className={`me-1 ${expanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`} aria-hidden="true" />{expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          <div className="small text-secondary mt-1"><i className="ri-robot-2-line me-1" aria-hidden="true" />AI build spec — advisory, grounded only in the established requirements; the buyer-system research is the model&apos;s best guess (no live web search), so confirm it before relying on it. Nothing here authors a story or changes a gate.</div>
        </div>
      )}
    </div>
  );
}
