import React, { useEffect, useState, useCallback } from 'react';
import { SectionCard } from './shell';
import {
  getAgentRoleCharter,
  saveAgentRoleCharter,
  AgentRoleCharter,
  AgentRoleCharterInput,
} from '../../services/agentRoleCharterApi';

// AI Workforce Management, Checkpoint B — the Charter tab. Gated by the same
// requireAgentManagerOrAdmin check as the page itself (both GET
// /api/admin/agents/:id and GET/PUT .../charter use the identical guard on
// the identical agent id), so anyone who reached this page already has
// charter read+write access — no separate permission UI needed here.

interface Props {
  agentId: string;
  agentName: string;
}

const emptyDraft: AgentRoleCharterInput = { roleTitle: '', mission: '', responsibilities: [''], kpis: [''] };

function toDraft(charter: AgentRoleCharter): AgentRoleCharterInput {
  return {
    roleTitle: charter.roleTitle,
    mission: charter.mission,
    responsibilities: charter.responsibilities.length ? charter.responsibilities : [''],
    kpis: charter.kpis.length ? charter.kpis : [''],
  };
}

export default function AgentCharterTab({ agentId, agentName }: Props) {
  const [charter, setCharter] = useState<AgentRoleCharter | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AgentRoleCharterInput>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchCharter = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const view = await getAgentRoleCharter(agentId);
      setCharter(view.charter);
    } catch (err: any) {
      setLoadError(err?.response?.data?.error || 'Failed to load role charter.');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchCharter();
  }, [fetchCharter]);

  const startEditing = () => {
    setDraft(charter ? toDraft(charter) : emptyDraft);
    setSaveError(null);
    setEditing(true);
  };

  const handleListChange = (field: 'responsibilities' | 'kpis', index: number, value: string) => {
    setDraft((d) => ({ ...d, [field]: d[field].map((item, i) => (i === index ? value : item)) }));
  };

  const addListItem = (field: 'responsibilities' | 'kpis') => {
    setDraft((d) => ({ ...d, [field]: [...d[field], ''] }));
  };

  const removeListItem = (field: 'responsibilities' | 'kpis', index: number) => {
    setDraft((d) => ({ ...d, [field]: d[field].filter((_, i) => i !== index) }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const cleaned: AgentRoleCharterInput = {
        roleTitle: draft.roleTitle.trim(),
        mission: draft.mission.trim(),
        responsibilities: draft.responsibilities.map((r) => r.trim()).filter(Boolean),
        kpis: draft.kpis.map((k) => k.trim()).filter(Boolean),
      };
      const view = await saveAgentRoleCharter(agentId, cleaned);
      setCharter(view.charter);
      setEditing(false);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save role charter.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return <div className="alert alert-danger">{loadError}</div>;
  }

  if (editing) {
    return (
      <SectionCard
        title="Role charter"
        icon="briefcase-4-line"
        subtitle={`What ${agentName} is for — separate from its system prompt, this is the business-facing job description a manager reads and edits.`}
      >
        {saveError && <div className="alert alert-danger py-2">{saveError}</div>}
        <div className="mb-3">
          <label className="form-label small fw-semibold">Role title</label>
          <input
            type="text"
            className="form-control form-control-sm"
            value={draft.roleTitle}
            onChange={(e) => setDraft((d) => ({ ...d, roleTitle: e.target.value }))}
            placeholder="e.g. Student Retention & Outreach Specialist"
            maxLength={255}
          />
        </div>
        <div className="mb-3">
          <label className="form-label small fw-semibold">Mission</label>
          <textarea
            className="form-control form-control-sm"
            rows={3}
            value={draft.mission}
            onChange={(e) => setDraft((d) => ({ ...d, mission: e.target.value }))}
            placeholder="One or two sentences: what is this agent trying to accomplish?"
            maxLength={2000}
          />
        </div>
        <ListEditor
          label="Responsibilities"
          items={draft.responsibilities}
          onChange={(i, v) => handleListChange('responsibilities', i, v)}
          onAdd={() => addListItem('responsibilities')}
          onRemove={(i) => removeListItem('responsibilities', i)}
          placeholder="e.g. Recover students showing dropout-risk signals"
        />
        <ListEditor
          label="KPIs"
          items={draft.kpis}
          onChange={(i, v) => handleListChange('kpis', i, v)}
          onAdd={() => addListItem('kpis')}
          onRemove={(i) => removeListItem('kpis', i)}
          placeholder="e.g. Reply rate"
        />
        <div className="d-flex gap-2 mt-4">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || !draft.roleTitle.trim() || !draft.mission.trim()}
          >
            {saving ? 'Saving…' : 'Save charter'}
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
        </div>
      </SectionCard>
    );
  }

  if (!charter) {
    return (
      <SectionCard title="Role charter" icon="briefcase-4-line">
        <div className="text-center py-4">
          <p className="text-muted mb-3">
            <i className="ri-file-list-3-line" aria-hidden="true" /> No role charter has been written for{' '}
            {agentName} yet.
          </p>
          <button className="btn btn-primary btn-sm" onClick={startEditing}>
            <i className="ri-add-line" aria-hidden="true" /> Write a charter
          </button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Role charter"
      icon="briefcase-4-line"
      subtitle={`What ${agentName} is for — separate from its system prompt.`}
      actions={
        <button className="btn btn-outline-primary btn-sm" onClick={startEditing}>
          <i className="ri-edit-line" aria-hidden="true" /> Edit
        </button>
      }
    >
      <h6 className="mb-2">{charter.roleTitle}</h6>
      <p className="mb-3">{charter.mission}</p>
      {charter.responsibilities.length > 0 && (
        <div className="mb-3">
          <h6 className="text-uppercase text-muted small mb-2">Responsibilities</h6>
          <ul className="mb-0">
            {charter.responsibilities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {charter.kpis.length > 0 && (
        <div className="mb-3">
          <h6 className="text-uppercase text-muted small mb-2">KPIs</h6>
          <div className="d-flex flex-wrap gap-2">
            {charter.kpis.map((k, i) => (
              <span key={i} className="badge bg-secondary-subtle text-secondary-emphasis">{k}</span>
            ))}
          </div>
        </div>
      )}
      <p className="text-muted small mb-0">
        Last updated by {charter.updatedByEmail} on {new Date(charter.updatedAt).toLocaleDateString()}
      </p>
    </SectionCard>
  );
}

interface ListEditorProps {
  label: string;
  items: string[];
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  placeholder: string;
}

function ListEditor({ label, items, onChange, onAdd, onRemove, placeholder }: ListEditorProps) {
  return (
    <div className="mb-3">
      <label className="form-label small fw-semibold">{label}</label>
      {items.map((item, i) => (
        <div className="d-flex gap-2 mb-2" key={i}>
          <input
            type="text"
            className="form-control form-control-sm"
            value={item}
            onChange={(e) => onChange(i, e.target.value)}
            placeholder={placeholder}
            maxLength={500}
          />
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => onRemove(i)}
            disabled={items.length === 1}
            aria-label={`Remove ${label.toLowerCase()} item ${i + 1}`}
          >
            <i className="ri-close-line" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onAdd} disabled={items.length >= 20}>
        <i className="ri-add-line" aria-hidden="true" /> Add {label.toLowerCase().replace(/s$/, '')}
      </button>
    </div>
  );
}
