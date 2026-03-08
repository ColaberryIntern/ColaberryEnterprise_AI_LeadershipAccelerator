import React, { useEffect, useState, useCallback } from 'react';

interface ArtifactControlTabProps {
  token: string;
  cohortId: string;
  apiUrl: string;
}

interface SessionOption {
  id: string;
  session_number: number;
  title: string;
}

interface ArtifactDefinition {
  id: string;
  session_id: string;
  name: string;
  description: string;
  artifact_type: string;
  required_for_session: boolean;
  required_for_build: boolean;
  required_for_presentation: boolean;
  produces_variable_keys: string[];
  evaluation_criteria: string;
}

const ARTIFACT_TYPES = [
  'document',
  'spreadsheet',
  'presentation',
  'code',
  'diagram',
  'report',
  'plan',
];

const emptyArtifactForm = (): Partial<ArtifactDefinition> => ({
  name: '',
  description: '',
  artifact_type: 'document',
  required_for_session: false,
  required_for_build: false,
  required_for_presentation: false,
  produces_variable_keys: [],
  evaluation_criteria: '',
});

const ArtifactControlTab: React.FC<ArtifactControlTabProps> = ({ token, cohortId, apiUrl }) => {
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [artifacts, setArtifacts] = useState<ArtifactDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<Partial<ArtifactDefinition>>(emptyArtifactForm());
  const [variableKeysInput, setVariableKeysInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/admin/accelerator/cohorts/${cohortId}/sessions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : data.sessions || []);
      } catch (err: any) {
        setError(err.message);
      }
    };
    if (cohortId) fetchSessions();
  }, [token, cohortId, apiUrl]);

  const fetchArtifacts = useCallback(async () => {
    if (!selectedSessionId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${apiUrl}/api/admin/orchestration/sessions/${selectedSessionId}/artifacts`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Failed to fetch artifacts: ${res.status}`);
      const data = await res.json();
      setArtifacts(Array.isArray(data) ? data : data.artifacts || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId, token, apiUrl]);

  useEffect(() => {
    fetchArtifacts();
  }, [fetchArtifacts]);

  const openCreate = () => {
    setModalMode('create');
    setFormData({ ...emptyArtifactForm(), session_id: selectedSessionId });
    setVariableKeysInput('');
    setShowModal(true);
  };

  const openEdit = (a: ArtifactDefinition) => {
    setModalMode('edit');
    setFormData({ ...a });
    setVariableKeysInput((a.produces_variable_keys || []).join(', '));
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData(emptyArtifactForm());
    setVariableKeysInput('');
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...formData,
      produces_variable_keys: variableKeysInput
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    };
    try {
      const isEdit = modalMode === 'edit' && formData.id;
      const url = isEdit
        ? `${apiUrl}/api/admin/orchestration/artifacts/${formData.id}`
        : `${apiUrl}/api/admin/orchestration/sessions/${selectedSessionId}/artifacts`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      closeModal();
      await fetchArtifacts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this artifact definition?')) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/artifacts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      await fetchArtifacts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  return (
    <div>
      {error && <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>}

      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <label className="small fw-medium" style={{ fontSize: 12 }}>Session:</label>
        <select
          className="form-select form-select-sm"
          style={{ width: 300, fontSize: 13 }}
          value={selectedSessionId}
          onChange={(e) => setSelectedSessionId(e.target.value)}
        >
          <option value="">Select a session...</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              Session {s.session_number}: {s.title}
            </option>
          ))}
        </select>
        {selectedSessionId && (
          <button className="btn btn-sm btn-primary" onClick={openCreate}>
            + Add Artifact
          </button>
        )}
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading artifacts...</span>
          </div>
        </div>
      )}

      {!loading && selectedSessionId && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">
            Artifact Definitions ({artifacts.length})
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
              <thead className="table-light">
                <tr>
                  <th style={{ fontSize: 12 }}>Name</th>
                  <th style={{ fontSize: 12 }}>Type</th>
                  <th style={{ fontSize: 12 }}>Required</th>
                  <th style={{ fontSize: 12 }}>Evaluation Criteria</th>
                  <th style={{ fontSize: 12 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map((a) => (
                  <tr key={a.id}>
                    <td className="fw-medium">{a.name}</td>
                    <td>
                      <span className="badge bg-info" style={{ fontSize: 11 }}>{a.artifact_type}</span>
                    </td>
                    <td>
                      <div className="d-flex gap-1 flex-wrap">
                        {a.required_for_session && (
                          <span className="badge bg-success" style={{ fontSize: 10 }}>Session</span>
                        )}
                        {a.required_for_build && (
                          <span className="badge bg-warning" style={{ fontSize: 10 }}>Build</span>
                        )}
                        {a.required_for_presentation && (
                          <span className="badge bg-danger" style={{ fontSize: 10 }}>Presentation</span>
                        )}
                        {!a.required_for_session && !a.required_for_build && !a.required_for_presentation && (
                          <span className="badge bg-secondary" style={{ fontSize: 10 }}>Optional</span>
                        )}
                      </div>
                    </td>
                    <td style={{ maxWidth: 200, fontSize: 12 }}>
                      {a.evaluation_criteria?.length > 60
                        ? a.evaluation_criteria.substring(0, 60) + '...'
                        : a.evaluation_criteria || '-'}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-secondary me-1"
                        onClick={() => openEdit(a)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDelete(a.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {artifacts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">
                      No artifact definitions for this session.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div
            className="modal show d-block"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={modalMode === 'create' ? 'Create Artifact' : 'Edit Artifact'}
          >
            <div className="modal-dialog modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h6 className="modal-title fw-semibold">
                    {modalMode === 'create' ? 'Create Artifact Definition' : 'Edit Artifact Definition'}
                  </h6>
                  <button type="button" className="btn-close" onClick={closeModal}></button>
                </div>
                <div className="modal-body" style={{ fontSize: 13 }}>
                  <div className="row g-3">
                    <div className="col-md-8">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Name
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={formData.name || ''}
                        onChange={(e) => updateField('name', e.target.value)}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Artifact Type
                      </label>
                      <select
                        className="form-select form-select-sm"
                        value={formData.artifact_type || 'document'}
                        onChange={(e) => updateField('artifact_type', e.target.value)}
                      >
                        {ARTIFACT_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Description
                      </label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={3}
                        value={formData.description || ''}
                        onChange={(e) => updateField('description', e.target.value)}
                      />
                    </div>
                    <div className="col-md-4">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="req-session"
                          checked={formData.required_for_session || false}
                          onChange={(e) => updateField('required_for_session', e.target.checked)}
                        />
                        <label className="form-check-label small" htmlFor="req-session" style={{ fontSize: 12 }}>
                          Required for Session
                        </label>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="req-build"
                          checked={formData.required_for_build || false}
                          onChange={(e) => updateField('required_for_build', e.target.checked)}
                        />
                        <label className="form-check-label small" htmlFor="req-build" style={{ fontSize: 12 }}>
                          Required for Build
                        </label>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="req-pres"
                          checked={formData.required_for_presentation || false}
                          onChange={(e) => updateField('required_for_presentation', e.target.checked)}
                        />
                        <label className="form-check-label small" htmlFor="req-pres" style={{ fontSize: 12 }}>
                          Required for Presentation
                        </label>
                      </div>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Produces Variable Keys (comma-separated)
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={variableKeysInput}
                        onChange={(e) => setVariableKeysInput(e.target.value)}
                        placeholder="e.g. strategy_doc_url, strategy_score"
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Evaluation Criteria
                      </label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={4}
                        value={formData.evaluation_criteria || ''}
                        onChange={(e) => updateField('evaluation_criteria', e.target.value)}
                        placeholder="Describe how this artifact should be evaluated..."
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-sm btn-outline-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : modalMode === 'create' ? 'Create' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ArtifactControlTab;
