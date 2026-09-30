import React, { useMemo, useState } from 'react';
import SectionCard from '../admin/shell/SectionCard';
import DecisionsTable from './DecisionsTable';
import { getShadow } from '../../services/explorerGrowthApi';

/**
 * Shadow — what WOULD have gone out.
 *
 * The same rows as Decisions, narrowed by the backend to actionable and
 * un-executed, and framed as a review. The framing is the feature: a
 * seven-day shadow review precedes turning anything on, and that review is a
 * different reading of the same data, not a different dataset.
 *
 * The count differs from Decisions on purpose — 142 rather than 153 on the last
 * run — because a WAIT would have sent nothing. Listing WAITs here would pad the
 * review with 11 non-events and make the real number look smaller than it is.
 */

const PAGE = 50;

export default function ShadowTab() {
  const [date, setDate] = useState('');
  const [offset, setOffset] = useState(0);

  const query = useMemo(
    () => ({ ...(date ? { date } : {}), limit: PAGE, offset }),
    [date, offset],
  );

  return (
    <SectionCard
      title="Shadow review"
      icon="eye-line"
      subtitle="Everything the system would have sent, and to whom. Nothing here was sent."
      padded={false}
    >
      <div className="d-flex gap-2 p-3 flex-wrap align-items-center border-bottom">
        <input
          type="date"
          className="form-control form-control-sm"
          style={{ maxWidth: 170 }}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setOffset(0);
          }}
          aria-label="Run date"
        />
        {date && (
          <button
            type="button"
            className="btn btn-sm btn-link text-decoration-none"
            onClick={() => {
              setDate('');
              setOffset(0);
            }}
          >
            Latest run
          </button>
        )}
        <div className="ms-auto small">
          <span className="badge bg-secondary">Read-only</span>{' '}
          <span className="text-muted">
            Every Explorer flag is off. This is a preview, not a queue.
          </span>
        </div>
      </div>

      <DecisionsTable
        fetcher={() => getShadow(query)}
        cacheKey={`shadow:${JSON.stringify(query)}`}
        emptyMessage="Nothing would have gone out on this run."
        emptyHint="Every decision was a WAIT, or all of them were already executed. This is an empty result, not a failure."
        onPage={setOffset}
        offset={offset}
        pageSize={PAGE}
        showRecipient
      />
    </SectionCard>
  );
}
