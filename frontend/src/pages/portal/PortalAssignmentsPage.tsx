import React, { useEffect, useState, useRef } from 'react';
import portalApi from '../../utils/portalApi';

interface Submission {
  id: string;
  title: string;
  assignment_type: string;
  status: string;
  score?: number;
  submitted_at?: string;
  reviewed_at?: string;
  reviewer_notes?: string;
  file_name?: string;
  session?: { session_number: number; title: string };
}

function PortalAssignmentsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', assignment_type: 'evidence', content: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    portalApi.get('/api/portal/submissions')
      .then((res) => setSubmissions(res.data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await portalApi.post('/api/portal/submissions', {
        title: form.title,
        assignment_type: form.assignment_type,
        content_json: form.content ? { text: form.content } : undefined,
      });

      const file = fileRef.current?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await portalApi.post(`/api/portal/submissions/${res.data.id}/upload`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      setShowModal(false);
      setForm({ title: '', assignment_type: 'evidence', content: '' });
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: 'var(--color-primary)' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h4 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          <i className="bi bi-file-earmark-text me-2"></i>Assignments
        </h1>
        <button className="btn btn-primary btn-sm" style={{ background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }} onClick={() => setShowModal(true)}>
          <i className="bi bi-plus-lg me-1"></i>New Submission
        </button>
      </div>

      {submissions.length === 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center py-5">
            <i className="bi bi-inbox" style={{ fontSize: 48, color: 'var(--color-text-light)' }}></i>
            <p className="text-muted mt-2">No submissions yet. Click "New Submission" to get started.</p>
          </div>
        </div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="small">Title</th>
                    <th className="small">Type</th>
                    <th className="small">Session</th>
                    <th className="small">Status</th>
                    <th className="small">Score</th>
                    <th className="small">Submitted</th>
                    <th className="small">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub) => (
                    <tr key={sub.id}>
                      <td className="small fw-medium">{sub.title}</td>
                      <td className="small"><span className="badge bg-info">{sub.assignment_type.replace(/_/g, ' ')}</span></td>
                      <td className="small text-muted">{sub.session ? `#${sub.session.session_number}` : '--'}</td>
                      <td className="small">
                        <span className={`badge bg-${sub.status === 'reviewed' ? 'success' : sub.status === 'submitted' ? 'primary' : sub.status === 'flagged' ? 'warning' : 'secondary'}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="small">{sub.score != null ? `${sub.score}%` : '--'}</td>
                      <td className="small text-muted">{sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : '--'}</td>
                      <td className="small text-muted">{sub.reviewer_notes || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <>
          <div className="modal-backdrop show" style={{ opacity: 0.5 }}></div>
          <div className="modal show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title fw-semibold">New Submission</h5>
                  <button type="button" className="btn-close" onClick={() => setShowModal(false)} aria-label="Close"></button>
                </div>
                <form onSubmit={handleSubmit}>
                  <div className="modal-body">
                    {error && <div className="alert alert-danger small py-2">{error}</div>}
                    <div className="mb-3">
                      <label className="form-label small fw-medium">Title</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        required
                        placeholder="e.g., Week 3 Build Lab"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-medium">Assignment Type</label>
                      <select
                        className="form-select form-select-sm"
                        value={form.assignment_type}
                        onChange={(e) => setForm({ ...form, assignment_type: e.target.value })}
                      >
                        <option value="prework_intake">Prework Intake</option>
                        <option value="prework_upload">Prework Upload</option>
                        <option value="build_lab">Build Lab</option>
                        <option value="evidence">Evidence</option>
                        <option value="reflection">Reflection</option>
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-medium">Content (optional)</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={4}
                        value={form.content}
                        onChange={(e) => setForm({ ...form, content: e.target.value })}
                        placeholder="Enter your response or notes..."
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-medium">File Attachment (optional)</label>
                      <input type="file" className="form-control form-control-sm" ref={fileRef} />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={submitting || !form.title} style={{ background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}>
                      {submitting ? <><span className="spinner-border spinner-border-sm me-1"></span>Submitting...</> : 'Submit'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default PortalAssignmentsPage;
