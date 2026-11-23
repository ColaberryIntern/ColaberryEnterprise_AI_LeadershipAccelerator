import React from 'react';
import SectionCard from '../../admin/shell/SectionCard';
import StatCard from '../../admin/shell/StatCard';
import ScopeState from './ScopeState';
import { useGrowthJourneyData } from '../useGrowthJourneyData';
import { getExplorerSummary } from '../../../services/growthJourneyExplorerApi';
import type { ExplorerBrandInvariant } from '../../../services/growthJourneyExplorerApi';

/**
 * The six KPI tiles, brand-scoped.
 *
 * ─── WHY THIS IS A NEW COMPONENT AND NOT EXPLORER'S HEADER ──────────────────
 *
 * The tiles live inline in `ExplorerGrowthPage.tsx`, inside a `PageHeader`, fed
 * by a `useExplorerData(getSummary)` call that takes no brand. There is no
 * prop-taking component to reuse: the contract's own correction says Explorer's
 * surfaces are "zero-prop and self-fetching", so reusing them here would bypass
 * brand scope completely. The six tiles' CONTENT is copied field for field from
 * that header, deliberately, so the merged page reads identically.
 *
 * ─── THE DRIFT SENTINEL IS SHOWN, NOT SWALLOWED ─────────────────────────────
 *
 * The summary read is the one that carries `invariant`: a count of Explorer
 * profiles whose brand context resolves to a brand other than Colaberry
 * Training. It is zero today and NOTHING ENFORCES THAT. If it ever stops being
 * zero, these tiles are the first place somebody would see a number that belongs
 * to another brand, so the warning is rendered here rather than logged only.
 *
 * `-1` means the check could not run, which is a different fact from `0`
 * meaning it ran and found none. Both are said in words.
 */

function InvariantNotice({ invariant }: { invariant: ExplorerBrandInvariant }) {
  if (invariant.holds) return null;

  const couldNotCheck = invariant.foreign_brand_profiles < 0;
  return (
    <div className="alert alert-warning py-2 px-3 small mb-3" role="status">
      <i className="ri-alert-line me-1" aria-hidden="true" />
      {couldNotCheck ? (
        <>
          <strong>Unverified.</strong> The brand check could not run, so these figures are not
          confirmed to cover one brand only. That is different from the check passing.
        </>
      ) : (
        <>
          <strong>{invariant.foreign_brand_profiles.toLocaleString()}</strong> explorer{' '}
          {invariant.foreign_brand_profiles === 1 ? 'profile' : 'profiles'} now belong to another
          brand. These counts no longer describe Colaberry Training alone.
        </>
      )}
    </div>
  );
}

interface Props {
  brandId: string | null;
  brandName: string | null;
}

export default function SummaryTiles({ brandId, brandName }: Props) {
  const summary = useGrowthJourneyData(
    () => getExplorerSummary(brandId),
    `explorer-summary:${brandId ?? 'all'}`
  );

  return (
    /*
     * A title of its own. On Explorer's page these six tiles sat inside the
     * `PageHeader`, which gave them context; in a tab body they had none, and a
     * tab whose only heading appears once data arrives has no heading in three
     * of its four states.
     */
    <SectionCard title="How the population looks now" icon="dashboard-line">
      <ScopeState
        state={summary}
        brandSelected={brandId !== null}
        brandName={brandName}
        onRetry={summary.reload}
      >
      {(s) => (
        <>
          {summary.data?.invariant && <InvariantNotice invariant={summary.data.invariant} />}
          <div className="row g-3">
            <div className="col-6 col-lg">
              <StatCard
                label="Learners"
                value={s.learners_with_profile.toLocaleString()}
                icon="group-line"
                tone="primary"
                hint="with a journey profile"
              />
            </div>
            <div className="col-6 col-lg">
              <StatCard
                label="Decisions"
                value={s.total.toLocaleString()}
                icon="git-branch-line"
                tone="info"
                hint={s.decision_date ?? 'no run yet'}
              />
            </div>
            <div className="col-6 col-lg">
              <StatCard
                label="Actionable"
                value={s.actionable.toLocaleString()}
                icon="play-circle-line"
                tone="info"
                hint={`${s.waited} waited`}
              />
            </div>
            <div className="col-6 col-lg">
              <StatCard
                label="With content"
                value={s.with_content.toLocaleString()}
                icon="mail-send-line"
                tone="success"
              />
            </div>
            <div className="col-6 col-lg">
              <StatCard
                label="Content gaps"
                value={s.gaps.toLocaleString()}
                icon="error-warning-line"
                tone={s.gaps > 0 ? 'warning' : 'neutral'}
                hint={s.gaps > 0 ? 'see Content supply' : 'none'}
              />
            </div>
            <div className="col-6 col-lg">
              {/* 0 executed is the POINT, not a gap in the data: every flag is
                  off and the system is in shadow. Calm tone so it does not read
                  as a fault. Copied from Explorer's own tile, including the
                  reason, so the two pages cannot disagree about what 0 means. */}
              <StatCard
                label="Executed"
                value={s.executed.toLocaleString()}
                icon="shield-check-line"
                tone={s.executed === 0 ? 'neutral' : 'danger'}
                hint={s.executed === 0 ? 'nothing sent' : 'ACTIONS WERE EXECUTED'}
              />
            </div>
          </div>
        </>
        )}
      </ScopeState>
    </SectionCard>
  );
}
