import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard, StatusBadge } from '../shell';
import {
  buildFromUnderstanding,
  describeBuildError,
  listFlotationUnderstandings,
  FlotationUnderstandingRow,
  StartedBuild,
} from '../../../services/adminFlotationIntakeApi';
import { getViewAsUrl } from '../../../services/adminOrgApi';

/**
 * The management door into the one project intake.
 *
 *     "as an admin, I can create the project myself so I test the processes (that must stay
 *      in sync) and understand the user experience."  (Ali, 2026-09-16)
 *
 * Every AI Flotation conversation that produced an understanding is listed here with the
 * person it belongs to, where a build would land, and whether one already exists. "Build
 * this project" runs it through the SAME `startBuild` the portal wizard uses - not a copy of
 * the pipeline, the pipeline - so what the admin sees afterwards is what the prospect would
 * see, and what a student would see.
 *
 * Contrast with `InternshipProjectAuthor` beside it, which lets a manager hand-write
 * releases and stories. That bypasses intake, decompose and gate entirely; this does not.
 */

const fmtWhen = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

interface RowState {
  busy: boolean;
  error: string | null;
  started: StartedBuild | null;
}

export default function FlotationIntakePanel() {
  const [rows, setRows] = useState<FlotationUnderstandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, RowState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await listFlotationUnderstandings());
    } catch (err) {
      setLoadError(describeBuildError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patch = (id: string, p: Partial<RowState>) =>
    setState((s) => ({ ...s, [id]: { busy: false, error: null, started: null, ...s[id], ...p } }));

  const build = async (row: FlotationUnderstandingRow) => {
    patch(row.id, { busy: true, error: null });
    try {
      const started = await buildFromUnderstanding(row.id, { enrollmentId: row.enrollment?.id });
      patch(row.id, { busy: false, started });
      // The list is the source of truth for "already built"; refresh it rather than
      // guessing at the row locally.
      void load();
    } catch (err) {
      patch(row.id, { busy: false, error: describeBuildError(err) });
    }
  };

  const viewAs = async (enrollmentId: string) => {
    const url = await getViewAsUrl(enrollmentId);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <SectionCard
      title="Build a project from an enquiry"
      icon="hammer-line"
      subtitle="The same intake a student runs in the portal, started from here"
      actions={
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void load()} disabled={loading}>
          <i className="ri-refresh-line me-1" />Refresh
        </button>
      }
    >
      {loading && rows.length === 0 ? (
        <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
      ) : loadError ? (
        <p className="text-danger small mb-0">{loadError}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted small mb-0 text-center py-3">No AI Flotation conversation has produced an understanding yet.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover table-sm align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Project</th>
                <th>Who</th>
                <th>Lands in</th>
                <th className="text-end">Items</th>
                <th>Build</th>
                <th className="text-end" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const s = state[row.id] || { busy: false, error: null, started: null };
                const built = row.build || s.started;
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="fw-semibold">{row.title || 'Untitled'}</div>
                      <div className="small text-muted">
                        {row.source === 'voice_transcript' ? 'from a call' : 'from the written interview'}
                        {row.confirmed_at ? ' · confirmed' : ' · not yet confirmed'}
                      </div>
                    </td>
                    <td>
                      {row.lead ? (
                        <>
                          <div>{row.lead.name || row.lead.email}</div>
                          <div className="small text-muted">{row.lead.company || row.lead.email}</div>
                        </>
                      ) : <span className="text-muted small">no lead</span>}
                    </td>
                    <td>
                      {row.enrollment ? (
                        <StatusBadge label={row.enrollment.tier} tone={row.enrollment.tier === 'guest' ? 'neutral' : 'info'} />
                      ) : (
                        <StatusBadge label="no account" tone="warning" />
                      )}
                    </td>
                    <td className="text-end">{row.items}</td>
                    <td>
                      {built ? (
                        <div className="small">
                          <StatusBadge label={s.started && !s.started.reused ? s.started.status : 'started'} tone="success" />
                          <div className="text-muted">{row.build ? fmtWhen(row.build.started_at) : 'just now'}</div>
                        </div>
                      ) : s.error ? (
                        <span className="text-danger small">{s.error}</span>
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                    <td className="text-end text-nowrap">
                      {built && row.enrollment ? (
                        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void viewAs(row.enrollment!.id)}>
                          <i className="ri-eye-line me-1" />See it as they would
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={s.busy || !row.enrollment}
                          title={row.enrollment ? undefined : 'This enquiry has no account to build into yet'}
                          onClick={() => void build(row)}
                        >
                          {s.busy ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ri-hammer-line me-1" />}
                          Build this project
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="small text-muted mb-0 mt-3">
        Runs the portal&rsquo;s own intake &rarr; decompose &rarr; gate &rarr; repair &rarr; publish. Generation takes a minute or two;
        the project then appears on their portal exactly as a student-created one would.
      </p>
    </SectionCard>
  );
}
