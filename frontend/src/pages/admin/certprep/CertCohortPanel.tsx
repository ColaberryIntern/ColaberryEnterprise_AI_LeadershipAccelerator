import React, { useEffect, useState } from 'react';
import { SectionCard, StatCard, StatusBadge } from '../../../components/admin/shell';
import {
  fetchCohortReadiness, fetchCohortWeakness, fetchNotStarted,
  CohortReadinessRow, DomainWeakness, NotStartedStudent,
} from '../../../services/certPrepAdminApi';

/**
 * CertCohortPanel — the operational view: who is ready, where the cohort is
 * weak, and who never started.
 *
 * THE THREE THINGS THIS PANEL WILL NOT DO:
 *
 *   1. It will not print 0 for a student who has never been measured. The server
 *      returns `not_measured` with a null score for exactly those students, and
 *      a 0 in a readiness column reads as "tried and failed" when the truth is
 *      "has not tried". They are the students an instructor most needs to see,
 *      which is also why the query LEFT JOINs rather than INNER JOINs.
 *   2. It will not present a high score from a handful of answers as if it were
 *      settled. Sample confidence below 0.6 is labelled provisional next to the
 *      score, in the same words the student sees on their own page.
 *   3. It will not rank students. The table sorts by state and then by name, not
 *      by score, because a leaderboard is not what an instructor needs to decide
 *      who to talk to on Monday.
 */

const LOW_CONFIDENCE = 0.6;

const STATE_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  sustained: 'success',
  approaching: 'info',
  building: 'warning',
  not_measured: 'neutral',
};

const STATE_LABEL: Record<string, string> = {
  sustained: 'Sustained',
  approaching: 'Approaching',
  building: 'Building',
  not_measured: 'Not measured',
};

/** Order for triage, not for ranking: unmeasured first, they need the attention. */
const STATE_ORDER = ['not_measured', 'building', 'approaching', 'sustained'];

export function sortForTriage(rows: CohortReadinessRow[]): CohortReadinessRow[] {
  return [...rows].sort((a, b) => {
    const byState = STATE_ORDER.indexOf(a.overall_state) - STATE_ORDER.indexOf(b.overall_state);
    if (byState !== 0) return byState;
    return (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? '');
  });
}

export default function CertCohortPanel({
  cohortId, onEnrollmentIds,
}: { cohortId: string; onEnrollmentIds: (ids: string[]) => void }) {
  const [rows, setRows] = useState<CohortReadinessRow[]>([]);
  const [weakness, setWeakness] = useState<DomainWeakness[]>([]);
  const [notStarted, setNotStarted] = useState<NotStartedStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cohortId) { setRows([]); setWeakness([]); setNotStarted([]); onEnrollmentIds([]); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchCohortReadiness(cohortId),
      fetchCohortWeakness(cohortId),
      fetchNotStarted(cohortId),
    ])
      .then(([r, w, n]) => {
        if (cancelled) return;
        setRows(r); setWeakness(w); setNotStarted(n);
        onEnrollmentIds(r.map((x) => x.enrollment_id));
      })
      .catch(() => { if (!cancelled) setError('Could not load cohort data.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cohortId, onEnrollmentIds]);

  const measured = rows.filter((r) => r.overall_state !== 'not_measured').length;
  const sustained = rows.filter((r) => r.overall_state === 'sustained').length;

  if (!cohortId) {
    return <SectionCard><p className="text-muted mb-0">Select a cohort to see readiness.</p></SectionCard>;
  }

  return (
    <>
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3"><StatCard label="Students" value={rows.length} icon="group-line" /></div>
        <div className="col-6 col-lg-3"><StatCard label="Measured" value={measured} hint={`${rows.length - measured} not measured`} icon="ruler-line" /></div>
        <div className="col-6 col-lg-3"><StatCard label="Sustained" value={sustained} tone="success" icon="shield-check-line" /></div>
        <div className="col-6 col-lg-3"><StatCard label="Never started" value={notStarted.length} tone={notStarted.length > 0 ? 'warning' : 'neutral'} icon="user-unfollow-line" /></div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <SectionCard
        title="Readiness"
        subtitle="Colaberry readiness estimate — not a prediction of the Anthropic exam"
        icon="dashboard-3-line"
      >
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">State</th>
                <th scope="col" className="text-end">Overall</th>
                <th scope="col" className="text-end">Knowledge</th>
                <th scope="col" className="text-end">Answered</th>
                <th scope="col" className="text-end">Evidence</th>
                <th scope="col">Last computed</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="text-muted">Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="text-muted">No students in this cohort.</td></tr>
              )}
              {sortForTriage(rows).map((r) => {
                const unmeasured = r.overall_state === 'not_measured' || r.overall_scaled === null;
                const provisional = !unmeasured && (r.sample_confidence ?? 0) < LOW_CONFIDENCE;
                return (
                  <tr key={r.enrollment_id}>
                    <td>
                      <div>{r.full_name ?? '—'}</div>
                      <div className="small text-muted">{r.email ?? ''}</div>
                    </td>
                    <td>
                      <StatusBadge
                        label={STATE_LABEL[r.overall_state] ?? r.overall_state}
                        tone={STATE_TONE[r.overall_state] ?? 'neutral'}
                      />
                    </td>
                    <td className="text-end">
                      {unmeasured ? <span className="text-muted">Not measured</span> : r.overall_scaled}
                      {provisional && <div className="small text-muted">provisional</div>}
                    </td>
                    <td className="text-end">
                      {r.knowledge_scaled === null ? <span className="text-muted">—</span> : r.knowledge_scaled}
                    </td>
                    <td className="text-end">{r.answered_total}</td>
                    <td className="text-end">
                      {r.evidence_coverage_pct === null ? <span className="text-muted">—</span> : `${Math.round(r.evidence_coverage_pct)}%`}
                    </td>
                    <td className="small text-muted">
                      {r.computed_at ? new Date(r.computed_at).toLocaleDateString() : 'never'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="row g-3 mt-1">
        <div className="col-12 col-lg-7">
          <SectionCard title="Where the cohort is weak" icon="bar-chart-2-line">
            {weakness.length === 0 ? (
              <p className="text-muted mb-0">No answers yet, so there is nothing to be weak at.</p>
            ) : (
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th scope="col">Domain</th>
                    <th scope="col" className="text-end">Correct</th>
                    <th scope="col" className="text-end">Answered</th>
                    <th scope="col" className="text-end">Students</th>
                  </tr>
                </thead>
                <tbody>
                  {[...weakness].sort((a, b) => a.pct - b.pct).map((d) => (
                    <tr key={d.domain_id}>
                      <td><code>{d.domain_id}</code></td>
                      <td className="text-end">{Math.round(d.pct * 100)}%</td>
                      <td className="text-end">{d.answered}</td>
                      {/* The student count is here so a "40% correct" built from
                          one student's bad afternoon is visibly that. */}
                      <td className="text-end">{d.students}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>
        <div className="col-12 col-lg-5">
          <SectionCard title="Past the start week, never started" icon="user-unfollow-line">
            {notStarted.length === 0 ? (
              <p className="text-muted mb-0">Everyone eligible has started.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {notStarted.map((s) => (
                  <li key={s.enrollment_id} className="py-1 border-bottom">
                    {s.full_name ?? s.email ?? s.enrollment_id}
                    {s.full_name && s.email && <div className="small text-muted">{s.email}</div>}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
