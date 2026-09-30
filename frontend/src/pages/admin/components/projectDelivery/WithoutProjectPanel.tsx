import React, { useState } from 'react';

/**
 * WithoutProjectPanel — the students this board otherwise cannot show.
 *
 * The delivery table is built from projects, so a student who never created one
 * is absent from it entirely. That is a measurement gap rather than a rendering
 * one: cohort health read off this page silently excluded exactly the people in
 * the worst position. On production 2026-09-10 the July cohort had 49 active
 * enrollments, 25 with a project and 24 with none — 9 of those paying students on
 * external addresses, 49 days in.
 */

export interface WithoutProjectRow {
  enrollment_id: string;
  student_name: string | null;
  student_email: string | null;
  cohort_name: string | null;
  payment_status: string | null;
  tier: string | null;
  amount_paid: string | null;
  enrolled_on: string | null;
  internal: boolean;
}

export interface WithoutProjectSummary {
  active_enrollments: number;
  with_project: number;
  without_project: number;
  paid_external_without_project: number;
  rows: WithoutProjectRow[];
}

/** Unscoped, this spans every cohort ever run — 444 rows on production. Listing
 *  them all would bury the handful that matter, so the list is capped and the cap
 *  is STATED. A silent truncation reads as "that's everyone", which is the one
 *  thing it must never imply. */
export const ROW_CAP = 25;

const paying = (r: WithoutProjectRow) =>
  (r.payment_status ?? '').trim().toLowerCase() === 'paid';

/** Paying, external, and holding nothing: the rows worth acting on. */
export function intervention(rows: WithoutProjectRow[]): WithoutProjectRow[] {
  return rows.filter((r) => paying(r) && !r.internal);
}

export default function WithoutProjectPanel({ data }: { data: WithoutProjectSummary | null }) {
  const [open, setOpen] = useState(false);
  // Absent OR malformed. This is a supplementary panel on the delivery board and
  // must never take the board down: the view already fetches it with
  // Promise.allSettled for exactly that reason, but a fulfilled response of the
  // wrong shape slipped past that guard and `intervention(data.rows)` threw on
  // `undefined.filter` -- which is how two suites went red on main. Validate the
  // shape here, where the fields are actually read, rather than trust the caller.
  if (!data || !Array.isArray(data.rows) || typeof data.without_project !== 'number') return null;

  // Nothing to report is worth saying plainly — an absent panel is ambiguous
  // between "everyone has a project" and "this never loaded".
  if (data.without_project === 0) {
    return (
      <div style={{
        border: '0.5px solid var(--border-subtle)', borderRadius: 10, padding: '10px 14px',
        marginBottom: 12, fontSize: 13, color: 'var(--text-muted)',
        background: 'var(--surface-card)',
      }}>
        <i className="ri-check-line me-1" aria-hidden="true" />
        Every active enrollment in scope has a project.
      </div>
    );
  }

  const list = intervention(data.rows);
  const shown = list.slice(0, ROW_CAP);
  const hidden = list.length - shown.length;

  return (
    <div style={{
      border: '0.5px solid var(--status-warning, #b8801f)', borderRadius: 10,
      background: 'var(--status-warning-bg, #fdf6e7)', marginBottom: 12, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%', border: 0, background: 'transparent', textAlign: 'left',
          padding: '10px 14px', cursor: 'pointer', display: 'flex', gap: 10,
          alignItems: 'center', color: 'var(--text-strong)',
        }}
      >
        <i className={`ri-arrow-${open ? 'down' : 'right'}-s-line`} aria-hidden="true" />
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>
          {data.without_project} enrolled with no project
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {data.with_project} of {data.active_enrollments} active enrollments have one
          {data.paid_external_without_project > 0
            && ` · ${data.paid_external_without_project} paying and holding nothing`}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 12px' }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 8px' }}>
            These students cannot appear in the table below, because the table is built
            from projects. Listing paying students on external addresses only.
          </p>
          {shown.length === 0 ? (
            <p style={{ fontSize: 13, margin: 0, color: 'var(--text-muted)' }}>
              None of them are paying external students — the {data.without_project} without a
              project are internal seats or unpaid enrollments.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table table-sm align-middle mb-0" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Student</th><th>Email</th><th>Cohort</th>
                    <th style={{ width: 90 }}>Paid</th><th style={{ width: 110 }}>Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.enrollment_id}>
                      <td style={{ fontWeight: 500 }}>{r.student_name || '—'}</td>
                      <td className="text-muted">{r.student_email || '—'}</td>
                      <td className="text-muted">{r.cohort_name || '—'}</td>
                      <td>{r.amount_paid ? `$${r.amount_paid}` : '—'}</td>
                      <td className="text-muted">{r.enrolled_on || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hidden > 0 && (
            <p style={{ fontSize: 12.5, margin: '8px 0 0', color: 'var(--text-muted)' }}>
              Showing {shown.length} of {list.length}. {hidden} more not listed — select a
              single cohort to narrow this.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
