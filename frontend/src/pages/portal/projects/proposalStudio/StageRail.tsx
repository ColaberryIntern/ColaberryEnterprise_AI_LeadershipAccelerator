import React from 'react';
import type { StudentGovProjectView } from '../../../../services/govProjectPortalApi';

/** The Proposal Studio center-workspace views, in rail order. */
export type StudioView = 'overview' | 'blueprint' | 'documents' | 'evidence' | 'editor' | 'gates' | 'package' | 'needs' | 'openitems'
  // vetting-stage read-only panels, opened from the pursuit-stage chips (StageDetail)
  | 'snapshot' | 'solicitation' | 'fit' | 'decide' | 'outcome';

type Icon = { kind: 'done' | 'now' | 'num'; label: string };

/**
 * StageRail — the left process rail: the finished pursuit stages (Done), the proposal-production steps (the center
 * views), and the For-you items. Icons read done (green ✓), current (accent ring), or a number. Ported from the
 * approved design. Below 760px the shell turns this into a horizontal scroller (studio.css).
 */
export default function StageRail(
  { view, current, onNavigate }:
  { view: StudentGovProjectView; current: StudioView; onNavigate: (v: StudioView) => void },
): React.ReactElement {
  const rollup = view.buildSummary?.rollup;
  const buildLabel = rollup ? `Build (${rollup.verified} of ${rollup.total} stories)` : 'Build';
  const docCount = (view.proposalDocuments ?? []).length;
  const artifactCount = (view.buildArtifacts ?? []).length;
  const readiness = view.proposalReadiness?.pct ?? 0;
  const needCount = view.needsCount ?? 0;

  const steps: Array<{ v: StudioView; label: string; small?: string; ic: Icon }> = [
    { v: 'overview', label: 'Where we are', ic: { kind: 'now', label: '●' } },
    { v: 'blueprint', label: 'Blueprint', small: 'from ZIP', ic: view.blueprint ? { kind: 'done', label: '1' } : { kind: 'num', label: '1' } },
    { v: 'documents', label: 'Document set', small: String(docCount || ''), ic: { kind: 'num', label: '2' } },
    { v: 'evidence', label: 'Build evidence', small: artifactCount ? String(artifactCount) : undefined, ic: artifactCount ? { kind: 'done', label: '3' } : { kind: 'num', label: '3' } },
    { v: 'editor', label: 'Draft & versions', ic: { kind: 'num', label: '4' } },
    { v: 'gates', label: 'Review gates', small: `${Math.min(readiness, 95)}%`, ic: { kind: 'num', label: '5' } },
    { v: 'package', label: 'Package & submit', ic: { kind: 'num', label: '6' } },
  ];

  const icClass = (ic: Icon) => `gps-ic${ic.kind === 'done' ? ' done' : ic.kind === 'now' ? ' now' : ''}`;

  const needSeverity = needCount === 0 ? 'ok' : (view.fatalNeedsCount ?? 0) > 0 ? 'bad' : 'warn';

  return (
    <nav className="gps-rail" aria-label="Proposal process" data-tour="rail" data-testid="rail">
      <div className="gps-grp">Done</div>
      <div className="gps-past">
        <span>Snapshot</span><span>Solicitation intake</span><span>Fit</span><span>Bid decision</span><span>{buildLabel}</span>
      </div>
      {/* v4: For you → Needs you at the TOP of the live rail. */}
      <div className="gps-grp">For you</div>
      <button className={`gps-step${needCount > 0 ? ' gps-step-strong' : ''}`} data-v="openitems" data-testid="rail-step-needs" aria-current={current === 'openitems' ? 'page' : undefined} onClick={() => onNavigate('openitems')}>
        <span className="gps-ic" aria-hidden="true">!</span>
        Needs you
        <small className={`gps-rail-badge ${needSeverity}`} data-testid="rail-needs-badge">{needCount}</small>
      </button>
      <div className="gps-grp">Proposal production</div>
      {steps.map((s) => (
        <button key={s.v} className="gps-step" data-v={s.v} data-tour={s.v} data-testid={`rail-step-${s.v}`} aria-current={current === s.v ? 'page' : undefined} onClick={() => onNavigate(s.v)}>
          <span className={icClass(s.ic)} aria-hidden="true">{s.ic.label}</span>
          {s.label}
          {s.small ? <small>{s.small}</small> : null}
        </button>
      ))}
    </nav>
  );
}
