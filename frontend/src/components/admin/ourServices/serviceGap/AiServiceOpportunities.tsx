import React, { useState } from 'react';
import type { GapCluster } from '../../../../services/serviceGapApi';
import type { ServiceGapState } from './useServiceGap';
import { DECISION_META, counterTiles } from './serviceGapModel';

/**
 * AiServiceOpportunities - the whole-catalog view of the Gap Detector, next to Intake.
 *
 *   counters   over the CURRENT intake only (a linked case study drops out);
 *   batch      "Analyze unlinked case studies": one run at a time (the server returns the running one on a second
 *              click), progress polled, partial failures counted, re-running only pays for what is missing;
 *   clusters   one candidate service family over many case studies, ranked (distinctiveness, evidence, reuse,
 *              minus duplicate risk). A cluster opens to its case studies; acting happens on each Intake card, so the
 *              existing human-click safeguards apply. "Dismiss" records the review for every member.
 */
interface Props {
  gap: ServiceGapState;
  titles: Record<string, string>;
  onJumpToCase: (caseStudyId: string) => void;
}

function ClusterCard({ c, titles, busy, onJump, onDismiss }: { c: GapCluster; titles: Record<string, string>; busy: boolean; onJump: (id: string) => void; onDismiss: () => void }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const meta = DECISION_META[c.decision];
  const listId = `gap-cluster-${c.key.replace(/[^a-z0-9-]/gi, '')}`;
  return (
    <li className="border rounded-3 p-2 bg-body" data-testid={`gap-cluster-${c.kind}`}>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className={`badge rounded-pill ${meta.badge}`}><i className={`${meta.icon} me-1`} aria-hidden="true" />{meta.label}</span>
        <b className="me-auto">{c.title}</b>
        <span className="small text-secondary text-nowrap">{c.caseStudyIds.length} case stud{c.caseStudyIds.length === 1 ? 'y' : 'ies'}</span>
        {c.anyStale && <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis">Stale</span>}
      </div>
      <div className="small text-secondary mt-1">
        Novelty {c.meanNovelty} · Readiness {c.meanReadiness}{c.maxDuplicateRisk != null ? ` · Duplicate risk ${c.maxDuplicateRisk}` : ''}
        <span className="visually-hidden"> (heuristic indexes 0 to 100, not probabilities)</span>
      </div>
      {c.duplicateWarnings.length > 0 && <div className="small text-danger-emphasis mt-1"><i className="ri-alert-line me-1" aria-hidden="true" />{c.duplicateWarnings[0]}</div>}
      <div className="d-flex gap-2 mt-2 flex-wrap">
        <button type="button" className="btn btn-outline-secondary btn-sm py-0" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
          {open ? 'Hide case studies' : 'Show case studies'}
        </button>
        <button type="button" className="btn btn-outline-primary btn-sm py-0" onClick={() => onJump(c.caseStudyIds[0])}>Review on card</button>
        <button type="button" className="btn btn-link btn-sm py-0" disabled={busy} onClick={onDismiss}>{c.kind === 'new_service' ? 'Not a new service' : 'Dismiss'}</button>
      </div>
      {open && (
        <ul id={listId} className="list-unstyled small mt-2 mb-0">
          {c.caseStudyIds.map((id) => (
            <li key={id}><button type="button" className="btn btn-link btn-sm p-0 text-start" onClick={() => onJump(id)}>{titles[id] ?? 'Case study'}</button></li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function AiServiceOpportunities({ gap, titles, onJumpToCase }: Props): React.ReactElement {
  const { data, run } = gap;
  const running = run?.status === 'running';
  const done = run ? run.analyzed + run.reused + run.failed : 0;
  const pct = run && run.total ? Math.round((done / run.total) * 100) : 0;
  return (
    <div data-testid="ai-service-opportunities">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <button type="button" className="btn btn-primary btn-sm" disabled={running || gap.busy.has('batch')} onClick={() => void gap.startBatch()} data-testid="gap-batch">
          <i className="ri-sparkling-2-line me-1" aria-hidden="true" />{running ? 'Analyzing…' : 'Analyze unlinked case studies'}
        </button>
        {run && (
          <span className="small text-secondary" role="status" data-testid="gap-run-status">
            {running ? `${done} of ${run.total} done` : `Last run ${run.status} ${run.finishedAt ? new Date(run.finishedAt).toLocaleString() : ''}`}
            {run.failed > 0 ? ` · ${run.failed} failed (re-run retries them)` : ''}
          </span>
        )}
        {data && <span className="small text-secondary ms-auto">Updated {new Date(data.generatedAt).toLocaleTimeString()}</span>}
      </div>
      {running && (
        <div className="progress mb-3" style={{ height: 6 }} role="progressbar" aria-label="Analysis progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
      )}
      {gap.error && <div className="alert alert-warning py-1 px-2 small" role="alert">{gap.error}</div>}
      {data && (
        <>
          <div className="row g-2 mb-3">
            {counterTiles(data.counters, data.intakeCount).map((t) => (
              <div key={t.key} className="col-6 col-md">
                <div className="border rounded-3 p-2 h-100 bg-body"><div className={`fs-4 fw-bold ${t.tone}`}>{t.value}</div><div className="small text-secondary">{t.label}</div></div>
              </div>
            ))}
          </div>
          {data.counters.stale > 0 && <p className="small text-warning-emphasis">{data.counters.stale} recommendation{data.counters.stale === 1 ? ' is' : 's are'} stale (the case study or the catalog changed). Re-run to refresh.</p>}
          {data.clusters.length === 0 ? (
            <p className="small text-secondary mb-0">{data.counters.analyzed ? 'No open recommendations. Everything analyzed was reviewed or needs more detail.' : 'Nothing analyzed yet. Run "Analyze unlinked case studies" to see where the catalog has gaps.'}</p>
          ) : (
            <ol className="list-unstyled d-grid gap-2 mb-0" aria-label="Service opportunities, strongest first">
              {data.clusters.map((c) => (
                <ClusterCard key={c.key} c={c} titles={titles} busy={gap.busy.has(c.key)} onJump={onJumpToCase} onDismiss={() => void gap.dismissCluster(c)} />
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
