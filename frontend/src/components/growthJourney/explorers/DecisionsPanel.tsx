import React, { useMemo, useState } from 'react';
import SectionCard from '../../admin/shell/SectionCard';
import type { DecisionsQuery, ExplorerActionType } from '../../../services/explorerGrowthApi';
import DecisionRows from './DecisionRows';
import ScopeState from './ScopeState';
import { useGrowthJourneyData } from '../useGrowthJourneyData';
import { getExplorerDecisions } from '../../../services/growthJourneyExplorerApi';

/**
 * What was decided, filtered and brand-scoped.
 *
 * The action filter list is copied rather than imported: Explorer declares it
 * module-private inside `DecisionsTab`, and the backend exports `ACTION_TYPES`
 * but the frontend client exports only the TYPE. Typing it `ExplorerActionType[]`
 * is what keeps the copy honest - adding an action to the union and forgetting it
 * here is a missing option, and leaving one behind that no longer exists is a
 * compile error.
 */

const ACTIONS: ExplorerActionType[] = [
  'SEND_EMAIL',
  'SEND_SMS',
  'SCHEDULE_VOICE',
  'SHOW_IN_APP_NUDGE',
  'RECOMMEND_LESSON',
  'INVITE_TO_EVENT',
  'SEND_ALI_OUTREACH',
  'ENTER_SUBCAMPAIGN',
  'EXIT_SUBCAMPAIGN',
  'CREATE_HUMAN_TASK',
  'RECOVER_FRICTION',
  'WAIT',
  'SUPPRESS_CONTACT',
];

const PAGE = 50;

interface Props {
  brandId: string | null;
  brandName: string | null;
}

export default function DecisionsPanel({ brandId, brandName }: Props) {
  const [action, setAction] = useState<ExplorerActionType | ''>('');
  const [executed, setExecuted] = useState<'' | 'true' | 'false'>('');
  const [date, setDate] = useState('');
  const [offset, setOffset] = useState(0);

  const query: DecisionsQuery = useMemo(
    () => ({
      ...(action ? { action } : {}),
      ...(executed ? { executed: executed === 'true' } : {}),
      ...(date ? { date } : {}),
      limit: PAGE,
      offset,
    }),
    [action, executed, date, offset]
  );

  const page = useGrowthJourneyData(
    () => getExplorerDecisions(brandId, query),
    `explorer-decisions:${brandId ?? 'all'}:${JSON.stringify(query)}`
  );

  const reset = (fn: () => void) => {
    fn();
    setOffset(0);
  };

  return (
    <SectionCard title="What was decided" icon="git-branch-line" padded={false}>
      <div className="d-flex gap-2 p-3 flex-wrap align-items-center border-bottom">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 230 }}
          value={action}
          onChange={(e) => reset(() => setAction(e.target.value as ExplorerActionType | ''))}
          aria-label="Filter by action"
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 180 }}
          value={executed}
          onChange={(e) => reset(() => setExecuted(e.target.value as '' | 'true' | 'false'))}
          aria-label="Filter by executed"
        >
          <option value="">Executed: either</option>
          <option value="false">Not executed</option>
          <option value="true">Executed</option>
        </select>

        <input
          type="date"
          className="form-control form-control-sm"
          style={{ maxWidth: 170 }}
          value={date}
          onChange={(e) => reset(() => setDate(e.target.value))}
          aria-label="Decision date"
        />

        {(action || executed || date) && (
          <button
            type="button"
            className="btn btn-sm btn-link text-decoration-none"
            onClick={() =>
              reset(() => {
                setAction('');
                setExecuted('');
                setDate('');
              })
            }
          >
            Clear
          </button>
        )}

        <div className="ms-auto text-muted small">
          Defaults to the most recent run, not to today — the recompute is nightly.
        </div>
      </div>

      <div className="p-3">
        <ScopeState
          state={page}
          brandSelected={brandId !== null}
          brandName={brandName}
          onRetry={page.reload}
        >
          {(p) =>
            p.rows.length === 0 ? (
              <div className="text-center text-muted py-5">
                <i className="ri-inbox-line fs-3 d-block mb-2" aria-hidden="true" />
                <div>No decisions match this filter.</div>
                <div className="small mt-1">
                  The request succeeded — this is an empty result, not a failure.
                </div>
              </div>
            ) : (
              <DecisionRows
                page={p}
                brandId={brandId}
                brandName={brandName}
                offset={offset}
                pageSize={PAGE}
                onPage={setOffset}
              />
            )
          }
        </ScopeState>
      </div>
    </SectionCard>
  );
}
