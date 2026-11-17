import React, { useState } from 'react';
import type { BuildResponse, EvidenceTier, FinderBuild, FinderDelta, FinderProposal } from '../../../../services/caseStudyFinderApi';

/**
 * FinderProposalCard - one proposed case study, read at a glance: the need it answers, the AI-judged fit, the
 * before -> after evidence (same formula as the catalog), then the What/When/Where/Why/How, what we can show, and
 * the Build step. Build is two clicks: review the exact path scope and command, then confirm. It creates a PRIVATE
 * draft and a Basecamp ticket; it never publishes.
 */
export const TIER_STYLE: Record<EvidenceTier, { label: string; cls: string; bar: string }> = {
  proven: { label: 'Proven', cls: 'bg-success-subtle text-success-emphasis', bar: 'var(--bs-success)' },
  emerging: { label: 'Emerging', cls: 'bg-info-subtle text-info-emphasis', bar: 'var(--bs-info)' },
  thin: { label: 'Thin', cls: 'bg-warning-subtle text-warning-emphasis', bar: 'var(--bs-warning)' },
  none: { label: 'No proof', cls: 'bg-danger-subtle text-danger-emphasis', bar: 'var(--bs-danger)' },
};

const Tier = ({ t }: { t: EvidenceTier }): React.ReactElement => <span className={`badge rounded-pill ${TIER_STYLE[t].cls}`}>{TIER_STYLE[t].label}</span>;

export function DeltaView({ d, serviceName }: { d: FinderDelta; serviceName: string }): React.ReactElement {
  const bar = (score: number, t: EvidenceTier, label: string, testId: string): React.ReactElement => (
    <div className="d-flex align-items-center gap-2 small" data-testid={testId}>
      <span className="text-secondary flex-shrink-0" style={{ width: 46 }}>{label}</span>
      <div className="flex-grow-1 bg-body-tertiary rounded" style={{ height: 12 }} aria-hidden="true">
        <div className="rounded" style={{ width: `${Math.max(2, score)}%`, height: 12, background: TIER_STYLE[t].bar }} />
      </div>
      <b className="text-nowrap" style={{ width: 28, textAlign: 'right' }}>{score}</b><Tier t={t} />
    </div>
  );
  return (
    <div className="border rounded-3 p-2 bg-body" data-testid="finder-delta">
      <div className="small fw-bold mb-1">
        <i className="ri-line-chart-line me-1" aria-hidden="true" />Profile: {serviceName}
        <span className="badge rounded-pill bg-success ms-2">+{d.scoreChange}</span>
        {d.tierChange && <span className="badge rounded-pill bg-success-subtle text-success-emphasis ms-1">{TIER_STYLE[d.before.tier].label} → {TIER_STYLE[d.after.tier].label}</span>}
      </div>
      {bar(d.before.score, d.before.tier, 'Before', 'finder-delta-before')}
      {bar(d.after.score, d.after.tier, 'After', 'finder-delta-after')}
      <div className="d-flex flex-wrap gap-3 small mt-1">
        <span><b>{d.before.insideCount} → {d.after.insideCount}</b> inside case studies</span>
        {d.openOpportunities !== null && <span><b>{d.openOpportunities}</b> open Gov {d.openOpportunities === 1 ? 'opportunity' : 'opportunities'} {d.firstProof ? 'get their first proof' : 'get more proof'}</span>}
        {d.fitGapsAnswered > 0 && <span><b>{d.fitGapsAnswered}</b> proposal {d.fitGapsAnswered === 1 ? 'gap' : 'gaps'} answered</span>}
      </div>
      <div className="text-secondary" style={{ fontSize: '.72rem' }}>{d.assumption}</div>
    </div>
  );
}

const W = ({ k, v }: { k: string; v: string }): React.ReactElement => (
  <div className="small"><span className="fw-bold text-secondary text-uppercase" style={{ fontSize: '.7rem', letterSpacing: '.04em' }}>{k}</span><div>{v}</div></div>
);

function BuiltView({ b }: { b: FinderBuild }): React.ReactElement {
  const syncTone = b.syncStatus === 'success' || b.syncStatus === 'unchanged' ? 'success' : b.syncStatus === 'running' ? 'info' : 'warning';
  return (
    <div className="border border-success rounded-3 p-2 bg-success-subtle" data-testid="finder-built">
      <div className="small fw-bold text-success-emphasis mb-1"><i className="ri-checkbox-circle-line me-1" aria-hidden="true" />Draft created (private). A Claude Code session does the authoring.</div>
      <div className="d-flex flex-wrap gap-2 small">
        <a className="btn btn-success btn-sm" href={b.caseStudyUrl} target="_blank" rel="noopener noreferrer">Open draft<span className="visually-hidden"> (opens in a new tab)</span></a>
        {b.ticketUrl
          ? <a className="btn btn-outline-success btn-sm" href={b.ticketUrl} target="_blank" rel="noopener noreferrer" data-testid="finder-ticket">Basecamp build ticket<span className="visually-hidden"> (opens in a new tab)</span></a>
          : <span className="text-danger-emphasis" data-testid="finder-ticket-error"><i className="ri-alert-line me-1" aria-hidden="true" />No ticket: {b.ticketError ?? 'Basecamp did not answer'}. Paste the command below into Claude Code.</span>}
        <span className={`badge rounded-pill bg-${syncTone}-subtle text-${syncTone}-emphasis align-self-center`}>Sync: {b.syncStatus}</span>
      </div>
      {b.syncNote && <div className="small text-warning-emphasis mt-1">{b.syncNote}</div>}
      <CommandBox command={b.command} />
    </div>
  );
}

function CommandBox({ command }: { command: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  return (
    <div className="d-flex gap-2 align-items-start mt-2">
      <code className="d-block flex-grow-1 small p-2 bg-body border rounded text-break" data-testid="finder-command">{command}</code>
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => {
        void navigator.clipboard?.writeText(command).then(() => setCopied(true)).catch(() => setCopied(false));
      }}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

export default function FinderProposalCard({ p, build, busy, onBuild }: {
  p: FinderProposal; build: FinderBuild | null; busy: boolean;
  onBuild: (p: FinderProposal, ack: boolean) => Promise<BuildResponse | null>;
}): React.ReactElement {
  const [reviewing, setReviewing] = useState(false);
  const [ack, setAck] = useState(false);
  const [stop, setStop] = useState<BuildResponse | null>(null);
  const n = p.narrative;
  const warn = stop?.kind === 'overlap' ? stop.overlaps : p.possibleOverlaps;
  const needsAck = warn.length > 0 && (stop?.kind !== 'overlap' || stop.needsAcknowledgement);
  const hardStop = stop?.kind === 'overlap' && !stop.needsAcknowledgement;

  const confirm = async (): Promise<void> => {
    const res = await onBuild(p, ack);
    setStop(res && (res.kind === 'built' || res.kind === 'exists') ? null : res);
    if (res && (res.kind === 'built' || res.kind === 'exists')) setReviewing(false);
  };

  return (
    <article className="border rounded-3 p-3 bg-body-tertiary" data-testid={`finder-proposal-${p.id}`} aria-labelledby={`finder-title-${p.id}`}>
      <div className="d-flex flex-wrap align-items-start gap-2 mb-2">
        <span className="badge rounded-pill bg-dark">#{p.rank}</span>
        <h3 className="h6 mb-0 me-auto" id={`finder-title-${p.id}`}>{n.title}</h3>
        <span className={`badge rounded-pill ${p.fit.score >= 85 ? 'bg-success' : 'bg-success-subtle text-success-emphasis'}`} title={p.fit.why ?? undefined}>
          Fit {p.fit.score}{p.fit.source === 'keywords' ? ' (keywords only)' : ''}
        </span>
      </div>
      <div className="small mb-2">
        <span className={`badge rounded-pill me-1 ${p.need.kind === 'service' ? 'bg-primary-subtle text-primary-emphasis' : 'bg-warning-subtle text-warning-emphasis'}`}>
          {p.need.kind === 'service' ? `Proves: ${p.need.name}` : `Capability: ${p.need.name}`}
        </span>
        <span className="text-secondary">{p.process.owner}/{p.process.repo} · {p.process.root || 'whole repository'}</span>
      </div>
      {p.fit.why && <div className="small fst-italic text-secondary mb-2">{p.fit.why}</div>}

      <div className="row g-2 mb-2">
        <div className="col-12 col-lg-6">{p.delta ? <DeltaView d={p.delta} serviceName={p.need.name} /> : (
          <div className="border rounded-3 p-2 bg-body small h-100"><b>No score to move yet.</b> This capability has no service; the case study gives live proposals evidence for it.</div>
        )}</div>
        <div className="col-12 col-lg-6">
          <div className="border rounded-3 p-2 bg-body h-100 small">
            <div className="fw-bold mb-1"><i className="ri-alarm-warning-line me-1 text-danger" aria-hidden="true" />The need</div>
            <ul className="mb-1 ps-3">{p.need.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <div><b>How it helps:</b> {n.helps}</div>
            <div><b>How it solves it:</b> {n.solves}</div>
          </div>
        </div>
      </div>

      <div className="row g-2 mb-2">
        {([['What', n.what], ['When', n.when], ['Where', n.where], ['Why', n.why], ['How', n.how]] as const).map(([k, v]) => (
          <div className="col-12 col-md-6 col-xl" key={k}><W k={k} v={v} /></div>
        ))}
      </div>

      <div className="small mb-2">
        <div className="fw-bold"><i className="ri-eye-line me-1" aria-hidden="true" />What we can show</div>
        <ul className="mb-0 ps-3">{n.canShow.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>

      {warn.length > 0 && (
        <div className={`alert ${hardStop ? 'alert-danger' : 'alert-warning'} py-1 px-2 small mb-2`} role={hardStop ? 'alert' : 'note'} data-testid="finder-overlaps">
          <b>{hardStop ? 'Stopped: an existing case study already covers this. Nothing was created.' : 'Possible overlap. Check before building:'}</b>
          <ul className="mb-0 ps-3">{warn.map((w) => <li key={`${w.reason}-${w.caseStudy?.id ?? ''}`}>{w.reason}{w.caseStudy ? `: "${w.caseStudy.title}" (${w.caseStudy.status})` : ''}</li>)}</ul>
        </div>
      )}

      {build ? <BuiltView b={build} /> : !reviewing ? (
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || hardStop} onClick={() => { setReviewing(true); setStop(null); }} data-testid="finder-build">
          <i className="ri-hammer-line me-1" aria-hidden="true" />Build this case study…
        </button>
      ) : (
        <div className="border border-primary rounded-3 p-2 bg-body" data-testid="finder-review">
          <div className="small fw-bold mb-1">Review, then confirm. This runs the skill&apos;s preflight, creates a <u>private</u> draft scoped to these paths, syncs it, and opens a Basecamp ticket for the Claude session that writes it.</div>
          <div className="small"><b>Path scope ({p.pathScope.length || 'whole repository'}{p.pathScope.length ? ` of 40 max` : ''}):</b></div>
          <ol className="small mb-1 ps-4">{(p.pathScope.length ? p.pathScope : [`${p.process.owner}/${p.process.repo} (no scope)`]).map((s) => <li key={s}><code>{s}</code></li>)}</ol>
          <CommandBox command={p.buildCommand} />
          {stop && (stop.kind === 'scope_changed' || stop.kind === 'not_found') && <div className="small text-danger-emphasis mt-1" role="alert">{stop.error}</div>}
          {needsAck && (
            <div className="form-check small mt-2">
              <input className="form-check-input" type="checkbox" id={`finder-ack-${p.id}`} checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <label className="form-check-label" htmlFor={`finder-ack-${p.id}`}>I checked the possible overlap above; this is a different story.</label>
            </div>
          )}
          <div className="d-flex gap-2 mt-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || hardStop || (needsAck && !ack)} onClick={() => { void confirm(); }} data-testid="finder-confirm">
              {busy ? 'Preparing…' : 'Confirm: create private draft + ticket'}
            </button>
            <button type="button" className="btn btn-link btn-sm" onClick={() => setReviewing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </article>
  );
}
