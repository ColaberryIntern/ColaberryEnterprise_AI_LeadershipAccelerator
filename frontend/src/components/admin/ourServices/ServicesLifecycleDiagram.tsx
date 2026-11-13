import React, { useMemo } from 'react';
import { SectionCard } from '../shell';
import MermaidDiagram from '../../visuals/MermaidDiagram';
import { SOURCE_FILL } from './ourServicesModel';

/**
 * ServicesLifecycleDiagram - "How Our Services grows": the five-step strip and the lifecycle flowchart, copied
 * from the design mockup's Mermaid source.
 *
 * Mermaid styles nodes with literal colors, so the class definitions are built at render time from the CSS design
 * tokens (`getComputedStyle`), never from hex written in this file. A token that does not resolve (tests, an
 * unstyled environment) drops its class definition and Mermaid falls back to its theme colors.
 */

const FLOW = [
  'flowchart LR',
  '  A["🏗️ Inside case study<br/>Project Factory"]:::inside --> G',
  '  B["📁 Outside case study<br/>Google Drive"]:::outside --> G',
  '  G{"🔒 Linked to<br/>a service?"}:::gate',
  '  G -- "Existing service" --> S["❤️ Our Services<br/>evidence updated"]:::svc',
  '  G -- "No fit" --> N["🌱 New Growth service<br/>admin review"]:::grow',
  '  N --> S',
  '  S --> M["🏛️ Can we deliver it?"]:::gov',
  '  M -- "We have it" --> P["📝 Proposal cites<br/>case studies"]:::svc',
  '  M -- "Partly / New" --> X["⚠️ Check for<br/>unlinked proof"]:::gap',
  '  X -. "Found it" .-> G',
  '  X -. "Real gap" .-> N',
  '  P --> W["🏆 Win and build"]:::svc',
  '  W -. "New case study" .-> A',
];

/** Each class: [fill token, stroke token, extra]. Text always uses the strong text token. */
const CLASSES: Record<string, [string, string, string]> = {
  inside: ['--blue-50', '--chart-1', ''],
  // No plain-color violet tint token exists (--status-violet-bg is a color-mix(), which Mermaid's comma-split
  // classDef parser cannot take), so Outside uses the subtle neutral fill with the violet stroke.
  outside: ['--neutral-50', '--chart-5', ''],
  gate: ['--red-50', '--red-500', ',stroke-width:2px'],
  svc: ['--surface-card', '--text-strong', ''],
  grow: ['--green-50', '--status-success', ''],
  gov: ['--amber-50', '--status-warning', ''],
  gap: ['--amber-50', '--red-500', ',stroke-dasharray:4 3'],
};

export type TokenReader = (name: string) => string;

/** A hex/rgb literal only; anything else (empty, an unresolved var(), color-mix()) is unusable inside Mermaid. */
const usable = (v: string): boolean => /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(v.trim());

/** PURE: the Mermaid source with class definitions resolved from tokens. Exported for tests. */
export function buildLifecycleChart(read: TokenReader): string {
  const text = read('--text-strong').trim();
  const defs = Object.entries(CLASSES).flatMap(([name, [fill, stroke, extra]]) => {
    const f = read(fill).trim();
    const s = read(stroke).trim();
    if (!usable(f) || !usable(s)) return [];
    return [`  classDef ${name} fill:${f},stroke:${s}${usable(text) ? `,color:${text}` : ''}${extra}`];
  });
  return [...FLOW, ...defs].join('\n');
}

const STEPS: Array<{ n: string; title: string; body: string; gate?: boolean }> = [
  { n: '1️⃣', title: 'Capture', body: 'A Project Factory build finishes, or someone uploads a PDF from the Drive library.' },
  { n: '2️⃣', title: 'AI suggests services', body: 'Keywords and capabilities are pulled out and scored against the catalog.' },
  { n: '🔒', title: 'Required: link it', body: 'Attach to one or more existing services, or propose a new one. Nothing publishes otherwise.', gate: true },
  { n: '📈', title: 'Evidence recalculated', body: 'Service score, freshness, industries and NAICS update automatically.' },
  { n: '🏛️', title: 'Better Gov fit', body: '"Can we deliver it?" cites real case studies. Gaps become Growth services.' },
];

const dot = (color: string): React.CSSProperties => ({ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', background: color });

export default function ServicesLifecycleDiagram(): React.ReactElement {
  const chart = useMemo(() => {
    const style = typeof window !== 'undefined' ? window.getComputedStyle(document.documentElement) : null;
    return buildLifecycleChart((name) => (style ? style.getPropertyValue(name) : ''));
  }, []);
  return (
    <SectionCard
      className="mb-4"
      title={<><span aria-hidden="true">🔁 </span>How Our Services grows</>}
      subtitle="Every case study has to land on a service, and every service has to earn its case studies. Gaps found in proposals feed back into the catalog."
      actions={
        <div className="d-flex gap-3 text-secondary flex-wrap text-nowrap" style={{ fontSize: '.75rem' }}>
          <span><i style={dot(SOURCE_FILL.inside)} aria-hidden="true" /> Inside</span>
          <span><i style={dot(SOURCE_FILL.outside)} aria-hidden="true" /> Outside</span>
          <span><i style={dot('var(--red-500)')} aria-hidden="true" /> Required gate</span>
        </div>
      }
    >
      <ol className="row g-2 list-unstyled mb-3" aria-label="The five steps from case study to Gov fit">
        {STEPS.map((s) => (
          <li key={s.title} className="col-12 col-sm-6 col-xl">
            <div className={`h-100 rounded-3 border p-3 ${s.gate ? 'bg-danger-subtle border-danger-subtle' : 'bg-body-tertiary'}`}>
              <div className="fs-4 lh-1" aria-hidden="true">{s.n}</div>
              <div className="fw-bold mt-2 mb-1" style={{ fontSize: '.875rem' }}>{s.title}</div>
              <div className="text-body-secondary" style={{ fontSize: '.78rem', lineHeight: 1.45 }}>{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="border-top pt-3">
        <MermaidDiagram
          id="our-services-lifecycle"
          chart={chart}
          caption="Inside and outside case studies must be linked to a service. Proposal gaps either find unlinked proof or become new Growth services."
        />
      </div>
    </SectionCard>
  );
}
