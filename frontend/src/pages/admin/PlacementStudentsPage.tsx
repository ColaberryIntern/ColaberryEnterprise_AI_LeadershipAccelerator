import React, { useEffect, useState } from 'react';
import { fetchPrepStudents, fetchStudentPrep, type PrepStudentRow, type StaffDashboard } from '../../services/placementApi';

/**
 * Placement > Student prep (Career Prep v27, CP2.1). Read-only: staff see each student's Career Prep
 * evidence and skills exactly as the student does (M1 Q3 default). Numbers that do not exist are
 * shown as "Not enough data yet", never as 0. Access is the server's: without the `placement`
 * section the API answers 403 and this page says so.
 */
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });

const PlacementStudentsPage: React.FC = () => {
  const [rows, setRows] = useState<PrepStudentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; name: string; data: StaffDashboard | null } | null>(null);

  useEffect(() => {
    fetchPrepStudents().then(setRows).catch((e) => {
      setError(e?.response?.status === 403 ? 'You do not have access to Placement.' : 'Could not load students. Try again.');
    });
  }, []);

  const view = (r: PrepStudentRow) => {
    setOpen({ id: r.enrollmentId, name: r.name, data: null });
    fetchStudentPrep(r.enrollmentId)
      .then((data) => setOpen({ id: r.enrollmentId, name: r.name, data }))
      .catch(() => setError('Could not load that student. Try again.'));
  };

  return (
    <div className="container-fluid py-3" data-testid="placement-students">
      <h1 className="h4 mb-1">Student prep</h1>
      <p className="text-muted mb-3">Every student practicing in Career Prep, newest activity first. Read-only.</p>
      {error && <div className="alert alert-warning" role="alert">{error}</div>}
      {!rows && !error && <p className="text-muted">Loading students...</p>}
      {rows && rows.length === 0 && <p className="text-muted">No student has Career Prep evidence yet.</p>}
      {rows && rows.length > 0 && (
        <table className="table table-sm align-middle">
          <thead><tr><th scope="col">Student</th><th scope="col">Readiness</th><th scope="col">Evidence</th><th scope="col">Last activity</th><th scope="col"><span className="visually-hidden">Open</span></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.enrollmentId}>
                <td>{r.name || 'Unnamed student'}</td>
                <td>{r.readiness !== undefined ? `${r.readiness} / 100` : <span className="text-muted">Not enough data yet</span>}</td>
                <td>{r.observations}</td>
                <td>{fmt(r.lastObserved)}</td>
                <td><button type="button" className="btn btn-outline-primary btn-sm" onClick={() => view(r)}>View prep</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && (
        <section className="card mt-3" aria-label={`${open.name}'s prep`} data-testid="placement-student-prep">
          <div className="card-body">
            <h2 className="h5">{open.name || 'Student'}</h2>
            {!open.data ? <p className="text-muted">Loading...</p> : (
              <>
                <p className="mb-2">Readiness: {open.data.readiness ? `${open.data.readiness.value} / 100` : 'Not enough data yet'}
                  {open.data.readiness?.target !== undefined ? ` (ready at ${open.data.readiness.target})` : ''}</p>
                <ul className="list-unstyled mb-0">
                  {open.data.skills.map((s) => (
                    <li key={s.key}>{s.label}: {s.score !== undefined ? s.score : <span className="text-muted">Not enough data yet</span>}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default PlacementStudentsPage;
