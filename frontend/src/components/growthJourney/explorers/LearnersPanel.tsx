import React, { useMemo, useState } from 'react';
import SectionCard from '../../admin/shell/SectionCard';
import type {
  ExplorerLearnerRow,
  ExplorerOverlay,
  ExplorerPrimaryState,
  LearnersQuery,
} from '../../../services/explorerGrowthApi';
import { PRIMARY_STATE_ORDER } from '../../../services/explorerStates';
import LearnersTable from './LearnersTable';
import LearnerDrawer from './LearnerDrawer';
import ScopeState from './ScopeState';
import { useGrowthJourneyData } from '../useGrowthJourneyData';
import { getExplorerLearners } from '../../../services/growthJourneyExplorerApi';

/**
 * The roster, filtered, paged and brand-scoped.
 *
 * Filters map one-to-one onto query parameters the API already validates, so an
 * out-of-range value comes back as a 400 naming the field rather than being
 * silently clamped here. Clamping in the UI would answer a different question
 * than the one typed. That is Explorer's rule and it is kept.
 *
 * `PRIMARY_STATE_ORDER` comes from `services/explorerStates`, NOT from
 * Explorer's client. The first version imported it from the client as a value
 * and the guard in `growthJourneyExplorerApi.test.ts` failed the build - as it
 * should have. The constant is harmless; the carve-out would not be, because a
 * rule that admits "only the constants" invites an argument about what counts as
 * one, and that argument is how a fetcher eventually gets through. So the
 * constant moved to a module that fetches nothing.
 */

/**
 * The overlay filter list.
 *
 * Copied from Explorer's `JourneyTab`, where it is module-private. Twelve
 * strings, and the alternative was exporting it from a 268-line component on
 * Explorer's live page for the sake of twelve strings. The type is
 * `ExplorerOverlay[]`, so adding an overlay to the union and forgetting it here
 * is a missing option rather than a silent mismatch - and dropping one that no
 * longer exists is a compile error.
 */
const OVERLAYS: ExplorerOverlay[] = [
  'DORMANT',
  'HIGH_INTENT',
  'FRICTION',
  'NEEDS_SUPPORT',
  'EVENT_READY',
  'EVENT_REGISTERED',
  'EVENT_ATTENDED',
  'EVENT_NO_SHOW',
  'INTERNSHIP_READY',
  'SUBSCRIPTION_READY',
  'REFERRAL_READY',
  'IN_CONVERSATION',
];

const PAGE = 50;

interface Props {
  brandId: string | null;
  brandName: string | null;
}

export default function LearnersPanel({ brandId, brandName }: Props) {
  const [state, setState] = useState<ExplorerPrimaryState | ''>('');
  const [overlay, setOverlay] = useState<ExplorerOverlay | ''>('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<ExplorerLearnerRow | null>(null);

  const query: LearnersQuery = useMemo(
    () => ({
      ...(state ? { state } : {}),
      ...(overlay ? { overlay } : {}),
      ...(applied ? { search: applied } : {}),
      limit: PAGE,
      offset,
    }),
    [state, overlay, applied, offset]
  );

  const page = useGrowthJourneyData(
    () => getExplorerLearners(brandId, query),
    // The brand is part of the key: without it, switching brand would reuse the
    // previous brand's rows, which is the leak in cache form.
    `explorer-learners:${brandId ?? 'all'}:${JSON.stringify(query)}`
  );

  /** A new filter starts at page 1, not wherever the old one ended. */
  const reset = (fn: () => void) => {
    fn();
    setOffset(0);
  };

  const total = page.data?.data?.total ?? null;
  const shown = page.data?.data?.rows.length ?? 0;

  return (
    <>
      <SectionCard title="Learners" icon="group-line" padded={false}>
        <div className="d-flex gap-2 p-3 flex-wrap align-items-center border-bottom">
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 220 }}
            value={state}
            onChange={(e) => reset(() => setState(e.target.value as ExplorerPrimaryState | ''))}
            aria-label="Filter by state"
          >
            <option value="">All states</option>
            {PRIMARY_STATE_ORDER.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 220 }}
            value={overlay}
            onChange={(e) => reset(() => setOverlay(e.target.value as ExplorerOverlay | ''))}
            aria-label="Filter by overlay"
          >
            <option value="">All overlays</option>
            {OVERLAYS.map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <form
            className="d-flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              reset(() => setApplied(search.trim()));
            }}
          >
            <input
              className="form-control form-control-sm"
              style={{ maxWidth: 240 }}
              placeholder="Search email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search by email"
            />
            <button type="submit" className="btn btn-sm btn-outline-primary">
              Search
            </button>
          </form>

          {(state || overlay || applied) && (
            <button
              type="button"
              className="btn btn-sm btn-link text-decoration-none"
              onClick={() =>
                reset(() => {
                  setState('');
                  setOverlay('');
                  setSearch('');
                  setApplied('');
                })
              }
            >
              Clear
            </button>
          )}

          <div className="ms-auto text-muted small">
            {/* "50 of 1,191", never a bare 50 - a page that reports only what
                fits on it implies the filter matched that much. Rendered only
                when rows were actually served, so a refused read does not get a
                count beside its configuration notice. */}
            {total !== null && (
              <>
                Showing <strong>{shown}</strong> of <strong>{total.toLocaleString()}</strong>
              </>
            )}
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
                  <div>No learners match this filter.</div>
                  <div className="small mt-1">
                    The request succeeded — this is an empty result, not a failure.
                  </div>
                </div>
              ) : (
                <>
                  <LearnersTable rows={p.rows} onOpen={setOpen} />

                  <div className="d-flex justify-content-between align-items-center pt-3 mt-3 border-top">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE))}
                    >
                      <i className="ri-arrow-left-line me-1" aria-hidden="true" />
                      Previous
                    </button>
                    <span className="text-muted small">
                      {offset + 1}–{Math.min(offset + p.rows.length, p.total)} of {p.total}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={offset + PAGE >= p.total}
                      onClick={() => setOffset(offset + PAGE)}
                    >
                      Next
                      <i className="ri-arrow-right-line ms-1" aria-hidden="true" />
                    </button>
                  </div>
                </>
              )
            }
          </ScopeState>
        </div>
      </SectionCard>

      {open && (
        <LearnerDrawer
          brandId={brandId}
          brandName={brandName}
          enrollmentId={open.enrollment_id}
          email={open.email_normalized}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
