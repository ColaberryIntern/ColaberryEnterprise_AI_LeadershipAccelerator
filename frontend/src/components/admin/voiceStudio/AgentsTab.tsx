import React, { useCallback, useEffect, useState } from 'react';
import { EmptyState, SectionCard, StatusBadge } from '../shell';
import {
  changeStatus, listAgents, listVersions, statusOf, studioErrorMessage, type AgentCard, type AgentVersion, type LifecycleAction,
} from '../../../services/voiceStudioApi';
import { ENGINE_LABEL } from './voiceStudioFormat';
import VersionEditor from './VersionEditor';

/**
 * Agents (VS3.3). A card per phone agent; selecting one lists its versions (newest first) with the
 * lifecycle actions each status allows: a draft can be approved (by someone other than its author),
 * an approved version published, a published version retired. A 403 means the signed-in admin does
 * not hold an approver role; the server enforces that, this page only explains it.
 */
const ACTIONS: Record<AgentVersion['status'], Array<{ action: LifecycleAction; label: string; style: string }>> = {
  draft: [{ action: 'approve', label: 'Approve', style: 'btn-outline-success' }, { action: 'retire', label: 'Discard', style: 'btn-outline-secondary' }],
  approved: [{ action: 'publish', label: 'Publish', style: 'btn-success' }, { action: 'retire', label: 'Discard', style: 'btn-outline-secondary' }],
  published: [{ action: 'retire', label: 'Retire', style: 'btn-outline-danger' }],
  retired: [],
};

const STATUS_TONE: Record<AgentVersion['status'], 'neutral' | 'info' | 'success' | 'warning'> = { draft: 'neutral', approved: 'info', published: 'success', retired: 'warning' };

export default function AgentsTab(): React.ReactElement {
  const [agents, setAgents] = useState<AgentCard[] | null>(null);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [editFrom, setEditFrom] = useState<AgentVersion | null>(null);
  const [actionMsg, setActionMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadAgents = useCallback(() => {
    listAgents()
      .then((a) => { setAgents(a); setOff(false); if (a.length && !selected) setSelected(a[0].profile.id); })
      .catch((e) => { if (statusOf(e) === 404) setOff(true); else setError(studioErrorMessage(e, 'Agents could not be loaded. Try again.')); });
  }, [selected]);

  const loadVersions = useCallback((profileId: string) => {
    listVersions(profileId).then(setVersions).catch((e) => setError(studioErrorMessage(e, 'Versions could not be loaded. Try again.')));
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);
  useEffect(() => { if (selected) { setEditFrom(null); loadVersions(selected); } }, [selected, loadVersions]);

  const act = async (v: AgentVersion, action: LifecycleAction) => {
    setBusy(v.id);
    setActionMsg(null);
    try {
      await changeStatus(v.id, action);
      setActionMsg({ tone: 'success', text: `Version ${v.version}: ${action === 'approve' ? 'approved' : action === 'publish' ? 'published. New calls use it.' : 'retired'}.` });
      if (selected) loadVersions(selected);
      loadAgents();
    } catch (e) {
      setActionMsg({ tone: 'danger', text: studioErrorMessage(e, `Version ${v.version} could not be changed. Try again.`) });
    } finally {
      setBusy(null);
    }
  };

  if (off) return <EmptyState icon="toggle-line" title="Voice Studio is switched off on this server" description="An administrator turns it on with VOICE_STUDIO_UI_ENABLED. Calls are not affected either way." />;
  if (error && !agents) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!agents) return <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading</span></div></div>;
  if (agents.length === 0) return <EmptyState icon="robot-2-line" title="No phone agents yet" description="The first agent is seeded from the live Synthflow assistant with voice:profiles:seed-cory, as a draft." />;

  const card = agents.find((a) => a.profile.id === selected) ?? null;
  const active = versions.find((v) => v.status === 'published') ?? null;

  return (
    <div className="row g-3">
      <div className="col-lg-4">
        <div className="d-grid gap-2" role="list" aria-label="Phone agents">
          {agents.map((a) => (
            <button key={a.profile.id} type="button" role="listitem" aria-current={a.profile.id === selected}
              className={`card border-0 shadow-sm text-start p-3 ${a.profile.id === selected ? 'border border-primary' : ''}`} onClick={() => setSelected(a.profile.id)}>
              <div className="d-flex justify-content-between align-items-start gap-2">
                <span className="fw-semibold">{a.profile.name}</span>
                <StatusBadge label={a.active ? `v${a.active.version} live` : 'Not published'} tone={a.active ? 'success' : 'neutral'} />
              </div>
              <div className="small text-muted mt-1">{a.profile.brand_slug}, {a.profile.direction}{a.active ? `, ${ENGINE_LABEL[a.active.engine] ?? a.active.engine}` : ''}</div>
              <div className="small text-muted">{a.versions.total} version{a.versions.total === 1 ? '' : 's'}, {a.versions.drafts} draft, {a.versions.approved} approved</div>
            </button>
          ))}
        </div>
      </div>
      <div className="col-lg-8">
        {card && (
          <SectionCard title={`${card.profile.name}: versions`} icon="git-commit-line">
            <div role="status" aria-live="polite">{actionMsg && <div className={`alert alert-${actionMsg.tone} small`} data-testid="action-msg">{actionMsg.text}</div>}</div>
            {versions.length === 0 ? <p className="text-muted small mb-0">No versions yet.</p> : (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead className="table-light"><tr><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Author</th><th scope="col">Approved by</th><th scope="col" className="text-end">Actions</th></tr></thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id}>
                        <td>v{v.version} <code className="small text-muted">{v.content_hash.slice(0, 8)}</code></td>
                        <td><StatusBadge label={v.status} tone={STATUS_TONE[v.status]} /></td>
                        <td className="small">{v.author}</td>
                        <td className="small">{v.approved_by ?? '-'}</td>
                        <td className="text-end">
                          <div className="d-inline-flex flex-wrap gap-1 justify-content-end">
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setEditFrom(v)}>Edit a copy</button>
                            {ACTIONS[v.status].map((a) => (
                              <button key={a.action} type="button" className={`btn btn-sm ${a.style}`} disabled={busy === v.id} onClick={() => { void act(v, a.action); }}>{a.label}</button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}
        {card && editFrom && (
          <div className="mt-3">
            <VersionEditor key={editFrom.id} profileId={card.profile.id} base={editFrom} active={active} onSaved={() => { loadVersions(card.profile.id); loadAgents(); }} />
          </div>
        )}
      </div>
    </div>
  );
}
