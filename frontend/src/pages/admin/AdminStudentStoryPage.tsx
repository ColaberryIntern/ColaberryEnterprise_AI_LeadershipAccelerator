import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import PersonHistoryDrawer from '../../components/admin/PersonHistoryDrawer';
import { fetchStudents, StudentSummary } from '../../services/studentStoryApi';

// Floored "X ago" sign-up label.
function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 45) return 'just now';
  const units: [number, string][] = [
    [60, 'minute'], [60, 'hour'], [24, 'day'], [7, 'week'], [4.348, 'month'], [12, 'year'],
  ];
  let value = secs / 60;
  let label = 'minute';
  for (let i = 1; i < units.length; i += 1) {
    if (value < units[i][0]) break;
    value /= units[i][0];
    label = units[i][1];
  }
  const n = Math.floor(value);
  return `${n} ${label}${n === 1 ? '' : 's'} ago`;
}

/**
 * Student Story — the Support role's ONLY admin surface. A searchable roster;
 * clicking a student opens the full read-only "story" (PersonHistoryDrawer in
 * readOnly mode: no Free Access toggle, no View-as, no writes). Every call here
 * hits the students-section-gated API, so Support reaches nothing else in admin.
 * Owner/Admin can also open this page (they hold the students section too).
 */
export default function AdminStudentStoryPage() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StudentSummary | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      setStudents(await fetchStudents(q));
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  const onSearch = (e: React.FormEvent) => { e.preventDefault(); load(search); };

  return (
    <>
      <PageHeader
        title="Student Story"
        subtitle="Search a student and open their full read-only story — profile, activity, and history. Viewing only; nothing here changes a student's data."
      />
      <SectionCard>
        <form className="row g-2 align-items-end mb-3" onSubmit={onSearch}>
          <div className="col-md-6">
            <label className="form-label small fw-medium">Search by name</label>
            <input
              className="form-control form-control-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Start typing a name…"
            />
          </div>
          <div className="col-md-2">
            <button type="submit" className="btn btn-sm btn-outline-primary w-100">Search</button>
          </div>
        </form>

        {error && <div className="alert alert-danger py-2">{error}</div>}

        {loading ? (
          <div className="text-muted small">Loading students…</div>
        ) : students.length === 0 ? (
          <div className="text-muted small">No students match that search.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr><th>Name</th><th>Email</th><th style={{ width: 140 }}>Signed up</th><th style={{ width: 110 }}>Story</th></tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.enrollment_id}>
                    <td className="fw-semibold">{s.display_name}</td>
                    <td className="text-muted small">{s.email ?? '—'}</td>
                    <td className="text-muted small">{timeAgo(s.signed_up_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => setSelected(s)}
                        title={`Open ${s.display_name}'s story`}
                      >
                        <i className="ri-file-user-line me-1" aria-hidden="true"></i>Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {selected && (
        <PersonHistoryDrawer
          enrollmentId={selected.enrollment_id}
          name={selected.display_name}
          readOnly
          endpointBase="/api/admin/students"
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
