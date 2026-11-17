import React, { useMemo } from 'react';
import FinderProposalCard from './FinderProposalCard';
import type { FinderHook } from './useCaseStudyFinder';

/**
 * CaseStudyFinderSection - "Case Study Finder" on Our Services (Services Upgrade CF2). Which case study to build next,
 * from which code, and what it does to our profile. Proposals only: the Run button reads, the Build button (per card,
 * two clicks) creates a private draft and a Basecamp ticket. The last completed result stays visible while a new run
 * works. Times are shown in Central.
 */
const central = (iso: string | null): string => {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT'
    : 'unknown';
};

export default function CaseStudyFinderSection({ finder }: { finder: FinderHook }): React.ReactElement {
  const { state, loading, error, running, run, build, busy } = finder;
  const result = state?.result ?? null;
  const builds = useMemo(() => new Map((state?.builds ?? []).map((b) => [b.proposalId, b])), [state]);
  const readRepos = result?.repos.filter((r) => r.status === 'read').length ?? 0;

  return (
    <div data-testid="case-study-finder">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { void run(); }} disabled={running || loading} data-testid="finder-run">
          <i className="ri-search-eye-line me-1" aria-hidden="true" />{running ? 'Finding…' : result ? 'Run the Finder again' : 'Run the Case Study Finder'}
        </button>
        {running && (
          <span className="small text-info-emphasis" role="status" data-testid="finder-stage">
            <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />{state?.run?.stage ?? 'Starting'} · about 90 seconds
          </span>
        )}
        {!running && state?.run?.status === 'failed' && <span className="small text-danger-emphasis" role="alert">Last run failed: {state.run.lastError ?? 'unknown error'}</span>}
        <span className="small text-secondary ms-auto">Last result: {central(state?.resultAt ?? null)}</span>
      </div>
      {error && <div className="alert alert-danger py-1 px-2 small" role="alert">{error}</div>}

      {loading ? <p className="small text-secondary" role="status">Loading the Finder…</p> : !result ? (
        <p className="small text-secondary mb-0">No run yet. The Finder reads our proof gaps and the code in this repo and the connected repos, skips what an existing case study covers, and proposes what to build next with the before and after evidence score.</p>
      ) : (
        <>
          <div className="d-flex flex-wrap gap-2 mb-2" data-testid="finder-kpis">
            {[
              [result.proposals.length, 'proposals', 'bg-primary-subtle text-primary-emphasis'],
              [readRepos, 'repos read', 'bg-body-tertiary text-body'],
              [result.processesFound, 'processes found', 'bg-body-tertiary text-body'],
              [result.excluded.length, 'already covered', 'bg-success-subtle text-success-emphasis'],
              [result.needs.withNeed, 'needs open', 'bg-danger-subtle text-danger-emphasis'],
            ].map(([n, label, cls]) => (
              <span key={label as string} className={`badge rounded-3 px-3 py-2 ${cls as string}`}><span className="fs-6 fw-bold me-1">{n as number}</span>{label as string}</span>
            ))}
          </div>
          {result.notes.slice(1).map((n) => <div key={n} className="small text-warning-emphasis"><i className="ri-information-line me-1" aria-hidden="true" />{n}</div>)}

          <div className="small my-2"><b>Biggest needs:</b>{' '}
            {result.needs.top.slice(0, 6).map((n) => (
              <span key={n.id} className="badge rounded-pill bg-danger-subtle text-danger-emphasis me-1" title={n.reasons.join('. ')}>{n.name} · {n.needScore}</span>
            ))}
          </div>

          <div className="d-grid gap-3">
            {result.proposals.map((p) => (
              <FinderProposalCard key={p.id} p={p} build={builds.get(p.id) ?? null} busy={busy === p.id} onBuild={build} />
            ))}
          </div>

          <details className="mt-3 small">
            <summary>Already covered by a case study ({result.excluded.length}), so not proposed</summary>
            <ul className="mt-1">{result.excluded.map((e) => <li key={`${e.key}-${e.caseStudy?.id ?? ''}`}><b>{e.name}</b>: {e.reason}{e.caseStudy ? ` ("${e.caseStudy.title}")` : ''}</li>)}</ul>
          </details>
          <details className="mt-1 small">
            <summary>Repositories read ({readRepos} of {result.repos.length})</summary>
            <ul className="mt-1">{result.repos.map((r) => (
              <li key={`${r.owner}/${r.repo}`} className={r.status === 'read' ? '' : 'text-danger-emphasis'}>{r.owner}/{r.repo}: {r.status === 'read' ? `${r.processes} processes` : r.note}</li>
            ))}</ul>
          </details>
        </>
      )}
    </div>
  );
}
