import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../utils/api';
import { SectionCard, StatCard, StatusBadge } from '../../../components/admin/shell';

/**
 * CurrentClassesDashboard — the snapshot that heads the Accelerator page.
 *
 * Answers one question before the cohort table answers any other: which classes
 * are teaching right now, and how are those students doing. Deliberately NOT a
 * summary of every cohort — the historical and not-yet-started ones are noise
 * against that question, and the self-paced Explorer pool (hundreds of members,
 * no sessions) would swamp every average while teaching nobody. The backend's
 * selection rules are in acceleratorCurrentClassesService.
 *
 * Nothing here is computed client-side beyond formatting: the percentages are
 * head-count weighted server-side, because a 49-student class and a 2-student
 * class must not move a headline average equally.
 */

interface NextSession {
  id: string;
  session_number: number;
  title: string;
  session_date: string;
  start_time: string | null;
}

interface CurrentClass {
  cohort_id: string;
  name: string;
  program_name: string | null;
  status: string;
  start_date: string | null;
  sessions_total: number;
  sessions_completed: number;
  pct_complete: number;
  first_session_date: string | null;
  last_session_date: string | null;
  next_session: NextSession | null;
  enrollments_active: number;
  avg_readiness: number | null;
  avg_attendance: number | null;
  at_risk_count: number;
  /** Null when the backend could not compute it. Rendered as nothing rather than
   *  as "0 awaiting review", which would be a claim we cannot support. */
  submissions_pending: number | null;
}

interface Snapshot {
  as_of: string;
  current: CurrentClass[];
  starting_soon: Array<{
    cohort_id: string; name: string; program_name: string | null;
    first_session_date: string | null; enrollments_active: number; sessions_total: number;
  }>;
  totals: {
    classes_in_flight: number;
    students_in_class: number;
    avg_attendance: number | null;
    avg_readiness: number | null;
    at_risk_count: number;
  };
}

/** Date-only string -> "Mon, Sep 8". Parsed as UTC parts rather than through
 *  `new Date('2026-09-08')`, which renders as the previous day west of UTC. */
function formatDay(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** Whole days from today to a date-only string; negative when past. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const then = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((then - today) / 86400000);
}

function relativeDay(iso: string | null): string {
  const n = daysUntil(iso);
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 0) return `${Math.abs(n)}d ago`;
  return `in ${n}d`;
}

/** Percent -> tone. Null means not measured yet, which is not the same as zero
 *  and must not be coloured as failure. */
function pctTone(v: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (v == null) return 'neutral';
  if (v >= 70) return 'success';
  if (v >= 40) return 'warning';
  return 'danger';
}

function pctText(v: number | null): string {
  return v == null ? 'Not measured' : `${v}%`;
}

function ProgressBar({ pct, tone }: { pct: number; tone: string }) {
  const color = tone === 'success' ? 'var(--bs-success)'
    : tone === 'warning' ? 'var(--bs-warning)'
    : tone === 'danger' ? 'var(--bs-danger)'
    : 'var(--bs-secondary)';
  return (
    <div
      className="progress"
      style={{ height: 6 }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Programme progress"
    >
      <div className="progress-bar" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

interface Props {
  /** Jump the page to a cohort-scoped drill-down tab. */
  onOpenCohort: (cohortId: string, tab: string) => void;
}

export default function CurrentClassesDashboard({ onOpenCohort }: Props) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/admin/accelerator/current-classes');
      setData(res.data);
    } catch {
      // Surfaced inline rather than as a toast: this panel is the top of the
      // page, and a silent empty state here reads as "no classes are running",
      // which is a very different statement from "the request failed".
      setError('Could not load the current-class snapshot.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SectionCard title="Right Now" subtitle="Classes currently in session.">
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary" role="status">
            <span className="visually-hidden">Loading…</span>
          </div>
        </div>
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title="Right Now" subtitle="Classes currently in session.">
        <div className="d-flex align-items-center justify-content-between">
          <span className="text-danger small mb-0">{error}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={load}>Retry</button>
        </div>
      </SectionCard>
    );
  }

  const t = data?.totals;
  const current = data?.current ?? [];
  const soon = data?.starting_soon ?? [];

  return (
    <SectionCard
      title="Right Now"
      subtitle="Classes that have started and have not yet finished — the cohorts teaching today."
      icon="pulse-line"
      actions={<button className="btn btn-sm btn-outline-secondary" onClick={load}>Refresh</button>}
    >
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <StatCard label="Classes in session" value={t?.classes_in_flight ?? 0} icon="presentation-line" tone="primary" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard label="Students in class" value={t?.students_in_class ?? 0} icon="team-line" tone="info" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="Avg attendance"
            value={pctText(t?.avg_attendance ?? null)}
            icon="user-follow-line"
            tone={pctTone(t?.avg_attendance ?? null)}
            hint="Weighted by class size"
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="At risk"
            value={t?.at_risk_count ?? 0}
            icon="alert-line"
            tone={(t?.at_risk_count ?? 0) > 0 ? 'warning' : 'success'}
            hint="Attendance below 60%"
          />
        </div>
      </div>

      {current.length === 0 && (
        <div className="border rounded p-3 bg-light-subtle">
          <div className="fw-semibold mb-1">No class is in session today.</div>
          <div className="text-muted small">
            {soon.length > 0
              ? `Next intake: ${soon[0].name} — first session ${formatDay(soon[0].first_session_date)} (${relativeDay(soon[0].first_session_date)}).`
              : 'No cohort has scheduled sessions ahead of today either. Add sessions to a cohort to see it here.'}
          </div>
        </div>
      )}

      {current.map((c) => (
        <div key={c.cohort_id} className="border rounded p-3 mb-2">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
            <div className="min-width-0">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <button
                  className="btn btn-link p-0 fw-semibold text-start"
                  onClick={() => onOpenCohort(c.cohort_id, 'class-dashboard')}
                >
                  {c.name}
                </button>
                <StatusBadge label={c.status} />
                {c.at_risk_count > 0 && (
                  <StatusBadge label={`${c.at_risk_count} at risk`} tone="warning" icon="alert-line" />
                )}
              </div>
              {c.program_name && <div className="text-muted small">{c.program_name}</div>}
            </div>
            <div className="d-flex gap-1 flex-wrap">
              <button className="btn btn-sm btn-outline-secondary" onClick={() => onOpenCohort(c.cohort_id, 'sessions')}>Sessions</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => onOpenCohort(c.cohort_id, 'participants')}>Participants</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => onOpenCohort(c.cohort_id, 'curriculum')}>Curriculum</button>
            </div>
          </div>

          <div className="mb-2">
            <div className="d-flex justify-content-between small text-muted mb-1">
              <span>Session {c.sessions_completed} of {c.sessions_total}</span>
              <span>{c.pct_complete}% through</span>
            </div>
            <ProgressBar pct={c.pct_complete} tone="success" />
          </div>

          <div className="row g-2 small">
            <div className="col-6 col-md-3">
              <div className="text-muted">Students</div>
              <div className="fw-semibold">{c.enrollments_active}</div>
            </div>
            <div className="col-6 col-md-3">
              <div className="text-muted">Attendance</div>
              <div className={`fw-semibold text-${pctTone(c.avg_attendance) === 'neutral' ? 'muted' : pctTone(c.avg_attendance)}`}>
                {pctText(c.avg_attendance)}
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="text-muted">Readiness</div>
              <div className={`fw-semibold text-${pctTone(c.avg_readiness) === 'neutral' ? 'muted' : pctTone(c.avg_readiness)}`}>
                {pctText(c.avg_readiness)}
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="text-muted">Next session</div>
              <div className="fw-semibold">
                {c.next_session
                  ? <>{formatDay(c.next_session.session_date)} <span className="text-muted fw-normal">({relativeDay(c.next_session.session_date)})</span></>
                  : <span className="text-muted fw-normal">None scheduled</span>}
              </div>
            </div>
          </div>

          {c.submissions_pending != null && c.submissions_pending > 0 && (
            <div className="mt-2 small">
              <StatusBadge label={`${c.submissions_pending} submission${c.submissions_pending === 1 ? '' : 's'} awaiting review`} tone="info" icon="inbox-line" />
            </div>
          )}
        </div>
      ))}

      {current.length > 0 && soon.length > 0 && (
        <div className="text-muted small mt-2">
          Starting soon: {soon.slice(0, 3).map((s) => `${s.name} (${relativeDay(s.first_session_date)})`).join(' · ')}
        </div>
      )}
    </SectionCard>
  );
}
