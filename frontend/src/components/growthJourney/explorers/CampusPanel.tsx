import React from 'react';
import SectionCard from '../../admin/shell/SectionCard';
import CampusActivityPanel from '../../explorerGrowth/CampusActivityPanel';
import ScopeState from './ScopeState';
import { useGrowthJourneyData } from '../useGrowthJourneyData';
import { getExplorerCampus } from '../../../services/growthJourneyExplorerApi';

/**
 * What explorers are doing on the campus, brand-scoped.
 *
 * Explorer's `CampusActivityPanel` is already pure - it takes the payload as a
 * prop - so it is imported and used as it is. Only the fetch is re-created,
 * because Explorer's `CampusTab` calls its own unscoped client internally and
 * reusing that wrapper would bypass brand scope entirely.
 *
 * NAMED `CampusPanel`, not `CampusActivityPanel`, although the plan said the
 * latter: two files with the same basename, one pure and one fetching, is how a
 * later import picks the wrong one. The distinction is worth a different word.
 *
 * ─── THE ONE INHERITED WRITE PASSES THROUGH THIS TAB ────────────────────────
 *
 * Not here, but next door: `getOutreach` on the server opens with
 * `ensureCampusActivitySchema()`, three `IF NOT EXISTS` statements. They already
 * fire whenever anyone opens Explorer's own Campus tab, so this reaches them
 * through a second door rather than creating a capability. Stated because
 * "everything reads" is otherwise not quite true.
 */

interface Props {
  brandId: string | null;
  brandName: string | null;
}

export default function CampusPanel({ brandId, brandName }: Props) {
  const activity = useGrowthJourneyData(
    () => getExplorerCampus(brandId),
    `explorer-campus:${brandId ?? 'all'}`
  );

  return (
    <SectionCard title="What explorers are doing" icon="building-line">
      <ScopeState
        state={activity}
        brandSelected={brandId !== null}
        brandName={brandName}
        onRetry={activity.reload}
      >
        {(a) => <CampusActivityPanel a={a} />}
      </ScopeState>
    </SectionCard>
  );
}
