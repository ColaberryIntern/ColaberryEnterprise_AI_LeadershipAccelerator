import React, { useMemo, useState } from 'react';
import SectionCard from '../../admin/shell/SectionCard';
import DecisionRows from './DecisionRows';
import ScopeState from './ScopeState';
import { useGrowthJourneyData } from '../useGrowthJourneyData';
import { getExplorerShadow } from '../../../services/growthJourneyExplorerApi';

/**
 * Everything the system WOULD have sent, and to whom. Nothing here was sent.
 *
 * Same rows as the Decisions panel, with `showRecipient` - that is the whole
 * difference between the two tabs on Explorer's page and it stays the whole
 * difference here.
 *
 * The read-only badge is not decoration. Every Explorer execution flag is off,
 * so this is a preview rather than a queue, and a reviewer who mistook it for a
 * queue would be reading a list of messages they believed were going out.
 */

const PAGE = 50;

interface Props {
  brandId: string | null;
  brandName: string | null;
}

export default function ShadowPanel({ brandId, brandName }: Props) {
  const [date, setDate] = useState('');
  const [offset, setOffset] = useState(0);

  const query = useMemo(() => ({ ...(date ? { date } : {}), limit: PAGE, offset }), [date, offset]);

  const page = useGrowthJourneyData(
    () => getExplorerShadow(brandId, query),
    `explorer-shadow:${brandId ?? 'all'}:${JSON.stringify(query)}`
  );

  return (
    <SectionCard
      title="What would have gone out"
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
                <div>Nothing would have gone out on this run.</div>
                <div className="small mt-1">
                  Every decision was a WAIT, or all of them were already executed. This is an
                  empty result, not a failure.
                </div>
              </div>
            ) : (
              <DecisionRows
                page={p}
                brandId={brandId}
                brandName={brandName}
                showRecipient
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
