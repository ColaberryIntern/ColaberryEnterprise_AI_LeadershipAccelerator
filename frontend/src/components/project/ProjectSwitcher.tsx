/**
 * ProjectSwitcher — multi-project picker for the portal Home.
 *
 * Lists the enrollment's projects, lets the user switch the active one, and
 * start a new project (which creates a fresh active project and drops the user
 * into the build chooser). Renders nothing if the account has no projects yet
 * (true first-run), so it stays out of the way until there's something to pick.
 */
import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';
import { clearRequirementsDraft } from '../../utils/requirementsDraft';

interface ProjectSummary {
  id: string;
  name: string;
  stage: string;
  capability_count: number;
  is_active: boolean;
}

export default function ProjectSwitcher() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    portalApi.get('/api/portal/projects')
      .then(r => setProjects(r.data?.projects || []))
      .catch(() => {});
  }, []);

  const active = projects.find(p => p.is_active) || projects[0];

  const switchTo = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await portalApi.put('/api/portal/projects/active', { project_id: id });
      // The draft is enrollment-scoped; clear it so the switched-to project's
      // first-run flow starts at the chooser instead of resuming the prior
      // project's draft.
      clearRequirementsDraft();
      window.location.href = '/portal/home';
    } catch { setBusy(false); }
  };

  const newProject = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await portalApi.post('/api/portal/projects', {});
      // A brand-new project must start fresh at the 3-tier chooser → idea →
      // questions, not resume the previous project's saved draft.
      clearRequirementsDraft();
      window.location.href = '/portal/home';
    } catch { setBusy(false); }
  };

  if (projects.length === 0) return null;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 12, borderRadius: 8 }} onClick={() => setOpen(o => !o)} disabled={busy}>
        <i className="bi bi-folder2 me-1"></i>{active?.name || 'Projects'}
        {projects.length > 1 && <span className="badge bg-secondary ms-1">{projects.length}</span>}
        <i className="bi bi-chevron-down ms-1"></i>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 30, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 6px 24px rgba(15,23,42,.12)', minWidth: 280, padding: 6 }}>
          <div className="text-muted px-2 py-1" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>Your projects</div>
          {projects.map(p => (
            <button key={p.id} className="btn btn-sm w-100 text-start" style={{ fontSize: 12, borderRadius: 6, background: p.is_active ? '#eff6ff' : 'transparent' }} onClick={() => !p.is_active && switchTo(p.id)} disabled={busy}>
              <div className="d-flex align-items-center gap-2">
                {p.is_active ? <i className="bi bi-check-circle-fill" style={{ color: '#3b82f6' }}></i> : <i className="bi bi-circle" style={{ color: '#cbd5e1' }}></i>}
                <span className="fw-semibold flex-grow-1">{p.name}</span>
                <span className="text-muted" style={{ fontSize: 10 }}>{p.capability_count > 0 ? `${p.capability_count} caps` : String(p.stage || '').replace(/_/g, ' ')}</span>
              </div>
            </button>
          ))}
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 4, paddingTop: 4 }}>
            <button className="btn btn-sm w-100 text-start" style={{ fontSize: 12, borderRadius: 6, color: '#3b82f6', fontWeight: 600 }} onClick={newProject} disabled={busy}>
              <i className="bi bi-plus-lg me-1"></i>New project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
