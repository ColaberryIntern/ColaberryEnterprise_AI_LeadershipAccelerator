import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api';
import { SectionCard, StatCard, StatusBadge } from '../../../components/admin/shell';
import PersonLink from '../../../components/admin/person/PersonLink';

/**
 * StudentPacePanel — movement. Who is ahead of the class, who is falling behind it.
 *
 * WHY IT LIVES ON THE CLASS DASHBOARD. Ali asked for this in the Class Dashboard's own
 * terms: "One thing I can't really see in my Class Dashboard is movement." It first shipped
 * inside the Curriculum tab, which is a drill-down two clicks deep, so the only practical
 * way to reach it was a `?tab=curriculum&cohort=<id>` link. A KPI you need a hand-made URL
 * to open is not a KPI anybody reads. The cohort card's primary click lands here, so this
 * is the screen that gets seen.
 *
 * The split with CurriculumCompletionTab is by question, not by convenience:
 *   - "which parts of the curriculum are people finishing?" -> Curriculum tab, card tree
 *   - "where is each student relative to the class?"        -> here
 *
 * PACE-ONLY FETCH. `?view=pace` drops the per-card tree from the response: 280.2 KB becomes
 * 8.2 KB against the July 2026 cohort. This panel renders on the cohort landing view, so
 * that difference is paid on every open.
 */

type Band = 'gold' | 'green' | 'yellow' | 'red';

interface StudentPace {
  enrollmentId: string;
  name: string;
  weeksCompleted: number;
  cardsCompleted: number;
  furthestWeekTouched: number | null;
  delta: number;
  band: Band;
}

interface PaceData {
  scheduledWeek: number;
  deliveredSessions: number;
  activeStudents: number;
  pace: Record<Band, number>;
  students: StudentPace[];
}

interface WeekRow {
  week: number | null;
  publishedCardCount: number;
  completed: number;
  completedPct: number;
  weekDone: boolean;
}

const BANDS: Band[] = ['gold', 'green', 'yellow', 'red'];

/**
 * Band presentation. The rule in the caption is Ali's, verbatim in effect: gold is two or
 * more weeks ahead, green is level with the class or one ahead, yellow is exactly one week
 * behind, red is two or more behind.
 *
 * `gold` renders in the primary tone rather than a literal gold. The admin design system
 * has six tones and none of them is gold; inventing a hex here would be the one thing the
 * shell components exist to prevent. Primary still reads as "best" against the
 * success/warning/danger run below it, and the label carries the name.
 */
const BAND_META: Record<Band, { tone: 'primary' | 'success' | 'warning' | 'danger'; label: string; rule: string; icon: string }> = {
  gold: { tone: 'primary', label: 'Gold', rule: '2+ weeks ahead', icon: 'medal-line' },
  green: { tone: 'success', label: 'Green', rule: 'keeping up', icon: 'check-line' },
  yellow: { tone: 'warning', label: 'Yellow', rule: '1 week behind', icon: 'alert-line' },
  red: { tone: 'danger', label: 'Red', rule: '2+ weeks behind', icon: 'error-warning-line' },
};

const weekLabel = (w: number | null) => (w === null ? 'Unscheduled' : `Week ${w}`);

export default function StudentPacePanel({ cohortId }: { cohortId: string }) {
  const [data, setData] = useState<PaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Band | null>(null);
  const [drill, setDrill] = useState<{ name: string; rows: WeekRow[] } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    api.get(`/api/admin/accelerator/cohorts/${cohortId}/curriculum-completion?view=pace`)
      .then((res) => { if (live) setData(res.data); })
      .catch((e) => { if (live) setError(e?.response?.data?.error || 'Could not load student pace'); });
    return () => { live = false; };
  }, [cohortId]);

  // Selecting a cohort while a drill-down is open would otherwise leave one student's weeks
  // on screen under another cohort's numbers.
  useEffect(() => { setDrill(null); setFilter(null); }, [cohortId]);

  const openStudent = useCallback(async (s: StudentPace) => {
    setDrillLoading(true);
    setDrill(null);
    try {
      const res = await api.get(
        `/api/admin/accelerator/cohorts/${cohortId}/students/${s.enrollmentId}/week-breakdown`);
      setDrill({ name: res.data.name || s.name, rows: res.data.rows || [] });
    } catch {
      setDrill({ name: s.name, rows: [] });
    } finally {
      setDrillLoading(false);
    }
  }, [cohortId]);

  const shown = useMemo(
    () => (data ? data.students.filter((s) => !filter || s.band === filter) : []),
    [data, filter]
  );

  if (error) return <div className="alert alert-warning">{error}</div>;
  if (!data) return <div className="text-muted p-3">Loading student pace…</div>;

  return (
    <SectionCard
      title="Movement"
      icon="run-line"
      subtitle={
        `Where each student sits against the class, which is on week ${data.scheduledWeek} `
        + `after ${data.deliveredSessions} sessions. A week counts as done once a student `
        + 'completes 30% of its published cards. Click a band to filter, or a student for '
        + 'their week by week.'
      }
    >
      <div className="row g-3 mb-4">
        {BANDS.map((b) => {
          const meta = BAND_META[b];
          return (
            <div className="col-6 col-lg-3" key={b}>
              <StatCard
                label={`${meta.label} — ${meta.rule}`}
                value={data.pace[b] ?? 0}
                icon={meta.icon}
                tone={meta.tone}
                active={filter === b}
                onClick={() => setFilter((cur) => (cur === b ? null : b))}
                hint={`of ${data.activeStudents} active`}
              />
            </div>
          );
        })}
      </div>

      {filter && (
        <div className="d-flex align-items-center gap-2 mb-2">
          <span className="small text-muted">
            Showing {shown.length} {BAND_META[filter].label} student{shown.length === 1 ? '' : 's'}.
          </span>
          <button className="btn btn-sm btn-link p-0" onClick={() => setFilter(null)}>Show all</button>
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-sm align-middle">
          <thead>
            <tr>
              <th>Participant</th>
              <th>Band</th>
              <th>Weeks completed</th>
              <th>Delta vs class</th>
              <th>Cards completed</th>
              <th>Furthest week</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr
                key={s.enrollmentId}
                onClick={() => { void openStudent(s); }}
                style={{ cursor: 'pointer' }}
              >
                <td><PersonLink name={s.name} enrollmentId={s.enrollmentId} stopPropagation /></td>
                <td><StatusBadge label={BAND_META[s.band].label} tone={BAND_META[s.band].tone} /></td>
                <td>{s.weeksCompleted}</td>
                <td className={s.delta < 0 ? 'text-danger' : 'text-success'}>
                  {s.delta > 0 ? `+${s.delta}` : s.delta}
                </td>
                <td>{s.cardsCompleted}</td>
                <td>{s.furthestWeekTouched ?? '—'}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr><td colSpan={6} className="text-muted small">No students in this band.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {drillLoading && <div className="text-muted small">Loading week by week…</div>}

      {drill && (
        <div className="card mt-3">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-start">
              <h6 className="mb-2">{drill.name} — week by week</h6>
              <button className="btn btn-sm btn-link" onClick={() => setDrill(null)}>Close</button>
            </div>
            {drill.rows.length ? (
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Week</th><th>Completed</th><th>Published cards</th>
                      <th>%</th><th>Counts as done</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drill.rows.map((r) => (
                      <tr key={String(r.week)}>
                        <td>{weekLabel(r.week)}</td>
                        <td>{r.completed}</td>
                        <td>{r.publishedCardCount}</td>
                        <td>{r.completedPct}%</td>
                        <td>{r.weekDone ? 'yes' : 'no'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted small mb-0">No week breakdown available for this student.</p>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
