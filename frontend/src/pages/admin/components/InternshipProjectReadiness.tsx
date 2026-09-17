import React, { useEffect, useState } from 'react';
import { fetchInternshipProjectReadiness, ProjectReadinessRow } from '../../../services/adminInternshipApi';

/**
 * The manager's "who is ready for a project" roster. An intern is ready once they
 * have cleared the first three weeks and has no project yet — Ali assigns the
 * project at that point. Rows are ordered ready-first; clicking one opens that
 * intern so a project can be authored and assigned.
 */
const badge = (bg: string): React.CSSProperties => ({ background: bg, color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10 });

const InternshipProjectReadiness: React.FC<{ onSelect: (applicationId: string) => void }> = ({ onSelect }) => {
  const [rows, setRows] = useState<ProjectReadinessRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchInternshipProjectReadiness()
      .then((r) => { if (alive) setRows(r.interns); })
      .catch(() => { if (alive) setError('Could not load project readiness.'); });
    return () => { alive = false; };
  }, []);

  if (error) return <div className="alert alert-warning py-2 mb-0" role="alert">{error}</div>;
  if (!rows) return <p className="text-muted mb-0">Loading…</p>;
  if (rows.length === 0) return <p className="text-muted mb-0">No active interns yet.</p>;

  const readyCount = rows.filter((r) => r.ready_for_project).length;

  return (
    <div>
      <p className="text-muted" style={{ fontSize: 13 }}>
        {readyCount === 0
          ? 'No one is ready for a project yet — interns become ready after clearing weeks 1-3.'
          : `${readyCount} intern${readyCount === 1 ? '' : 's'} ready for a project.`}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="table table-sm align-middle mb-0" style={{ fontSize: 13.5 }}>
          <thead>
            <tr className="text-uppercase text-muted" style={{ fontSize: 11, letterSpacing: '.04em' }}>
              <th>Intern</th>
              <th>Weeks 1-3</th>
              <th>Sessions</th>
              <th>Project</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.application_id} style={r.ready_for_project ? { background: 'rgba(46,125,91,.06)' } : undefined}>
                <td>
                  <strong>{r.full_name || r.email || 'Intern'}</strong>
                  {r.ready_for_project && <span className="ms-2" style={badge('#2e7d5b')}>ready for a project</span>}
                </td>
                <td>
                  {r.weeks_done}/{r.weeks_total}
                  {r.training_ready && <span className="ms-1 text-muted">· done</span>}
                </td>
                <td>{r.sessions_attended}</td>
                <td>{r.has_project ? (r.project_name || 'assigned') : <span className="text-muted">none</span>}</td>
                <td className="text-end">
                  <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => onSelect(r.application_id)}>
                    {r.ready_for_project ? 'Assign a project' : 'Open'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InternshipProjectReadiness;
