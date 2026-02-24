import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../utils/api';

interface LeadDetail {
  id: number;
  name: string;
  email: string;
  company: string;
  role: string;
  phone: string;
  status: string;
  interest_area: string;
  interest_level: string;
  notes: string;
  source: string;
  form_type: string;
  message: string;
  consent_contact: boolean;
  assigned_admin: string;
  assignedAdmin?: { id: string; email: string };
  created_at: string;
  updated_at: string;
}

interface AutomationEntry {
  id: string;
  type: string;
  status: string;
  provider_response: string;
  created_at: string;
}

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'enrolled', 'lost'];

function AdminLeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [automationHistory, setAutomationHistory] = useState<AutomationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    fetchLead();
  }, [id]); // eslint-disable-line

  const fetchLead = async () => {
    try {
      const res = await api.get(`/api/admin/leads/${id}`);
      setLead(res.data.lead);
      setAutomationHistory(res.data.automationHistory || []);
      setNotes(res.data.lead.notes || '');
      setStatus(res.data.lead.status || 'new');
    } catch (err) {
      console.error('Failed to fetch lead:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      await api.patch(`/api/admin/leads/${id}`, { status, notes });
      setSaveMessage('Saved successfully');
      fetchLead();
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error('Failed to update lead:', err);
      setSaveMessage('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-5">
        <p className="text-muted">Lead not found</p>
        <Link to="/admin/leads" className="btn btn-primary">Back to Leads</Link>
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <Link to="/admin/leads" className="text-decoration-none small">&larr; Back to Leads</Link>
          <h1 className="h3 fw-bold mt-1 mb-0" style={{ color: 'var(--color-primary)' }}>
            {lead.name}
          </h1>
        </div>
      </div>

      <div className="row g-4">
        {/* Left: Lead Info + Notes */}
        <div className="col-lg-8">
          {/* Contact Info */}
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-bold py-3">Contact Information</div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <div className="text-muted small">Email</div>
                  <div>{lead.email}</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted small">Phone</div>
                  <div>{lead.phone || '-'}</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted small">Company</div>
                  <div>{lead.company || '-'}</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted small">Role</div>
                  <div>{lead.role || '-'}</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted small">Interest Area</div>
                  <div>{lead.interest_area || '-'}</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted small">Source / Form</div>
                  <div>{lead.source} / {lead.form_type}</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted small">Contact Consent</div>
                  <div>{lead.consent_contact ? 'Yes' : 'No'}</div>
                </div>
                <div className="col-md-6">
                  <div className="text-muted small">Created</div>
                  <div>{formatDate(lead.created_at)}</div>
                </div>
                {lead.message && (
                  <div className="col-12">
                    <div className="text-muted small">Message</div>
                    <div className="bg-light p-3 rounded">{lead.message}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status + Notes */}
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-bold py-3">Status &amp; Notes</div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label small text-muted">Status</label>
                <select
                  className="form-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label small text-muted">Notes</label>
                <textarea
                  className="form-control"
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this lead..."
                />
              </div>
              <div className="d-flex align-items-center gap-3">
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                {saveMessage && (
                  <span className={`small ${saveMessage.includes('success') ? 'text-success' : 'text-danger'}`}>
                    {saveMessage}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Automation History */}
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-bold py-3">Automation History</div>
            <div className="card-body">
              {automationHistory.length === 0 ? (
                <p className="text-muted small mb-0">No automation events yet</p>
              ) : (
                <div className="timeline">
                  {automationHistory.map((entry) => (
                    <div key={entry.id} className="mb-3 pb-3 border-bottom">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <span className={`badge ${entry.type === 'email' ? 'bg-info' : 'bg-warning text-dark'} me-2`}>
                            {entry.type === 'email' ? 'Email' : 'Voice Call'}
                          </span>
                          <span className={`badge ${entry.status === 'success' ? 'bg-success' : 'bg-danger'}`}>
                            {entry.status}
                          </span>
                        </div>
                      </div>
                      <div className="text-muted small mt-1">
                        {formatDate(entry.created_at)}
                      </div>
                      {entry.provider_response && (
                        <details className="mt-1">
                          <summary className="text-muted small" style={{ cursor: 'pointer' }}>Response</summary>
                          <pre className="bg-light p-2 rounded small mt-1 mb-0" style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
                            {entry.provider_response}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminLeadDetailPage;
