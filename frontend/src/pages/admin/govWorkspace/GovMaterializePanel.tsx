import React, { useState } from 'react';
import { materializeGovBuildProject, type GovMaterializeResult, type GovAssignableBuilder } from '../../../services/factoryApi';

/**
 * GovMaterializePanel — the Build step's "create the monitored project" action. The operator picks the intern
 * the build is assigned to, and this turns the reviewed AI build plan into a REAL student project (owned by
 * that intern's enrollment) whose releases/stories are monitored like the Command Center.
 *
 * This is an explicit WRITE to the student-project tables. It is idempotent (re-running reuses the pursuit's
 * linked project), and it surfaces typed errors plainly (e.g. the chosen builder is not an enrolled intern).
 */
export function GovMaterializePanel({ canonical, deliveryProjectId, assignableBuilders, requirements, title, buyer, deadline }: {
  canonical: string;
  deliveryProjectId?: string | null;
  assignableBuilders: GovAssignableBuilder[];
  requirements: { id: string; text: string }[];
  title?: string | null;
  buyer?: string | null;
  deadline?: string | null;
}): React.ReactElement {
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<GovMaterializeResult | null>(null);

  if (!deliveryProjectId) {
    return <div className="small text-secondary"><i className="ri-information-line me-1" aria-hidden="true" />Approve the pursuit into a delivery project first — the monitored project is created against it.</div>;
  }

  const run = async (): Promise<void> => {
    if (!assignee) return;
    setBusy(true); setErr(null);
    let buildSpec: string | null = null;
    try { const raw = localStorage.getItem(`govBuildSpec:${canonical}`); if (raw) { const s = JSON.parse(raw); buildSpec = [s?.spec, s?.research].filter(Boolean).join('\n\n') || null; } } catch { /* ignore */ }
    try {
      const r = await materializeGovBuildProject(canonical, { deliveryProjectId, assigneeIdentityId: assignee, requirements, title: title ?? null, buyer: buyer ?? null, buildSpec, deadline: deadline ?? null });
      setResult(r);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Could not create the monitored project right now.');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-end">
        <label className="form-label small mb-0">Assign to intern
          <select className="form-select form-select-sm" style={{ maxWidth: 280 }} value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={busy}>
            <option value="">Choose an enrolled intern…</option>
            {assignableBuilders.map((b) => <option key={b.identityId} value={b.identityId}>{b.email ?? b.identityId}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !assignee || requirements.length === 0} onClick={() => { void run(); }}>
          <i className="ri-rocket-2-line me-1" aria-hidden="true" />{busy ? 'Creating the project…' : 'Create monitored project'}
        </button>
      </div>
      {assignableBuilders.length === 0 && <div className="small text-secondary mt-1">No assignable builders yet — add an intern to this delivery project first.</div>}
      {err && <div className="alert alert-warning py-2 mt-2 mb-0 small" role="status">{err}</div>}
      {result && (
        <div className="alert alert-success py-2 mt-2 mb-0 small" role="status">
          <i className="ri-check-double-line me-1" aria-hidden="true" />
          {result.created ? 'Monitored project created' : 'Updated the existing monitored project'} — {result.releaseCount} release{result.releaseCount === 1 ? '' : 's'}, {result.storyCount} stor{result.storyCount === 1 ? 'y' : 'ies'}, {result.tasks} task{result.tasks === 1 ? '' : 's'}.{' '}
          <a href="/admin/projects">Open it on the Project Delivery board</a> to monitor progress.
        </div>
      )}
      <div className="small text-secondary mt-2"><i className="ri-information-line me-1" aria-hidden="true" />Creates (or updates) a real project under the intern's profile, monitored like the Command Center. Safe to run again — it reuses the same project and never duplicates work.</div>
    </div>
  );
}
