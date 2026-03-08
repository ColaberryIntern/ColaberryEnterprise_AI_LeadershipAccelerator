import React, { useEffect, useState, useCallback } from 'react';

interface SectionControlTabProps {
  token: string;
  cohortId: string;
  apiUrl: string;
}

interface SessionOption {
  id: string;
  session_number: number;
  title: string;
}

interface Section {
  id: string;
  session_id: string;
  section_order: number;
  concept_text: string;
  build_phase_flag: boolean;
  notebooklm_required: boolean;
  prompt_id: string | null;
  teaching_notes: string;
  facilitator_guidance: string;
}

const emptySectionForm = (): Partial<Section> => ({
  section_order: 1,
  concept_text: '',
  build_phase_flag: false,
  notebooklm_required: false,
  prompt_id: null,
  teaching_notes: '',
  facilitator_guidance: '',
});

const SectionControlTab: React.FC<SectionControlTabProps> = ({ token, cohortId, apiUrl }) => {
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<Partial<Section>>(emptySectionForm());
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

  const fetchSections = useCallback(async () => {
    if (!selectedSessionId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${apiUrl}/api/admin/orchestration/sessions/${selectedSessionId}/sections`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Failed to fetch sections: ${res.status}`);
      const data = await res.json();
      setSections(Array.isArray(data) ? data : data.sections || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId, token, apiUrl]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const openCreate = () => {
    setModalMode('create');
    setFormData({ ...emptySectionForm(), session_id: selectedSessionId });
    setShowModal(true);
  };

  const openEdit = (s: Section) => {
    setModalMode('edit');
    setFormData({ ...s });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData(emptySectionForm());
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isEdit = modalMode === 'edit' && formData.id;
      const url = isEdit
        ? `${apiUrl}/api/admin/orchestration/sections/${formData.id}`
        : `${apiUrl}/api/admin/orchestration/sessions/${selectedSessionId}/sections`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      closeModal();
      await fetchSections();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this section?')) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/sections/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      await fetchSections();
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
            + Add Section
          </button>
        )}
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading sections...</span>
          </div>
        </div>
      )}

      {!loading && selectedSessionId && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">
            Sections ({sections.length})
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
              <thead className="table-light">
                <tr>
                  <th style={{ fontSize: 12 }}>Order</th>
                  <th style={{ fontSize: 12 }}>Concept Text</th>
                  <th style={{ fontSize: 12 }}>Build Phase</th>
                  <th style={{ fontSize: 12 }}>NotebookLM</th>
                  <th style={{ fontSize: 12 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.id}>
                    <td>{s.section_order}</td>
                    <td style={{ maxWidth: 300 }}>
                      {s.concept_text?.length > 80
                        ? s.concept_text.substring(0, 80) + '...'
                        : s.concept_text}
                    </td>
                    <td>
                      {s.build_phase_flag ? (
                        <span className="badge bg-success" style={{ fontSize: 11 }}>Yes</span>
                      ) : (
                        <span className="badge bg-secondary" style={{ fontSize: 11 }}>No</span>
                      )}
                    </td>
                    <td>
                      {s.notebooklm_required ? (
                        <span className="badge bg-warning" style={{ fontSize: 11 }}>Required</span>
                      ) : (
                        <span className="badge bg-secondary" style={{ fontSize: 11 }}>No</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-secondary me-1"
                        onClick={() => openEdit(s)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDelete(s.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {sections.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">
                      No sections configured for this session.
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
            aria-label={modalMode === 'create' ? 'Create Section' : 'Edit Section'}
          >
            <div className="modal-dialog modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h6 className="modal-title fw-semibold">
                    {modalMode === 'create' ? 'Create Section' : 'Edit Section'}
                  </h6>
                  <button type="button" className="btn-close" onClick={closeModal}></button>
                </div>
                <div className="modal-body" style={{ fontSize: 13 }}>
                  <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Section Order
                      </label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={formData.section_order || 1}
                        onChange={(e) => updateField('section_order', parseInt(e.target.value, 10))}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Build Phase Flag
                      </label>
                      <div>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={formData.build_phase_flag || false}
                          onChange={(e) => updateField('build_phase_flag', e.target.checked)}
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        NotebookLM Required
                      </label>
                      <div>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={formData.notebooklm_required || false}
                          onChange={(e) => updateField('notebooklm_required', e.target.checked)}
                        />
                      </div>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Concept Text
                      </label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={4}
                        value={formData.concept_text || ''}
                        onChange={(e) => updateField('concept_text', e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Prompt ID
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={formData.prompt_id || ''}
                        onChange={(e) => updateField('prompt_id', e.target.value)}
                        placeholder="Prompt template ID"
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Teaching Notes
                      </label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={3}
                        value={formData.teaching_notes || ''}
                        onChange={(e) => updateField('teaching_notes', e.target.value)}
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Facilitator Guidance
                      </label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={3}
                        value={formData.facilitator_guidance || ''}
                        onChange={(e) => updateField('facilitator_guidance', e.target.value)}
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

export default SectionControlTab;
