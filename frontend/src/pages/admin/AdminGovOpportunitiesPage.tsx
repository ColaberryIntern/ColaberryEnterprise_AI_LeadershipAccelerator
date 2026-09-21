import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, StatCard, SectionCard } from '../../components/admin/shell';
import {
  listGovOpportunities, startGovOpportunity,
  type GovOpportunity, type GovOpportunityFeed,
} from '../../services/factoryApi';

/**
 * AdminGovOpportunitiesPage — the government-contract entry page (Phase 5 slice 1).
 *
 * Cards of the best-fit gov proposals from Opportunity Pulse (or a clearly-labeled in-app snapshot when
 * the live pull is not configured). "Start working" on a card creates a government_public_sector contract
 * (an honest unassessed shell) and opens the Factory Command Center on it. Design: Bootstrap 5 +
 * admin-shell primitives + RemixIcon; no hardcoded hex.
 */

const fmtValue = (v: number | null): string => {
  if (v === null || Number.isNaN(v)) return 'Value TBD';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
};
const fitBadge = (fit: number | null): string => {
  if (fit === null) return 'bg-secondary-subtle text-secondary-emphasis';
  if (fit >= 75) return 'bg-success-subtle text-success-emphasis';
  if (fit >= 70) return 'bg-info-subtle text-info-emphasis';
  return 'bg-secondary-subtle text-secondary-emphasis';
};

export default function AdminGovOpportunitiesPage(): React.ReactElement {
  const navigate = useNavigate();
  const [feed, setFeed] = useState<GovOpportunityFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingUuid, setStartingUuid] = useState<string | null>(null);

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

  const handleStart = useCallback(async (opp: GovOpportunity) => {
    setStartingUuid(opp.uuid);
    setError(null);
    try {
      const { deliveryProjectId } = await startGovOpportunity(opp.uuid, { title: opp.title, agency: opp.agency });
      navigate(`/admin/factory?contract=${encodeURIComponent(deliveryProjectId)}`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not start this opportunity.');
      setStartingUuid(null);
    }
  }, [navigate]);

  const opportunities = feed?.opportunities ?? [];
  const isLive = feed?.source === 'live';

  return (
    <div>
      <PageHeader
        title="Government Opportunities"
        subtitle="Best-fit contract proposals from Opportunity Pulse. Pick one and start working on it."
        icon="government-line"
      />

      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <StatCard label="Opportunities" value={String(opportunities.length)} icon="file-list-3-line" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard label="Source" value={isLive ? 'Live' : 'Snapshot'} icon={isLive ? 'broadcast-line' : 'archive-line'} />
        </div>
      </div>

      {feed && !isLive && (
        <div className="alert alert-info d-flex align-items-start gap-2" role="status">
          <i className="ri-information-line mt-1" aria-hidden="true" />
          <div>
            <strong>Snapshot{feed.snapshotDate ? ` as of ${feed.snapshotDate}` : ''}.</strong>{' '}
            The live Opportunity Pulse pull is not configured yet, so these are a saved snapshot. Configure
            it to see current best fits.
          </div>
        </div>
      )}
      {feed && isLive && (
        <div className="alert alert-success d-flex align-items-center gap-2" role="status">
          <i className="ri-broadcast-line" aria-hidden="true" />
          <div><strong>Live from Opportunity Pulse.</strong></div>
        </div>
      )}

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {loading ? (
        <SectionCard title="Loading">
          <p className="text-secondary mb-0">Loading government opportunities…</p>
        </SectionCard>
      ) : opportunities.length === 0 ? (
        <SectionCard title="No opportunities">
          <p className="text-secondary mb-0">No best-fit opportunities are available right now.</p>
        </SectionCard>
      ) : (
        <div className="row g-3">
          {opportunities.map((opp) => (
            <div className="col-12 col-md-6 col-xl-4" key={opp.uuid}>
              <div className="card h-100 border">
                <div className="card-body d-flex flex-column">
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <span className={`badge ${fitBadge(opp.fitScore)}`}>
                      Fit {opp.fitScore ?? '—'}
                    </span>
                    {opp.pursued && <span className="badge bg-light text-secondary">Pursued</span>}
                  </div>
                  <h3 className="h6 fw-semibold mb-1">{opp.title}</h3>
                  <div className="text-secondary small mb-3">{opp.agency}</div>
                  <div className="d-flex flex-wrap gap-3 small text-secondary mb-3">
                    <span><i className="ri-calendar-line me-1" aria-hidden="true" />Closes {opp.closeDate ?? 'TBD'}</span>
                    <span><i className="ri-money-dollar-circle-line me-1" aria-hidden="true" />{fmtValue(opp.estimatedValue)}</span>
                  </div>
                  <div className="mt-auto d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={startingUuid !== null}
                      onClick={() => { void handleStart(opp); }}
                    >
                      {startingUuid === opp.uuid ? (
                        <><span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />Starting…</>
                      ) : (
                        <><i className="ri-play-line me-1" aria-hidden="true" />Start working</>
                      )}
                    </button>
                    {opp.sourceUrl && (
                      <a className="btn btn-outline-secondary btn-sm" href={opp.sourceUrl} target="_blank" rel="noopener noreferrer">
                        <i className="ri-external-link-line me-1" aria-hidden="true" />Bonfire
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
