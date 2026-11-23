import React from 'react';
import SectionCard from '../../admin/shell/SectionCard';
import StatusBadge from '../../admin/shell/StatusBadge';
import { DistributionBar, Trend } from '../../explorerGrowth/OverviewTab';
import ScopeState from './ScopeState';
import { useGrowthJourneyData } from '../useGrowthJourneyData';
import { getExplorerDistribution } from '../../../services/growthJourneyExplorerApi';

/**
 * Where learners are now, their overlays, and the trend - brand-scoped.
 *
 * ─── IT REUSES EXPLORER'S OWN RENDERERS RATHER THAN COPYING THEM ────────────
 *
 * `DistributionBar` and `Trend` are already exported from Explorer's
 * `OverviewTab` and are already PURE: they take the payload as a prop and fetch
 * nothing. So they are imported and used as they are.
 *
 * That is the difference between this and the tiles beside it. The contract's
 * correction is about SELF-FETCHING components - Explorer's tab wrappers call
 * its unscoped client internally, so reusing a wrapper would bypass brand
 * scope. A pure child cannot: it renders what it is handed. Copying these two
 * would have duplicated about 120 lines of table and progress-bar markup that
 * must stay pixel-identical between the two pages, and the day they diverged
 * nobody would be told.
 *
 * The import is of a COMPONENT, not of `explorerGrowthApi`. The scan in
 * `growthJourneyExplorerApi.test.ts` bans value imports of Explorer's CLIENTS,
 * which is where the bypass hazard lives; a renderer is not a fetcher.
 */

interface Props {
  brandId: string | null;
  brandName: string | null;
  /** Days of trend history. Explorer's own default is 30. */
  days?: number;
}

export default function DistributionPanel({ brandId, brandName, days = 30 }: Props) {
  const dist = useGrowthJourneyData(
    () => getExplorerDistribution(brandId, days),
    `explorer-distribution:${brandId ?? 'all'}:${days}`
  );

  return (
    <ScopeState
      state={dist}
      brandSelected={brandId !== null}
      brandName={brandName}
      onRetry={dist.reload}
    >
      {(d) =>
        d.today.length === 0 && d.trend.length === 0 ? (
          // A successful EMPTY, said in Explorer's own words. Distinct from the
          // scope states above it and from a failure: the nightly recompute
          // populates this, and never having run is not the same as every
          // learner being in no state.
          <div className="text-center text-muted py-5">
            <i className="ri-inbox-line fs-3 d-block mb-2" aria-hidden="true" />
            <div>No learners have been classified yet.</div>
            <div className="small mt-1">
              The nightly recompute populates this. If it has never run, there is nothing to show
              — which is different from every learner being in no state.
            </div>
          </div>
        ) : (
          <div className="row g-3">
            <div className="col-12 col-xl-6">
              <SectionCard title="Where learners are now" icon="pie-chart-line">
                <DistributionBar counts={d.today} />
              </SectionCard>
            </div>

            <div className="col-12 col-xl-6">
              <SectionCard
                title="Overlays"
                icon="stack-line"
                subtitle="Independent of primary state — a learner can carry several."
              >
                {d.overlays.length === 0 ? (
                  <div className="text-muted small">No overlays are set on any learner.</div>
                ) : (
                  <div className="d-flex flex-wrap gap-2">
                    {d.overlays.map((o) => (
                      <span key={o.overlay} className="d-inline-flex align-items-center gap-1">
                        <StatusBadge
                          label={`${o.overlay.replace(/_/g, ' ')} · ${o.count}`}
                          tone={
                            o.overlay === 'FRICTION' || o.overlay === 'DORMANT' ? 'warning' : 'info'
                          }
                        />
                      </span>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            <div className="col-12">
              <SectionCard
                title="Trend"
                icon="line-chart-line"
                subtitle="Newest day first. From the append-only nightly snapshots — the only source that can say what last week looked like."
              >
                <Trend trend={d.trend} />
              </SectionCard>
            </div>
          </div>
        )
      }
    </ScopeState>
  );
}
