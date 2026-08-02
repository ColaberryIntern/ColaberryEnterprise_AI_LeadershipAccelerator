import React, { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import api from '../../../utils/api';
import { useToast } from '../../../components/ui/ToastProvider';
import { SectionCard, StatCard, StatusBadge } from '../../../components/admin/shell';

type TrendDirection = 'up' | 'down' | 'flat';

interface SessionPoint {
  session_number: number;
  session_title: string;
  attendance_rate: number;
  submission_rate: number | null;
}

interface StudentRow {
  enrollment_id: string;
  full_name: string;
  readiness_score: number | null;
  prework_score: number | null;
  attendance_score: number | null;
  assignment_score: number | null;
  maturity_level: number;
  attendance_trend: TrendDirection;
}

interface ClassDashboardData {
  cohort_id: string;
  kpis: {
    avg_readiness: { value: number };
    avg_attendance: { value: number; trend: TrendDirection };
    avg_assignment: { value: number; trend: TrendDirection };
    prework_completion_rate: number;
  };
  session_series: SessionPoint[];
  students: StudentRow[];
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-muted';
  if (score >= 70) return 'text-success';
  if (score >= 40) return 'text-warning';
  return 'text-danger';
}

function deltaFor(trend: TrendDirection): { value: string; direction: TrendDirection } {
  const label = trend === 'up' ? 'Improving' : trend === 'down' ? 'Declining' : 'Steady';
  return { value: label, direction: trend };
}

interface Props {
  cohortId: string;
}

/**
 * Class Dashboard — per-cohort analytics absorbing the old flat Readiness tab.
 * Adds what that tab never had: cohort-wide trend indicators and a
 * session-ordered chart. No historical score-snapshot table exists in this
 * codebase, so trends are derived from real session-ordered attendance/
 * submission data (see acceleratorService.ts's getClassDashboard) — not a
 * fabricated history. avg_readiness deliberately has no trend arrow: it's a
 * composite blend with no derivable series of its own, and inventing one would
 * misrepresent the data that's actually available.
 */
export default function ClassDashboardTab({ cohortId }: Props) {
  const { showToast } = useToast();
  const [data, setData] = useState<ClassDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const load = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/admin/accelerator/cohorts/${cohortId}/class-dashboard`);
      setData(res.data);
    } catch {
      showToast('Failed to load Class Dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showToast]);

  useEffect(() => { load(); }, [load]);

  async function handleRecomputeAll() {
    setRecomputing(true);
    try {
      await api.post(`/api/admin/accelerator/cohorts/${cohortId}/readiness`);
      showToast('Scores recomputed', 'success');
      await load();
    } catch {
      showToast('Failed to recompute', 'error');
    } finally {
      setRecomputing(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-center text-muted py-4">No data available for this cohort yet.</div>;
  }

  const chartData = data.session_series.map((p) => ({
    name: `#${p.session_number}`,
    Attendance: p.attendance_rate,
    Submissions: p.submission_rate,
  }));

  return (
    <>
      <SectionCard
        title="Class Dashboard"
        subtitle="How this cohort is doing, measured across the data actually available — attendance, prework, and assignment completion, with trend indicators derived from session-to-session progress."
        actions={
          <button className="btn btn-primary btn-sm" onClick={handleRecomputeAll} disabled={recomputing}>
            {recomputing ? 'Computing…' : 'Recompute All'}
          </button>
        }
      >
        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <StatCard
              label="Avg Readiness"
              value={`${data.kpis.avg_readiness.value}%`}
              icon="shield-check-line"
              tone="success"
              hint="composite score"
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Avg Attendance"
              value={`${data.kpis.avg_attendance.value}%`}
              icon="user-follow-line"
              tone="primary"
              delta={deltaFor(data.kpis.avg_attendance.trend)}
              hint="recent vs. earlier sessions"
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Avg Assignments"
              value={`${data.kpis.avg_assignment.value}%`}
              icon="file-list-3-line"
              tone="info"
              delta={deltaFor(data.kpis.avg_assignment.trend)}
              hint="recent vs. earlier sessions"
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Prework Completion"
              value={`${data.kpis.prework_completion_rate}%`}
              icon="checkbox-circle-line"
              tone="warning"
              hint="before session 1"
            />
          </div>
        </div>

        {data.session_series.length > 0 ? (
          <div style={{ width: '100%', height: 280 }} className="mb-4">
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} unit="%" />
                <Tooltip formatter={(value: number | null) => (value == null ? 'n/a' : `${value}%`)} />
                <Legend />
                <Line type="monotone" dataKey="Attendance" stroke="var(--status-success, #38a169)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Submissions" stroke="var(--status-info, #2b6cb0)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center text-muted py-3 mb-4">No completed sessions yet — the trend chart fills in as classes happen.</div>
        )}

        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Participant</th>
                <th>Prework</th>
                <th>Attendance</th>
                <th>Assignments</th>
                <th>Readiness</th>
                <th>Maturity</th>
                <th>Attendance Trend</th>
              </tr>
            </thead>
            <tbody>
              {data.students.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted py-4">No enrollments</td></tr>
              ) : data.students.map((s) => (
                <tr key={s.enrollment_id}>
                  <td className="fw-medium">{s.full_name}</td>
                  <td className={scoreColor(s.prework_score)}>{s.prework_score != null ? `${s.prework_score}%` : '-'}</td>
                  <td className={scoreColor(s.attendance_score)}>{s.attendance_score != null ? `${s.attendance_score}%` : '-'}</td>
                  <td className={scoreColor(s.assignment_score)}>{s.assignment_score != null ? `${s.assignment_score}%` : '-'}</td>
                  <td><span className={`fw-bold ${scoreColor(s.readiness_score)}`}>{s.readiness_score != null ? `${s.readiness_score}%` : '-'}</span></td>
                  <td><StatusBadge label={`Level ${s.maturity_level || 0}`} tone="primary" /></td>
                  <td>
                    <i
                      className={`ri-arrow-${s.attendance_trend === 'flat' ? 'right' : s.attendance_trend}-line`}
                      aria-hidden="true"
                      title={s.attendance_trend}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}
