import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, StatCard, SectionCard } from '../../components/admin/shell';
import {
  listGovOpportunities, dismissGovOpportunity, listPendingGovApprovals,
  type BoardStage, type GovOpportunity, type GovOpportunityFeed,
} from '../../services/factoryApi';
import { subtle, fmtValue, shortValue, daysLeft, closeLabel } from './govOppFormat';
import { BoardStageBadge, DetailsModal, MixBar, ScoreChip, VettingBadge, stageActionLabel } from './govWorkspace/govOpportunityParts';
import HiddenOpportunitiesPanel from './govWorkspace/HiddenOpportunitiesPanel';

/**
 * AdminGovOpportunitiesPage — the government-contract discovery dashboard.
 *
 * DISCOVERED CANDIDATES, not recommended pursuits: each row from Opportunity Pulse still needs qualification
 * before it becomes a pursuit. Honesty rails kept from the Phase-1 correction: Fit/Priority are LEGACY,
 * title-derived discovery scores (advisory, never a verified match); estimated values are UNVERIFIED and never
 * presented as revenue; a null verdict is UNASSESSED (never approved); rows Opportunity Pulse flagged (no_bid /
 * needs_review / declined) are shown in a separate "flagged for review" section, never as candidates; and the
 * "Qualify" action routes to the qualification workspace (a canonical id is NEVER derived from a title here).
 *
 * Discovery upgrade: the feed now shows the best-fit set (~50) with a "showing N of M" line, a
 * "Good fits" count and a "Decent options" filter, a per-row Details popup (why it surfaced + OP's PRELIMINARY,
 * UNVERIFIED overview — never a requirement), and a team-scoped Dismiss (reversible) so a candidate can be
 * eliminated from everyone's feed.
 * Design: Bootstrap 5 + admin-shell + RemixIcon; colors via design tokens / Bootstrap utilities, no hardcoded hex.
 */

/** "Decent options" threshold — Med band or better (matches band()'s 60 boundary). */
const DECENT_FIT = 60;
const GOOD_FIT = 75;

const isIT = (o: GovOpportunity): boolean => /it|software|cyber|technolog|system|digital|data/i.test(`${o.category ?? ''} ${o.title}`);
const isConsulting = (o: GovOpportunity): boolean => /consult/i.test(`${o.category ?? ''} ${o.title}`);

/** An opportunity Opportunity Pulse flagged (no_bid / needs_review) or that was declined — never a candidate. */
const isFlaggedForReview = (o: GovOpportunity): boolean => {
  const s = o.vetVerdict?.status;
  return s === 'no_bid' || s === 'needs_review' || o.pursuitStatus === 'declined';
};

/** The server's stage decides when it sent one; the older check covers a feed the board could not stage. */
const isFlaggedRow = (o: GovOpportunity): boolean => (o.boardStage ? o.boardStage === 'flagged' : isFlaggedForReview(o));

const STAGE_CHIPS: { stage: BoardStage; label: string; on: string; off: string }[] = [
  { stage: 'vetted', label: '\u2B50 Vetted', on: 'btn-success', off: 'btn-outline-success' },
  { stage: 'needs_read', label: 'Needs your read', on: 'btn-warning', off: 'btn-outline-warning' },
  { stage: 'approved', label: 'Approved', on: 'btn-success', off: 'btn-outline-success' },
  { stage: 'needs_zip', label: 'Awaiting ZIP', on: 'btn-secondary', off: 'btn-outline-secondary' },
  { stage: 'analyzing', label: 'AI analyzing', on: 'btn-info', off: 'btn-outline-info' },
];
const STAGE_ORDER: BoardStage[] = ['vetted', 'needs_read', 'approved', 'needs_zip', 'analyzing'];
const stageRank = (o: GovOpportunity): number => {
  const i = o.boardStage ? STAGE_ORDER.indexOf(o.boardStage) : -1;
  return i === -1 ? STAGE_ORDER.length : i;
};

type CatFilter = 'all' | 'it' | 'consulting';
type SortKey = 'priority' | 'fit' | 'closing' | 'value';

export default function AdminGovOpportunitiesPage(): React.ReactElement {
  const navigate = useNavigate();
  const [feed, setFeed] = useState<GovOpportunityFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<CatFilter>('all');
  const [sort, setSort] = useState<SortKey>('priority');
  const [decentOnly, setDecentOnly] = useState(false);
  // One chip per stage of the daily process, the same groups as the morning email. Null shows every stage.
  const [stageFilter, setStageFilter] = useState<BoardStage | null>(null);
  const [detailsOf, setDetailsOf] = useState<GovOpportunity | null>(null);
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // P4: discovery uuids whose pursuit has an approval awaiting a second admin (advisory list-flag).
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

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

  // P4: pursuits awaiting a second-admin approval, so the list can flag them. Decoupled (gws:) keys map back to the
  // discovery uuid; a canonical (op:gov:) key does not map to a discovery row, so only gws: keys are collected.
  // Advisory chrome only — a failure is swallowed and simply shows no flag.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { pending } = await listPendingGovApprovals();
        if (!alive) return;
        const keys = new Set<string>();
        for (const p of pending) if (p.canonicalOpportunityId.startsWith('gws:')) keys.add(p.canonicalOpportunityId.slice(4));
        setPendingKeys(keys);
      } catch { /* advisory flag only */ }
    })();
    return () => { alive = false; };
  }, []);

  const opportunities = feed?.opportunities ?? [];
  const isLive = feed?.source === 'live';
  const candidates = useMemo(() => opportunities.filter((o) => !isFlaggedRow(o)), [opportunities]);
  const flagged = useMemo(() => opportunities.filter(isFlaggedRow), [opportunities]);

  // The category filter is the base for the Decent-options count and for `shown`; the decent toggle narrows it.
  const categoryFiltered = useMemo(
    () => candidates.filter((o) => catFilter === 'all' || (catFilter === 'it' ? isIT(o) : isConsulting(o) && !isIT(o))),
    [candidates, catFilter],
  );
  const decentInView = useMemo(
    () => categoryFiltered.filter((o) => typeof o.fitScore === 'number' && o.fitScore >= DECENT_FIT).length,
    [categoryFiltered],
  );
  const stageCounts = feed?.boardCounts ?? null;
  const shown = useMemo(() => {
    const base = decentOnly
      ? categoryFiltered.filter((o) => typeof o.fitScore === 'number' && o.fitScore >= DECENT_FIT)
      : categoryFiltered;
    const list = stageFilter ? base.filter((o) => o.boardStage === stageFilter) : base;
    const by: Record<SortKey, (a: GovOpportunity, b: GovOpportunity) => number> = {
      // The default view reads like the morning email: what needs a person first, then by priority.
      priority: (a, b) => stageRank(a) - stageRank(b) || (b.priorityScore ?? -1) - (a.priorityScore ?? -1),
      fit: (a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1),
      closing: (a, b) => (daysLeft(a.closeDate) ?? 1e9) - (daysLeft(b.closeDate) ?? 1e9),
      value: (a, b) => (b.estimatedValue ?? -1) - (a.estimatedValue ?? -1),
    };
    return [...list].sort(by[sort]);
  }, [categoryFiltered, decentOnly, stageFilter, sort]);

  // Summary KPIs + the mix bars are computed over the CURRENTLY-FILTERED view (`shown`) so they move with the
  // filters. Estimates stay UNVERIFIED and are never called revenue. (The Flagged card is a separate bucket and
  // stays a total; the filter-chip counts below are over the full candidate set so they show what's available.)
  const stats = useMemo(() => {
    const sum = (list: GovOpportunity[]) => list.reduce((a, o) => a + (o.estimatedValue ?? 0), 0);
    const itVal = sum(shown.filter(isIT));
    const consultVal = sum(shown.filter((o) => !isIT(o) && isConsulting(o)));
    const pipeline = sum(shown);
    const fits = shown.map((o) => o.fitScore).filter((s): s is number => typeof s === 'number');
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const closing = shown
      .map((o) => ({ o, d: daysLeft(o.closeDate) }))
      .filter((x) => x.d !== null && (x.d as number) <= 14)
      .sort((a, b) => (a.d as number) - (b.d as number));
    const unassessed = shown.filter((o) => o.vetVerdict == null).length;
    const inPursuit = shown.filter((o) => o.pursuitStatus === 'pursuing' || o.pursuitStatus === 'submitted').length;
    const goodFits = shown.filter((o) => typeof o.fitScore === 'number' && o.fitScore >= GOOD_FIT).length;
    return {
      pipeline, itVal, consultVal, avgFit: avg(fits), goodFits,
      closingCount: closing.length, nextClose: closing[0]?.o ?? null, unassessed, inPursuit,
    };
  }, [shown]);

  const dismissedCount = feed?.dismissedCount ?? 0;
  const assignedCount = feed?.assignedCount ?? 0;
  const totalAvailable = feed?.totalAvailable ?? candidates.length;

  const handleDismiss = useCallback(async (o: GovOpportunity) => {
    setActionError(null);
    setDismissingKey(o.uuid);
    try {
      await dismissGovOpportunity(o.uuid, { title: o.title, agency: o.agency });
      // Optimistically remove it from the feed and remember it for immediate restore.
      setFeed((prev) => (prev ? { ...prev, opportunities: prev.opportunities.filter((x) => x.uuid !== o.uuid), dismissedCount: (prev.dismissedCount ?? 0) + 1 } : prev));
      setDetailsOf(null);
    } catch (err: any) {
      setActionError(err?.response?.data?.error ?? 'Could not dismiss that opportunity. Please try again.');
    } finally {
      setDismissingKey(null);
    }
  }, []);

  const livePill = isLive
    ? <span className="badge rounded-pill d-inline-flex align-items-center gap-1 bg-success-subtle text-success-emphasis"><i className="ri-broadcast-line" aria-hidden="true" />Live from Opportunity Pulse</span>
    : <span className="badge rounded-pill d-inline-flex align-items-center gap-1 bg-warning-subtle text-warning-emphasis"><i className="ri-archive-line" aria-hidden="true" />Snapshot{feed?.snapshotDate ? ` · ${feed.snapshotDate}` : ''}</span>;

  const itCount = candidates.filter(isIT).length;
  const consultingCount = candidates.filter((o) => !isIT(o) && isConsulting(o)).length;

  return (
    <div>
      <PageHeader
        title="Government Opportunities"
        subtitle="Discovered by Opportunity Pulse · each candidate needs qualification before it becomes a pursuit"
        icon="government-line"
        actions={feed ? livePill : undefined}
      />

      {/* ── Summary ─────────────────────────────────────────────────────────── */}
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-2">
          <div className="card text-bg-dark h-100 border-0 position-relative overflow-hidden">
            <div className="card-body">
              <div className="small text-uppercase" style={{ letterSpacing: '.05em', opacity: .7 }}>Pipeline value</div>
              <div className="fs-3 fw-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtValue(stats.pipeline)}</div>
              <div className="progress mt-2" style={{ height: 6, background: 'rgba(255,255,255,.14)' }} role="presentation">
                <div className="progress-bar bg-info" style={{ width: `${stats.pipeline ? (stats.itVal / stats.pipeline) * 100 : 0}%` }} />
                <div className="progress-bar bg-warning" style={{ width: `${stats.pipeline ? (stats.consultVal / stats.pipeline) * 100 : 0}%` }} />
              </div>
              <div className="small mt-1" style={{ opacity: .8 }}>IT {shortValue(stats.itVal)} · Consulting {shortValue(stats.consultVal)}</div>
              <div className="small mt-1" style={{ opacity: .55 }}>unverified source estimates · not revenue</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-lg-2">
          <StatCard label="Candidates" value={String(shown.length)} icon="file-list-3-line" tone="primary" hint={`${stats.unassessed} unassessed · ${stats.inPursuit} in pursuit`} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard label="Good fits" value={String(stats.goodFits)} icon="focus-3-line" tone={stats.goodFits ? 'success' : 'neutral'}
            hint={`fit ≥ ${GOOD_FIT} · ${decentInView} decent (≥ ${DECENT_FIT})`} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard label="Closing ≤ 14 days" value={String(stats.closingCount)} icon="time-line" tone={stats.closingCount ? 'danger' : 'neutral'}
            hint={stats.nextClose ? `Next ${closeLabel(stats.nextClose.closeDate)} · ${stats.nextClose.agency}` : 'None closing soon'} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard label="Avg fit (legacy)" value={stats.avgFit ?? '—'} icon="bar-chart-2-line" tone="warning"
            hint="advisory, not verified" />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard label="Flagged for review" value={String(flagged.length)} icon="alert-line" tone={flagged.length ? 'warning' : 'neutral'}
            hint={flagged.length ? 'needs your review' : 'nothing waiting on you'} />
        </div>
      </div>

      {shown.length > 0 && (
        <SectionCard className="mb-3">
          <div className="d-flex flex-column gap-2">
            <MixBar label="Priority mix" items={shown.map((o) => o.priorityScore)} />
            <MixBar label="Fit mix" items={shown.map((o) => o.fitScore)} />
            <div className="small text-secondary">Legacy discovery scores are advisory, not verified company fit. Qualification comes before any pursuit.</div>
          </div>
        </SectionCard>
      )}

      {/* ── Banners ─────────────────────────────────────────────────────────── */}
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
            The live Opportunity Pulse pull is not configured yet, so these are saved candidates.
          </div>
        </div>
      )}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {actionError && <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert"><span>{actionError}</span><button type="button" className="btn-close" aria-label="Dismiss error" onClick={() => setActionError(null)} /></div>}

      {feed?.boardIncomplete && (
        <div className="alert alert-warning py-2 small" role="alert">Some saved data could not be read, so a row may look less advanced than it is. Try reloading.</div>
      )}
      {/* Outside the table on purpose: Restore must stay reachable when every row is hidden, and stay open across a reload. */}
      <div className="mb-2"><HiddenOpportunitiesPanel count={dismissedCount} onRestored={load} /></div>

      {/* ── Candidates table ────────────────────────────────────────────────── */}
      {loading ? (
        <SectionCard title="Loading"><p className="text-secondary mb-0">Loading government opportunities…</p></SectionCard>
      ) : opportunities.length === 0 ? (
        <SectionCard title="No opportunities"><p className="text-secondary mb-0">No discovered candidates are available right now.</p></SectionCard>
      ) : (
        <SectionCard
          title="Discovered candidates"
          subtitle="Legacy discovery scores are advisory, not verified company fit. Qualification comes before any pursuit."
          icon="search-line"
          className="mb-3"
          actions={
            <div className="d-flex flex-wrap gap-2">
              <div className="btn-group btn-group-sm" role="group" aria-label="Filter by category">
                <button type="button" className={`btn ${catFilter === 'all' ? 'btn-dark' : 'btn-outline-secondary'}`} onClick={() => setCatFilter('all')}>All {candidates.length}</button>
                <button type="button" className={`btn ${catFilter === 'it' ? 'btn-dark' : 'btn-outline-secondary'}`} onClick={() => setCatFilter('it')}>IT {itCount}</button>
                <button type="button" className={`btn ${catFilter === 'consulting' ? 'btn-dark' : 'btn-outline-secondary'}`} onClick={() => setCatFilter('consulting')}>Consulting {consultingCount}</button>
              </div>
              {stageCounts && STAGE_CHIPS.map((c) => (
                <button key={c.stage} type="button" className={`btn btn-sm ${stageFilter === c.stage ? c.on : c.off}`} aria-pressed={stageFilter === c.stage}
                  onClick={() => setStageFilter((v) => (v === c.stage ? null : c.stage))}>
                  {c.label} {stageCounts[c.stage] ?? 0}
                </button>
              ))}
              <button type="button" className={`btn btn-sm ${decentOnly ? 'btn-success' : 'btn-outline-success'}`} aria-pressed={decentOnly}
                onClick={() => setDecentOnly((v) => !v)} title={`Show only decent options (fit ≥ ${DECENT_FIT})`}>
                <i className="ri-filter-3-line me-1" aria-hidden="true" />Decent options {decentInView}
              </button>
              <div className="btn-group btn-group-sm" role="group" aria-label="Sort by">
                {(['priority', 'fit', 'closing', 'value'] as SortKey[]).map((k) => (
                  <button key={k} type="button" className={`btn ${sort === k ? 'btn-dark' : 'btn-outline-secondary'}`} onClick={() => setSort(k)}>
                    {k === 'closing' ? 'Closing soon' : k[0].toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
            <div className="small text-secondary">
              Showing <strong>{shown.length}</strong> of <strong>{totalAvailable}</strong> from the feed
              {assignedCount > 0 && <> · <strong>{assignedCount}</strong> assigned to interns (see Interns &gt; Gov Contracts)</>}
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="text-secondary mb-0">
              {stageFilter === 'vetted'
                ? 'Nothing is vetted yet. Upload a ZIP and the AI checks run on their own, with the result here by the next morning.'
                : 'No candidates in this filter.'}
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr className="text-uppercase small text-secondary">
                    <th style={{ width: 36 }}>#</th>
                    <th>Opportunity</th>
                    <th style={{ width: 130 }}>Priority</th>
                    <th style={{ width: 130 }}>Fit</th>
                    <th style={{ width: 120 }}>Est. value</th>
                    <th style={{ width: 130 }}>Closes</th>
                    <th style={{ width: 230 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((o, i) => {
                    const dl = daysLeft(o.closeDate);
                    const soon = dl !== null && dl <= 14;
                    const unassessed = o.vetVerdict == null;
                    return (
                      <tr key={o.uuid}>
                        <td className="text-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</td>
                        <td>
                          <div className="fw-semibold">{o.title}</div>
                          <div className="small text-secondary d-flex flex-wrap align-items-center gap-2">
                            <span>{o.agency}</span>
                            {o.category && <span className="badge bg-secondary-subtle text-secondary-emphasis">{o.category}</span>}
                            {o.boardStage ? (
                              <BoardStageBadge stage={o.boardStage} />
                            ) : o.vetting && o.vetting.stage !== 'not_vetted' ? (
                              <VettingBadge v={o.vetting} />
                            ) : (
                              <>
                                {unassessed && <span className="badge bg-secondary-subtle text-secondary-emphasis" title="No review verdict (absent or null) — unassessed, never approved">Unassessed</span>}
                                {pendingKeys.has(o.uuid) && <span className="badge bg-info-subtle text-info-emphasis" title="A pursuit approval is awaiting a second admin">Approval pending</span>}
                              </>
                            )}
                            {o.fromSnapshot && <span className="badge bg-secondary-subtle text-secondary-emphasis" title="Closing soon, so it left the feed. Shown from what was saved when its ZIP was vetted.">Left the feed</span>}
                          </div>
                          {o.aiVetting?.reason && (o.boardStage === 'vetted' || o.boardStage === 'needs_read') && (
                            <div className="small mt-1">{o.aiVetting.reason}</div>
                          )}
                        </td>
                        <td><ScoreChip score={o.priorityScore} /></td>
                        <td><ScoreChip score={o.fitScore} /></td>
                        <td>
                          <div className="fw-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{shortValue(o.estimatedValue)}</div>
                          <div className="small text-secondary">unverified</div>
                        </td>
                        <td>
                          <div title="Deadline from the source; verify on the portal — timezone unverified.">
                            {closeLabel(o.closeDate)} <i className="ri-error-warning-line text-warning" aria-hidden="true" />
                          </div>
                          {dl !== null && <span className={`badge ${soon ? subtle('danger') : subtle('secondary')} mt-1`}>{dl} days left</span>}
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {o.sourceUrl && (
                              <a className="btn btn-outline-secondary btn-sm" href={o.sourceUrl} target="_blank" rel="noopener noreferrer" title="Open the source posting">
                                <i className="ri-external-link-line me-1" aria-hidden="true" />Source
                              </a>
                            )}
                            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setDetailsOf(o)}
                              title="Why it surfaced + a preliminary overview">
                              <i className="ri-information-line me-1" aria-hidden="true" />Details
                            </button>
                            <button type="button" className="btn btn-outline-danger btn-sm" disabled={dismissingKey === o.uuid}
                              onClick={() => handleDismiss(o)} title="Hide this from the whole team's feed (reversible)">
                              <i className="ri-eye-off-line" aria-hidden="true" /><span className="visually-hidden">Dismiss</span>
                            </button>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => navigate(`/admin/gov-qualification?gws=${encodeURIComponent('gws:' + o.uuid)}&from=${encodeURIComponent(o.title)}&agency=${encodeURIComponent(o.agency ?? '')}`)}
                              title="Qualify this opportunity (open its ZIP workspace to upload the solicitation and pull in the requirements)">
                              {stageActionLabel(o.boardStage)} <i className="ri-arrow-right-line" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Flagged for review (never candidates) ───────────────────────────── */}
      {flagged.length > 0 && (
        <SectionCard title="Flagged for review — not recommended"
          subtitle="Opportunity Pulse marked these no-bid / needs-review, or they were declined" icon="alert-line" className="mb-3">
          <ul className="list-unstyled mb-0">
            {flagged.map((o) => {
              const v = o.vetVerdict;
              const weak = v != null && (v.method === 'title_regex' || v.evidence == null);
              return (
                <li key={o.uuid} className="py-2 border-bottom">
                  <div className="d-flex flex-wrap justify-content-between gap-2">
                    <div>
                      <div className="fw-semibold">{o.title}</div>
                      <div className="small text-secondary">{o.agency}{o.category ? ` · ${o.category}` : ''}</div>
                    </div>
                    {o.sourceUrl && (
                      <a className="btn btn-outline-secondary btn-sm align-self-start" href={o.sourceUrl} target="_blank" rel="noopener noreferrer">
                        <i className="ri-external-link-line me-1" aria-hidden="true" />Source
                      </a>
                    )}
                  </div>
                  {v && (
                    <div className="small text-warning-emphasis mt-1">
                      <i className="ri-alert-line me-1" aria-hidden="true" />
                      {(v.label ?? v.status ?? 'flagged').replace(/_/g, ' ')}{v.reason ? ` — ${v.reason}` : ''}{v.disqualifier ? ` (disqualifier: ${v.disqualifier})` : ''}
                      <span className="text-secondary"> · method: {v.method ?? 'unknown'}{weak ? ' — legacy, unevidenced (weak)' : (v.evidence ? ' — evidenced' : '')}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {detailsOf && (
        <DetailsModal
          opp={detailsOf}
          dismissing={dismissingKey === detailsOf.uuid}
          onClose={() => setDetailsOf(null)}
          onQualify={() => { setDetailsOf(null); navigate(`/admin/gov-qualification?gws=${encodeURIComponent('gws:' + detailsOf.uuid)}&from=${encodeURIComponent(detailsOf.title)}&agency=${encodeURIComponent(detailsOf.agency ?? '')}`); }}
          onDismiss={() => handleDismiss(detailsOf)}
        />
      )}
    </div>
  );
}
