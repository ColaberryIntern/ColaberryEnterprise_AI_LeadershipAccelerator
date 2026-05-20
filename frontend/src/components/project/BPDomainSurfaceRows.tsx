/**
 * BPDomainSurfaceRows — DomainRow + BPLine subcomponents for BPDomainSurface.
 *
 * Extracted in the Operational Leverage Sprint, 2026-05-15, to bring
 * BPDomainSurface back under the module size ceiling before adding the
 * leverage layer. Pure presentation — no hooks, no state, no fetches.
 * BPDomainSurface owns those and passes values down.
 *
 * One semantic addition while we're here: each domain row now renders a
 * forwardLookingNote alongside the existing backward-looking pressureNote.
 * The two are mirrored — pressure looking upstream, leverage looking
 * downstream — and live in the same italic group so they read together.
 */
import React from 'react';
import {
  type DomainBucket,
  type BPLike,
  type LifecycleState,
  type DomainKey,
  type DomainRelationship,
} from '../../utils/bpDomainClassifier';
import { type Direction } from '../../hooks/useDomainMomentum';
import { forwardLookingNote } from '../../utils/operationalLeverage';
import { trustLabel, confidenceLine } from '../../utils/structuralConfidence';
import { metadataItems } from '../../utils/scanSpeedSignals';
import { dedupByFrontendRoute } from '../../utils/bpRowDedup';
import { bpPillars, type PillarSignal, type PillarStatus } from '../../utils/bpSignals';
import { inheritedDomainContextSentence } from '../../utils/bpInheritedContext';
import { pathwayStageLabel } from '../../utils/pathwayStage';

// Lifecycle state → tone. Softer than completion% — no hot reds.
export const LIFECYCLE_TONE: Record<LifecycleState, { fg: string; bg: string }> = {
  Foundational: { fg: 'var(--color-text-light)', bg: 'rgba(113,128,150,0.08)' },
  Emerging:     { fg: '#b45309', bg: 'rgba(245,158,11,0.10)' },
  Coordinated:  { fg: '#1d4ed8', bg: 'rgba(59,130,246,0.10)' },
  Operational:  { fg: '#15803d', bg: 'rgba(56,161,105,0.12)' },
  Scaling:      { fg: '#0e7490', bg: 'rgba(8,145,178,0.12)' },
  Stabilizing:  { fg: '#6d28d9', bg: 'rgba(139,92,246,0.10)' },
};

export const MOMENTUM_TONE: Record<Direction, { fg: string; bg: string; symbol: string }> = {
  up:            { fg: '#15803d', bg: 'rgba(56,161,105,0.10)', symbol: '↑' },
  down:          { fg: '#b91c1c', bg: 'rgba(229,62,62,0.08)',  symbol: '↓' },
  flat:          { fg: 'var(--color-text-light)', bg: 'transparent', symbol: '·' },
  'first-visit': { fg: 'var(--color-text-light)', bg: 'transparent', symbol: '·' },
};

// Relationship verb → directional glyph + tone.
export const REL_STYLE: Record<DomainRelationship['verb'], { glyph: string; fg: string }> = {
  'receives from': { glyph: '↑', fg: '#0e7490' },  // upstream
  'feeds':         { glyph: '↓', fg: '#1d4ed8' },  // downstream
  'supports':      { glyph: '→', fg: '#15803d' },  // cross-cut out
  'supported by':  { glyph: '←', fg: '#6d28d9' },  // cross-cut in
};

export const DomainRow: React.FC<{
  bucket: DomainBucket;
  momentum: { delta: number | null; direction: Direction; label: string; minutesSince: number | null } | undefined;
  isExpanded: boolean;
  isPulsing: boolean;
  /** Cory's current next_action lives in this domain — render the priority badge + accent border. */
  isCoryPriority?: boolean;
  /** This domain is downstream of the Cory priority — render a muted linkage border. */
  isDownstreamOfPriority?: boolean;
  registerRef: (el: HTMLElement | null) => void;
  onToggle: () => void;
  onNavigate: (key: DomainKey) => void;
  onPickBp: (id: string) => void;
}> = ({ bucket, momentum, isExpanded, isPulsing, isCoryPriority, isDownstreamOfPriority, registerRef, onToggle, onNavigate, onPickBp }) => {
  const tone = LIFECYCLE_TONE[bucket.lifecycleState];
  const mom = momentum || { delta: null, direction: 'first-visit' as Direction, label: 'baseline', minutesSince: null };
  const momTone = MOMENTUM_TONE[mom.direction];

  // Subtle left-border accent expresses dependency linkage without a
  // graph. Priority domain gets full primary; downstream domains get
  // muted-primary; everything else is the standard border.
  const accentBorder = isCoryPriority
    ? '3px solid var(--color-primary)'
    : isDownstreamOfPriority
      ? '3px solid var(--color-primary-light)'
      : '1px solid var(--color-border)';
  const accentBg = isCoryPriority
    ? 'linear-gradient(to right, rgba(26, 54, 93, 0.025), white 80px)'
    : isDownstreamOfPriority
      ? 'linear-gradient(to right, rgba(43, 108, 176, 0.015), white 60px)'
      : 'white';

  const downstreamSummary = bucket.downstreamCount === 0
    ? 'No downstream dependencies yet'
    : `${bucket.downstreamCount} operational area${bucket.downstreamCount === 1 ? '' : 's'} depend${bucket.downstreamCount === 1 ? 's' : ''} on this domain`;

  const forwardNote = forwardLookingNote(bucket);
  const confidence = confidenceLine(bucket);
  const scanItems = metadataItems(bucket);

  return (
    <section
      ref={registerRef}
      className={isPulsing ? 'ws-domain-pulse' : undefined}
      style={{
        background: accentBg,
        border: '1px solid var(--color-border)',
        borderLeft: accentBorder,
        borderRadius: 8, overflow: 'hidden',
      }}
    >
      {/* Header — toggles expand. Contains only non-interactive content. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '1rem 1.15rem 0.7rem', textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-alt)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <i
          className={`bi ${bucket.icon}`}
          aria-hidden="true"
          style={{ fontSize: 18, color: 'var(--color-text-light)', opacity: 0.7, flexShrink: 0, width: 22, marginTop: 2 }}
        ></i>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-primary)', letterSpacing: '-0.005em' }}>
              {bucket.label}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-light)', fontWeight: 500 }}>
              · {bucket.processes.length} BP{bucket.processes.length === 1 ? '' : 's'}
            </span>
            <span
              title={`Lifecycle state: ${bucket.lifecycleState}`}
              style={{
                fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: tone.fg, background: tone.bg, padding: '2px 7px',
                borderRadius: 3, fontWeight: 600,
              }}>
              {trustLabel(bucket.lifecycleState)}
            </span>
            {pathwayStageLabel(bucket.key) && (
              <span
                title={`${bucket.label} sits in the ${pathwayStageLabel(bucket.key)} stage of the operational pathway (Entry → Coordination → Execution → Reporting).`}
                style={{
                  fontSize: 11.5,
                  color: 'var(--color-text-light)',
                  fontWeight: 500,
                  letterSpacing: 0,
                }}>
                <span aria-hidden="true" style={{ opacity: 0.55, marginRight: 4 }}>·</span>
                {pathwayStageLabel(bucket.key)}
              </span>
            )}
            {isCoryPriority && (
              <span
                title="Cory's current operational priority lives in this domain"
                style={{
                  fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'white', background: 'var(--color-primary)', padding: '2px 8px',
                  borderRadius: 3, fontWeight: 600,
                }}>
                Current priority
              </span>
            )}
            {mom.direction !== 'first-visit' && mom.direction !== 'flat' && (
              <span title={mom.minutesSince != null ? `since ${mom.minutesSince}m ago` : undefined} style={{
                fontSize: 10.5, color: momTone.fg, background: momTone.bg,
                padding: '2px 6px', borderRadius: 3, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{momTone.symbol}</span>
                {mom.label}
                {mom.delta != null && Math.abs(mom.delta) >= 1 && (
                  <span style={{ opacity: 0.8, marginLeft: 2 }}>{mom.delta > 0 ? '+' : ''}{mom.delta}</span>
                )}
              </span>
            )}
          </div>

          {/* Scan-speed metadata strip — calm editorial signals visible
              without expanding the row. Executive Signal Layering Sprint,
              2026-05-15. Hidden when the bucket carries no signal. Never
              bold, never colored, never icon'd — pure editorial fragments. */}
          {scanItems.length > 0 && (
            <div style={{
              fontSize: 11.5, color: 'var(--color-text-light)',
              marginTop: 3, marginBottom: 5, lineHeight: 1.4,
              fontWeight: 400, fontVariantNumeric: 'tabular-nums',
              maxWidth: 720,
            }}>
              {scanItems.map((item, i) => (
                <React.Fragment key={item}>
                  {i > 0 && <span aria-hidden="true" style={{ opacity: 0.45, margin: '0 6px' }}>·</span>}
                  <span>{item}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Narrative */}
          <div style={{ fontSize: 13, color: 'var(--color-text-light)', lineHeight: 1.6, maxWidth: 720 }}>
            {bucket.narrative}
          </div>

          {/* Structural confidence — calm one-liner about how this area
              feels operationally. Sits with the narrative so it reads as
              part of describing the domain, not an event note. */}
          {confidence && (
            <div style={{ fontSize: 12, color: 'var(--color-text)', marginTop: 4, lineHeight: 1.5, fontStyle: 'italic', opacity: 0.85, maxWidth: 720 }}>
              {confidence}
            </div>
          )}
        </div>

        <i
          className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`}
          style={{ fontSize: 12, color: 'var(--color-text-light)', flexShrink: 0, marginTop: 5 }}
        ></i>
      </button>

      {/* Relationship strip — always visible, CLICKABLE chips. Sits outside
          the toggle button so chip clicks navigate instead of toggling. */}
      {(bucket.relationships.length > 0 || bucket.pressureNote || forwardNote) && (
        <div style={{
          padding: '0 1.15rem 0.85rem 3.4rem',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {bucket.relationships.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {bucket.relationships.map((rel, idx) => {
                const rs = REL_STYLE[rel.verb];
                return (
                  <button
                    key={`${rel.verb}:${rel.targetKey}:${idx}`}
                    type="button"
                    onClick={() => onNavigate(rel.targetKey)}
                    title={`${bucket.label} ${rel.verb} ${rel.targetLabel} — click to jump`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)',
                      borderRadius: 999, padding: '2px 9px 2px 7px',
                      fontSize: 10.5, color: 'var(--color-text-light)', cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = rs.fg;
                      e.currentTarget.style.color = 'var(--color-text)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.color = 'var(--color-text-light)';
                    }}
                  >
                    <span style={{ color: rs.fg, fontWeight: 700, fontSize: 11 }}>{rs.glyph}</span>
                    <span>{rel.verb} <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{rel.targetLabel}</strong></span>
                  </button>
                );
              })}
            </div>
          )}
          {bucket.pressureNote && (
            <div style={{
              fontSize: 11, color: '#92400e', fontStyle: 'italic',
              display: 'flex', alignItems: 'flex-start', gap: 5, lineHeight: 1.5,
            }}>
              <i className="bi bi-exclamation-circle" style={{ fontSize: 11, marginTop: 2, flexShrink: 0, opacity: 0.8 }}></i>
              <span>{bucket.pressureNote}</span>
            </div>
          )}
          {/* Forward-looking leverage note — mirrors the backward pressureNote.
              Where pressure looks upstream ("constrained by …"), leverage
              looks downstream ("strengthening this would stabilize …"). */}
          {forwardNote && (
            <div style={{
              fontSize: 11, color: '#1d4ed8', fontStyle: 'italic',
              display: 'flex', alignItems: 'flex-start', gap: 5, lineHeight: 1.5,
            }}>
              <i className="bi bi-arrow-down-right-circle" style={{ fontSize: 11, marginTop: 2, flexShrink: 0, opacity: 0.8 }}></i>
              <span>{forwardNote}</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded — operational role + downstream summary + BP list */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-alt)' }}>
          <div style={{
            padding: '0.8rem 1.4rem 0.7rem 3.4rem',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <div style={{
              fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 4,
            }}>
              Operational role
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text)', lineHeight: 1.6, maxWidth: 680 }}>
              {bucket.entryRole}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-light)', marginTop: 5 }}>
              <i className="bi bi-diagram-2 me-1" style={{ fontSize: 11 }}></i>
              {downstreamSummary}.
            </div>
          </div>
          <div style={{
            padding: '0.55rem 1.4rem 0.4rem 3.4rem',
            fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--color-text-light)', fontWeight: 600,
          }}>
            Processes in this domain
          </div>
          {inheritedDomainContextSentence(bucket.label, bucket.downstreamCount) && (
            <div style={{
              padding: '0 1.4rem 0.5rem 3.4rem',
              fontSize: 11.5, color: 'var(--color-text-light)',
              fontStyle: 'italic', opacity: 0.85, lineHeight: 1.4,
            }}>
              {inheritedDomainContextSentence(bucket.label, bucket.downstreamCount)}
            </div>
          )}
          {dedupByFrontendRoute(bucket.processes).map(p => (
            <BPLine
              key={p.id}
              bp={p}
              inheritedAccent={isCoryPriority ? 'priority' : isDownstreamOfPriority ? 'downstream' : null}
              onPick={() => onPickBp(p.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export const BPLine: React.FC<{
  bp: BPLike;
  /** Inherited from the parent DomainRow. 'priority' applies the same
   *  3px primary accent the domain header carries; 'downstream' applies
   *  the muted primary-light variant. Extends the dependency-marker
   *  vocabulary through the hierarchy so the operator can scan BP rows
   *  and see at a glance which ones sit inside the active zone. */
  inheritedAccent?: 'priority' | 'downstream' | null;
  onPick: () => void;
}> = ({ bp, inheritedAccent, onPick }) => {
  const matched = bp.matched_requirements || 0;
  const total = bp.total_requirements || 0;
  const pct = total > 0 ? Math.round((matched / total) * 100) : 0;
  const usable = bp.usability?.usable === true;
  // Page-aware labeling (2026-05-19). For a Page BP the detection IS the
  // evidence — if the brownfield scanner found it, the page exists. Telling
  // the operator "Not built yet" is contradictory and pushed real built
  // pages into a build queue that wasn't appropriate. Pages get
  // "Built · awaits review" / "Built" instead of the legacy harsh labels.
  // 2026-05-20: a non-empty frontend_route is now a reliable page signal
  // regardless of source (brownfield-discovered caps can have routes after
  // the Phase 0 backfill that derived them from linked components). Without
  // this, caps like "Marketing Dashboard" (source=brownfield_discovered,
  // frontend_route=/admin/marketing) showed "Not built yet" even though
  // the page renders. Adds frontend_route as a fourth way to be a Page.
  const isPage = !!(bp as any).is_page_bp
    || (bp as any).source === 'frontend_page'
    || /\s(landing\s)?page$/i.test((bp as any).name || '')
    || !!(bp as any).frontend_route;
  const pageHasFrontend = isPage && (
    !!(bp as any).frontend_route
    || ((bp as any).usability?.frontend && (bp as any).usability.frontend !== 'missing')
  );

  let word: string;
  let wordColor: string;
  let wordTooltip: string;
  if (pageHasFrontend) {
    // Page is built; remaining work (if any) is operator-judgment review.
    // 2026-05-20: language sharpened after operator confusion — the
    // previous "Built · awaits review" merged two unrelated things
    // (page exists vs. UI Advisor not run yet). Now split the signals:
    //   "Page built"            = renders + UI Advisor passed
    //   "Page built · UI review pending" = renders, UI Advisor not yet run
    // The "X/Y" requirements count next to this chip is a SEPARATE
    // dimension (req→code matching) — different concern, surfaced
    // independently.
    if (usable) {
      word = 'Page built';
      wordColor = '#15803d';
      wordTooltip = 'The page renders and operator has run UI Advisor + verified categories.';
    } else {
      word = 'Page built · UI review pending';
      wordColor = '#1d4ed8';
      wordTooltip = 'The page renders. The matched/total count beside it is a separate dimension (requirement→code matching). "UI review pending" means run UI Advisor on this page to complete it.';
    }
  } else {
    word = usable ? 'Usable' : pct >= 50 ? 'Forming' : pct > 0 ? 'Early' : 'Not built yet';
    wordColor = usable ? '#15803d' : pct >= 50 ? '#1d4ed8' : 'var(--color-text-light)';
    wordTooltip = `Coverage state: ${matched}/${total} requirements matched (${pct}%).`;
  }
  const accentBorderLeft = inheritedAccent === 'priority'
    ? '3px solid var(--color-primary)'
    : inheritedAccent === 'downstream'
      ? '3px solid var(--color-primary-light)'
      : undefined;
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        width: '100%', background: 'transparent', border: 'none',
        borderBottom: '1px solid var(--color-border)',
        borderLeft: accentBorderLeft,
        padding: '0.6rem 1.4rem 0.6rem 3.4rem',
        textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 13, color: 'var(--color-text)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'white'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bp.name}
        {(bp as any)._dupe_count > 0 && (
          <span
            title={`Also includes: ${((bp as any)._dupe_names || []).join(', ')}`}
            style={{
              marginLeft: 6, padding: '1px 6px',
              fontSize: 10, fontWeight: 600,
              color: 'var(--color-text-light)',
              background: 'var(--color-bg-alt)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
            }}
          >
            +{(bp as any)._dupe_count}
          </span>
        )}
      </span>
      {/* 2026-05-20: same B/F/A pillar dots as the Components tab.
          Sources usability first (richer signal: ready/partial/missing/na);
          falls back to linked_*.length presence for brownfield caps whose
          usability isn't populated. Tooltip shows the file count so the
          operator can still get to the underlying number on hover. */}
      <BPRowPillars bp={bp} />
      <MaturityChip level={bp.maturity?.level} label={bp.maturity?.label} />
      {total > 0 && (
        <span style={{ fontSize: 11, color: 'var(--color-text-light)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {matched}/{total}
        </span>
      )}
      <BuiltnessIcon
        isPage={isPage}
        pageHasFrontend={pageHasFrontend}
        usable={usable}
        pct={pct}
        tooltip={wordTooltip}
      />
      <i className="bi bi-chevron-right" style={{ fontSize: 10, color: 'var(--color-text-light)', flexShrink: 0, opacity: 0.6 }}></i>
    </button>
  );
};

/**
 * BP row pillars — same shape as the Components tab. Reuses bpPillars()
 * which reads `usability.{backend,frontend,agent}` first. When usability
 * is unset (common for brownfield-discovered caps), synthesizes a
 * "ready / na" status from the linked_* array lengths so the dots still
 * carry honest signal instead of all reading "missing."
 */
const BPRowPillars: React.FC<{ bp: any }> = ({ bp }) => {
  const usabilityPresent = !!bp.usability && (
    !!bp.usability.backend || !!bp.usability.frontend || !!bp.usability.agent
  );
  let pillars: PillarSignal[];
  if (usabilityPresent) {
    pillars = bpPillars(bp);
  } else {
    pillars = [
      synthPillar('backend', (bp.linked_backend_services || []).length),
      synthPillar('frontend', (bp.linked_frontend_components || []).length),
      synthPillar('agent', (bp.linked_agents || []).length),
    ];
  }
  // Tooltip carries the raw file count so the operator can still see "5 files"
  // on hover — the previous LayerBadge showed counts inline which prompted
  // the "what does BE 4 mean?" question. Counts go on hover, dots on screen.
  const counts: Record<PillarSignal['label'], number> = {
    backend: (bp.linked_backend_services || []).length,
    frontend: (bp.linked_frontend_components || []).length,
    agent: (bp.linked_agents || []).length,
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {pillars.map(p => (
        <span key={p.label} title={`${p.description} (${counts[p.label]} file${counts[p.label] === 1 ? '' : 's'})`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 9.5, fontWeight: 600, color: p.tone.fg,
          background: p.tone.bg, padding: '1px 5px', borderRadius: 3,
          textTransform: 'uppercase', letterSpacing: '0.05em',
          opacity: p.status === 'na' ? 0.4 : 1,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }}></span>
          {p.label[0].toUpperCase()}
        </span>
      ))}
    </span>
  );
};

const PILLAR_TONES: Record<PillarStatus, { fg: string; bg: string }> = {
  ready:   { fg: '#15803d', bg: '#dcfce7' },
  partial: { fg: '#b45309', bg: '#fef3c7' },
  missing: { fg: '#b91c1c', bg: '#fee2e2' },
  na:      { fg: '#9ca3af', bg: 'transparent' },
};

function synthPillar(label: PillarSignal['label'], count: number): PillarSignal {
  const status: PillarStatus = count > 0 ? 'ready' : 'na';
  return {
    label, status, tone: PILLAR_TONES[status],
    description: count > 0
      ? `${cap1(label)} present (${count} file${count === 1 ? '' : 's'})`
      : `${cap1(label)} not detected`,
  };
}

function cap1(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * BuiltnessIcon — replaces the long "Page built · UI review pending" text
 * chip with a compact icon + tooltip. Operator scans icons left-to-right;
 * full meaning on hover.
 *   - check-circle (green) → page built + UI Advisor verified
 *   - eye (blue)           → page built, UI Advisor pending
 *   - circle (muted)       → no signal yet (Not built yet)
 *   - dot-circle (blue)    → partial/forming (non-page BPs with some coverage)
 */
const BuiltnessIcon: React.FC<{
  isPage: boolean;
  pageHasFrontend: boolean;
  usable: boolean;
  pct: number;
  tooltip: string;
}> = ({ isPage, pageHasFrontend, usable, pct, tooltip }) => {
  let icon: string;
  let color: string;
  let label: string;
  if (pageHasFrontend) {
    if (usable) { icon = 'bi-check-circle-fill'; color = '#15803d'; label = 'Page built · UI Advisor verified'; }
    else        { icon = 'bi-eye'; color = '#1d4ed8'; label = 'Page built · UI review pending'; }
  } else if (usable) {
    icon = 'bi-check-circle-fill'; color = '#15803d'; label = 'Usable';
  } else if (pct >= 50) {
    icon = 'bi-dot'; color = '#1d4ed8'; label = 'Forming';
  } else if (pct > 0) {
    icon = 'bi-circle-half'; color = '#1d4ed8'; label = 'Early';
  } else {
    icon = 'bi-circle'; color = 'var(--color-text-light)'; label = 'Not built yet';
  }
  return (
    <i
      className={`bi ${icon}`}
      title={`${label}\n${tooltip}`}
      aria-label={label}
      style={{
        fontSize: 14, color, flexShrink: 0,
        opacity: icon === 'bi-circle' ? 0.55 : 1,
      }}
    />
  );
};

const MATURITY_TONES: Record<number, { fg: string; bg: string; border: string }> = {
  0: { fg: 'var(--color-text-light)', bg: 'transparent', border: 'var(--color-border)' },
  1: { fg: '#1d4ed8', bg: 'rgba(37, 99, 235, 0.08)', border: 'rgba(37, 99, 235, 0.25)' },
  2: { fg: '#7c3aed', bg: 'rgba(124, 58, 237, 0.08)', border: 'rgba(124, 58, 237, 0.25)' },
  3: { fg: '#15803d', bg: 'rgba(21, 128, 61, 0.08)', border: 'rgba(21, 128, 61, 0.25)' },
  4: { fg: '#0f766e', bg: 'rgba(15, 118, 110, 0.10)', border: 'rgba(15, 118, 110, 0.30)' },
};

const MATURITY_LABEL: Record<number, string> = {
  0: 'Not Started', 1: 'Prototype', 2: 'Functional', 3: 'Production', 4: 'Autonomous',
};

const MaturityChip: React.FC<{ level?: number; label?: string }> = ({ level, label }) => {
  if (typeof level !== 'number') return null;
  const tone = MATURITY_TONES[level] || MATURITY_TONES[0];
  const fullLabel = label || MATURITY_LABEL[level] || '';
  return (
    <span
      title={`Maturity L${level} — ${fullLabel}`}
      style={{
        flexShrink: 0,
        padding: '1px 6px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.03em',
        color: tone.fg,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 4,
      }}
    >
      L{level}
    </span>
  );
};
