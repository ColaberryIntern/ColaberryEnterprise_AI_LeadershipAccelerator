import React, { useCallback, useState } from 'react';
import { PageHeader, SectionCard, StatCard } from '../../components/admin/shell';
import api from '../../utils/api';

// ProofDesk Outcomes & Learning — Milestone 5 (spec 20.12). Read-only, on-demand
// day/week story assembled entirely from real ledger/evidence facts — see
// backend/src/services/outcomes/executiveNarrativeService.ts for how each section is
// computed. No fabricated content: when `honest_empty` is true, this page says so
// explicitly instead of inventing a narrative.

export type NarrativeWindow = 'day' | 'week';

interface ExecutiveNarrative {
  window: NarrativeWindow;
  generated_at: string;
  shipped: { count: number; tickets: Array<{ id: string; title: string }> };
  prevented: { would_block: number; would_require_approval: number };
  failed_safely: { count: number; note: string };
  needs_decision: { count: number; items: Array<{ ticket_id: string; reason: string }> };
  measurable_results: { stable: number; recurrence_detected: number; insufficient_data: number };
  honest_empty: boolean;
}

async function fetchNarrative(window: NarrativeWindow): Promise<ExecutiveNarrative> {
  const res = await api.get<ExecutiveNarrative>('/api/admin/dashboard/executive-narrative', {
    params: { window },
  });
  return res.data;
}

export default function AdminExecutiveNarrativePage() {
  const [window_, setWindow] = useState<NarrativeWindow>('day');
  const [narrative, setNarrative] = useState<ExecutiveNarrative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (w: NarrativeWindow) => {
    setLoading(true);
    try {
      const data = await fetchNarrative(w);
      setNarrative(data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to generate executive narrative');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(window_);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window_]);

  return (
    <>
      <PageHeader
        title="Executive Narrative"
        icon="file-text-line"
        subtitle="ProofDesk Milestone 5 — what shipped, what was prevented, what failed safely, what needs a decision, and what produced measurable results. Assembled from real ledger data on demand, never fabricated."
        breadcrumb={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Work Ledger Health', to: '/admin/work-ledger-health' },
          { label: 'Executive Narrative' },
        ]}
        actions={
          <div className="btn-group" role="group" aria-label="Narrative window">
            <button
              className={`btn btn-sm ${window_ === 'day' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setWindow('day')}
            >
              Today
            </button>
            <button
              className={`btn btn-sm ${window_ === 'week' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setWindow('week')}
            >
              This week
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : error || !narrative ? (
        <div className="alert alert-danger mx-3">{error || 'No data'}</div>
      ) : narrative.honest_empty ? (
        <SectionCard>
          <div className="text-center text-muted py-4">
            <i className="ri-moon-clear-line" style={{ fontSize: '2rem' }} aria-hidden="true" />
            <p className="mt-2 mb-0">
              No real activity in this {narrative.window === 'day' ? 'day' : 'week'} — nothing shipped, nothing
              prevented, no failures, no pending decisions, and no measurable results to report. This is an honest
              status, not a loading error.
            </p>
          </div>
        </SectionCard>
      ) : (
        <>
          <div className="row g-3 mb-3">
            <div className="col-6 col-lg-2">
              <StatCard label="Shipped" value={narrative.shipped.count} icon="rocket-line" tone="success" />
            </div>
            <div className="col-6 col-lg-2">
              <StatCard label="Would block" value={narrative.prevented.would_block} icon="shield-cross-line" tone="neutral" />
            </div>
            <div className="col-6 col-lg-2">
              <StatCard
                label="Needs approval"
                value={narrative.prevented.would_require_approval}
                icon="hourglass-line"
                tone="neutral"
              />
            </div>
            <div className="col-6 col-lg-2">
              <StatCard label="Failed safely" value={narrative.failed_safely.count} icon="checkbox-circle-line" tone="neutral" />
            </div>
            <div className="col-6 col-lg-2">
              <StatCard label="Needs decision" value={narrative.needs_decision.count} icon="question-line" tone="warning" />
            </div>
            <div className="col-6 col-lg-2">
              <StatCard
                label="Recurrence flags"
                value={narrative.measurable_results.recurrence_detected}
                icon="error-warning-line"
                tone={narrative.measurable_results.recurrence_detected > 0 ? 'warning' : 'neutral'}
              />
            </div>
          </div>

          <SectionCard className="mb-3">
            <h6 className="fw-semibold">What shipped</h6>
            {narrative.shipped.tickets.length === 0 ? (
              <p className="text-muted mb-0">Nothing reached "done" in this window.</p>
            ) : (
              <ul className="mb-0">
                {narrative.shipped.tickets.map((t) => (
                  <li key={t.id}>{t.title}</li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard className="mb-3">
            <h6 className="fw-semibold">What failed safely</h6>
            <p className="text-muted small mb-1">{narrative.failed_safely.note}</p>
            <p className="mb-0">{narrative.failed_safely.count} run(s).</p>
          </SectionCard>

          <SectionCard className="mb-3">
            <h6 className="fw-semibold">What needs a decision</h6>
            {narrative.needs_decision.items.length === 0 ? (
              <p className="text-muted mb-0">No pending approvals in this window.</p>
            ) : (
              <ul className="mb-0">
                {narrative.needs_decision.items.map((item, idx) => (
                  <li key={`${item.ticket_id}-${idx}`}>
                    Ticket <code>{item.ticket_id}</code> — {item.reason}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard>
            <h6 className="fw-semibold">Measurable results</h6>
            <p className="mb-0">
              {narrative.measurable_results.stable} stable, {narrative.measurable_results.recurrence_detected}{' '}
              recurrence detected, {narrative.measurable_results.insufficient_data} insufficient data.
            </p>
          </SectionCard>
        </>
      )}
    </>
  );
}
