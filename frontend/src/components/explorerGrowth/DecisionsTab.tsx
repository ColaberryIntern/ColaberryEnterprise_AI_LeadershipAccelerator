import React, { useMemo, useState } from 'react';
import SectionCard from '../admin/shell/SectionCard';
import DecisionsTable from './DecisionsTable';
import { getDecisions, type DecisionsQuery, type ExplorerActionType } from '../../services/explorerGrowthApi';

/**
 * Decisions — what the system decided on the latest run, filterable.
 *
 * Filters map onto the query parameters the API validates. `executed` is a
 * three-state control rather than a checkbox, because a checkbox cannot express
 * "either" without conflating it with "false" — and "show me the un-executed
 * ones" is the reviewer's actual question while every flag is off.
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

export default function DecisionsTab() {
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
    [action, executed, date, offset],
  );

  const reset = (fn: () => void) => {
    fn();
    setOffset(0);
  };

  return (
    <SectionCard title="Decisions" icon="git-branch-line" padded={false}>
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

      <DecisionsTable
        fetcher={() => getDecisions(query)}
        cacheKey={`decisions:${JSON.stringify(query)}`}
        emptyMessage="No decisions match this filter."
        onPage={setOffset}
        offset={offset}
        pageSize={PAGE}
      />
    </SectionCard>
  );
}
