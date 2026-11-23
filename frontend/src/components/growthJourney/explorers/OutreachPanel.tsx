import React, { useState } from 'react';
import SectionCard from '../../admin/shell/SectionCard';
import OutreachList, { VIEWS, ViewToggle } from '../../explorerGrowth/OutreachList';
import type { OutreachView } from '../../../services/explorerCampusApi';
import ScopeState from './ScopeState';
import { JourneyPagingFooter, PAGE_LIMIT } from '../journeyPaging';
import { useGrowthJourneyData } from '../useGrowthJourneyData';
import { getExplorerOutreach } from '../../../services/growthJourneyExplorerApi';

/**
 * Who staff should reach out to, brand-scoped - and PAGED, which Explorer's own
 * version cannot do.
 *
 * ─── THE PAGING IS NEW, AND IT IS A FIX RATHER THAN A FEATURE ───────────────
 *
 * The server has returned `total` and `offset` on this read since it shipped
 * (`explorerCampusService.getOutreach` resolves
 * `{ view, rows, tracked_since, total, offset }`). Explorer's client DROPS both
 * and hardcodes `limit = 25`, so its Campus tab shows the first 25 of however
 * many there are and says nothing about the rest. On a population of 1,191 that
 * is a list silently truncated at 2%.
 *
 * So the scoped client types `total` and `offset`, and this panel pages with the
 * journey's own footer - which reports the numbers THE SERVER sent rather than
 * the ones that were requested, because `limit` is clamped server-side and a
 * panel echoing its own request can disagree with the rows on screen.
 *
 * `VIEWS`, `ViewToggle` and `OutreachList` are Explorer's, imported unchanged:
 * all three are pure. Only the fetch is re-created.
 */

interface Props {
  brandId: string | null;
  brandName: string | null;
}

export default function OutreachPanel({ brandId, brandName }: Props) {
  const [view, setView] = useState<OutreachView>('reach_out');
  const [offset, setOffset] = useState(0);

  const outreach = useGrowthJourneyData(
    () => getExplorerOutreach(brandId, { view, limit: PAGE_LIMIT, offset }),
    `explorer-outreach:${brandId ?? 'all'}:${view}:${offset}`
  );

  const hint = VIEWS.find((v) => v.key === view)!.hint;

  /** Changing the view restarts the list: page 3 of one view is not page 3 of the other. */
  const changeView = (next: OutreachView) => {
    setView(next);
    setOffset(0);
  };

  return (
    <SectionCard
      title="Who to reach out to"
      icon="user-voice-line"
      subtitle={hint}
      actions={<ViewToggle view={view} onChange={changeView} />}
    >
      <ScopeState
        state={outreach}
        brandSelected={brandId !== null}
        brandName={brandName}
        onRetry={outreach.reload}
      >
        {(o) => (
          <>
            <OutreachList rows={o.rows} view={o.view} />
            {/* The footer renders even on an empty page, because "0 of 0" and
                "showing 1-25 of 300" are both facts a reader needs, and a list
                with no footer reads as a complete list. */}
            <JourneyPagingFooter
              page={{ total: o.total, limit: PAGE_LIMIT, offset: o.offset }}
              onOffset={setOffset}
              noun="people"
            />
          </>
        )}
      </ScopeState>
    </SectionCard>
  );
}
