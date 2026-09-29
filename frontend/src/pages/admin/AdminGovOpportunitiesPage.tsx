import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, StatCard, SectionCard } from '../../components/admin/shell';
import { listGovOpportunities, startGovOpportunity, type GovOpportunity, type GovOpportunityFeed } from '../../services/factoryApi';

/**
 * AdminGovOpportunitiesPage — the government-contract entry page.
 *
 * DISCOVERED CANDIDATES, not recommended pursuits: each row from Opportunity Pulse still needs qualification
 * before it becomes a pursuit (Phase 2). This page therefore does NOT create anything — the legacy "Start
 * working" create action is replaced with "Review source" plus an explanation of the pending qualification
 * step (the server also blocks new-project creation). Rows Opportunity Pulse flagged (vetVerdict no_bid /
 * needs_review, or pursuitStatus declined) are shown in a separate "flagged for review" section, never as
 * candidates. A null verdict means UNASSESSED, never approved. Values without verified provenance show
 * "Value unverified" and are never presented as revenue. Design: Bootstrap 5 + admin-shell + RemixIcon; no
 * hardcoded hex.
 */

const fmtValue = (v: number | null): string => {
  if (v === null || Number.isNaN(v)) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
};
// Fit/Priority are LEGACY, title-derived discovery scores from Opportunity Pulse — advisory only, not verified
// company fit. Rendered in a single neutral tone so styling never implies a good/verified match.
const LEGACY_SCORE_BADGE = 'bg-secondary-subtle text-secondary-emphasis';

/** An opportunity Opportunity Pulse flagged (no_bid / needs_review) or that was declined — never a candidate. */
const isFlaggedForReview = (o: GovOpportunity): boolean => {
  const s = o.vetVerdict?.status;
  return s === 'no_bid' || s === 'needs_review' || o.pursuitStatus === 'declined';
};

export default function AdminGovOpportunitiesPage(): React.ReactElement {
  const navigate = useNavigate();
  const [feed, setFeed] = useState<GovOpportunityFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFeed(await listGovOpportunities());
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load government opportunities.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Open an EXISTING government project. Reuses the guarded start route, which resolves an existing project
  // (200) or refuses a new one (409) — it never creates. So this navigates to a started project or explains
  // that qualification is still required; it does NOT restore unqualified new-project creation.
  const handleOpen = useCallback(async (opp: GovOpportunity) => {
    setNote(null);
    try {
      const { deliveryProjectId } = await startGovOpportunity(opp.uuid, {});
      navigate(`/admin/factory?contract=${encodeURIComponent(deliveryProjectId)}`);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setNote('No project exists for this opportunity yet — qualification is required before one is created (next phase).');
      } else {
        setNote('Could not open this project.');
      }
    }
  }, [navigate]);

  const opportunities = feed?.opportunities ?? [];
  const isLive = feed?.source === 'live';
  const candidates = opportunities.filter((o) => !isFlaggedForReview(o));
  const flagged = opportunities.filter(isFlaggedForReview);

  const renderCard = (opp: GovOpportunity): React.ReactElement => {
    const v = opp.vetVerdict;
    // Both an ABSENT and an explicitly-null verdict are Unassessed (the absent/null distinction is kept in the
    // data via vetVerdictPresent). A null verdict is NEVER approved.
    const unassessed = v == null;
    // A legacy assessment is weak when it is title-regex-derived or carries no evidence — mark it clearly.
    const weakLegacy = v != null && (v.method === 'title_regex' || v.evidence == null);
    return (
      <div className="col-12 col-md-6 col-xl-4" key={opp.uuid}>
        <div className="card h-100 border">
          <div className="card-body d-flex flex-column">
            <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
              <div className="d-flex flex-wrap gap-1">
                {opp.priorityScore !== null && opp.priorityScore !== undefined && (
                  <span className={`badge ${LEGACY_SCORE_BADGE}`}>Priority {opp.priorityScore} (legacy)</span>
                )}
                <span className={`badge ${LEGACY_SCORE_BADGE}`}>Fit {opp.fitScore ?? '—'} (legacy)</span>
              </div>
              <div className="d-flex flex-wrap gap-1 justify-content-end">
                {v && (
                  <span className="badge bg-warning-subtle text-warning-emphasis" title="Opportunity Pulse source assessment (not an eligibility decision)">
                    {(v.label ?? v.status ?? 'flagged').replace(/_/g, ' ')}
                  </span>
                )}
                {unassessed && (
                  <span className="badge bg-secondary-subtle text-secondary-emphasis" title="No review verdict (absent or null) — unassessed, never approved">Unassessed</span>
                )}
                {opp.pursuitStatus && opp.pursuitStatus !== 'none' && (
                  <span className="badge bg-light text-secondary" title="Opportunity Pulse operator status — not an authoritative pursuit decision">{opp.pursuitStatus}</span>
                )}
              </div>
            </div>
            <div className="small text-secondary mb-2" style={{ marginTop: '-0.25rem' }}>
              Legacy discovery scores — advisory, not verified company fit.
            </div>
            {v && (
              <div className="small text-warning-emphasis mb-2">
                <i className="ri-alert-line me-1" aria-hidden="true" />
                {(v.label ?? v.status ?? 'flagged').replace(/_/g, ' ')}
                {v.reason ? ` — ${v.reason}` : ''}
                {v.disqualifier ? ` (disqualifier: ${v.disqualifier})` : ''}
                <div className="text-secondary">
                  method: {v.method ?? 'unknown'}
                  {weakLegacy ? ' — legacy, unevidenced (weak)' : (v.evidence ? ' — evidenced' : '')}
                </div>
              </div>
            )}
            <h3 className="h6 fw-semibold mb-1">{opp.title}</h3>
            <div className="text-secondary small mb-2">
              {opp.agency}{opp.category ? ` · ${opp.category}` : ''}
            </div>
            <div className="d-flex flex-wrap gap-3 small text-secondary mb-2">
              <span title="Deadline shown from the source; verify on the portal — timezone unverified.">
                <i className="ri-calendar-line me-1" aria-hidden="true" />Closes {opp.closeDate ?? 'TBD'}
                <i className="ri-error-warning-line ms-1 text-warning" aria-hidden="true" />
              </span>
            </div>
            <div className="small mb-3">
              <span className="badge bg-secondary-subtle text-secondary-emphasis">
                <i className="ri-money-dollar-circle-line me-1" aria-hidden="true" />Value unverified
              </span>
              {opp.estimatedValue !== null && (
                <span className="text-secondary ms-2">source estimate {fmtValue(opp.estimatedValue)} (not verified)</span>
              )}
            </div>
            <div className="mt-auto d-flex flex-column gap-2">
              <div className="d-flex flex-wrap gap-2">
                {opp.sourceUrl ? (
                  <a className="btn btn-outline-secondary btn-sm" href={opp.sourceUrl} target="_blank" rel="noopener noreferrer">
                    <i className="ri-external-link-line me-1" aria-hidden="true" />Review source
                  </a>
                ) : (
                  <span className="small text-secondary align-self-center"><i className="ri-links-line me-1" aria-hidden="true" />No source link</span>
                )}
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => { void handleOpen(opp); }}
                  title="Open the existing government project, if this opportunity was already started"
                >
                  <i className="ri-folder-open-line me-1" aria-hidden="true" />Open project
                </button>
              </div>
              <span className="small text-secondary">
                <i className="ri-lock-2-line me-1" aria-hidden="true" />
                Qualification required before a new pursuit is created (coming in the next phase).
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Government Opportunities"
        subtitle="Discovered candidates from Opportunity Pulse. Each one needs qualification before it becomes a pursuit."
        icon="government-line"
      />

      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <StatCard label="Candidates" value={String(candidates.length)} icon="file-list-3-line" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard label="Flagged for review" value={String(flagged.length)} icon="alert-line" tone={flagged.length ? 'warning' : 'neutral'} />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard label="Source" value={isLive ? 'Live' : 'Snapshot'} icon={isLive ? 'broadcast-line' : 'archive-line'} />
        </div>
      </div>

      {feed && isLive && (
        <div className="alert alert-success d-flex align-items-center gap-2" role="status">
          <i className="ri-broadcast-line" aria-hidden="true" />
          <div><strong>Live from Opportunity Pulse.</strong> Candidates still require qualification before pursuit.</div>
        </div>
      )}
      {feed && !isLive && feed.snapshotReason === 'source_failed' && (
        <div className="alert alert-warning d-flex align-items-start gap-2" role="alert">
          <i className="ri-error-warning-line mt-1" aria-hidden="true" />
          <div>
            <strong>Live source unavailable — showing a saved snapshot{feed.snapshotDate ? ` from ${feed.snapshotDate}` : ''}.</strong>{' '}
            The Opportunity Pulse feed is configured but did not respond, so these are older saved candidates, not current results.
          </div>
        </div>
      )}
      {feed && !isLive && feed.snapshotReason !== 'source_failed' && (
        <div className="alert alert-info d-flex align-items-start gap-2" role="status">
          <i className="ri-information-line mt-1" aria-hidden="true" />
          <div>
            <strong>Snapshot{feed.snapshotDate ? ` as of ${feed.snapshotDate}` : ''}.</strong>{' '}
            The live Opportunity Pulse pull is not configured yet, so these are saved candidates. Configure it to see current discovered candidates.
          </div>
        </div>
      )}

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {note && <div className="alert alert-info d-flex align-items-center gap-2" role="status"><i className="ri-information-line" aria-hidden="true" />{note}</div>}

      {loading ? (
        <SectionCard title="Loading">
          <p className="text-secondary mb-0">Loading government opportunities…</p>
        </SectionCard>
      ) : opportunities.length === 0 ? (
        <SectionCard title="No opportunities">
          <p className="text-secondary mb-0">No discovered candidates are available right now.</p>
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Discovered candidates" subtitle="require qualification before pursuit" icon="search-line" className="mb-3">
            {candidates.length === 0 ? (
              <p className="text-secondary mb-0">No candidates — every discovered item is flagged for review below.</p>
            ) : (
              <div className="row g-3">{candidates.map(renderCard)}</div>
            )}
          </SectionCard>

          {flagged.length > 0 && (
            <SectionCard
              title="Flagged for review — not recommended"
              subtitle="Opportunity Pulse marked these no-bid / needs-review, or they were declined"
              icon="alert-line"
              className="mb-3"
            >
              <div className="row g-3">{flagged.map(renderCard)}</div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
