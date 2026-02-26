import React, { useState } from 'react';
import api from '../../utils/api';
import Modal from '../ui/Modal';

interface QuickAddLeadModalProps {
  onClose: () => void;
  onLeadCreated: () => void;
}

function QuickAddLeadModal({ onClose, onLeadCreated }: QuickAddLeadModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('admin_manual');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setSaving(true);
    setError('');
    try {
      await api.post('/api/admin/leads', { name, email, company, title, phone, source, notes });
      onLeadCreated();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create lead';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      show={true}
      onClose={onClose}
      title="Add Lead"
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            form="quick-add-lead-form"
            className="btn btn-primary"
            disabled={saving || !name.trim() || !email.trim()}
          >
            {saving ? 'Creating...' : 'Create Lead'}
          </button>
        </>
      }
    >
      <form id="quick-add-lead-form" onSubmit={handleSubmit}>
        {error && <div className="alert alert-danger small py-2">{error}</div>}
        <div className="row g-3">
          <div className="col-md-6">
            <label htmlFor="ql-name" className="form-label small">Name *</label>
            <input
              id="ql-name"
              type="text"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="col-md-6">
            <label htmlFor="ql-email" className="form-label small">Email *</label>
            <input
              id="ql-email"
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="col-md-6">
            <label htmlFor="ql-company" className="form-label small">Company</label>
            <input
              id="ql-company"
              type="text"
              className="form-control"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div className="col-md-6">
            <label htmlFor="ql-title" className="form-label small">Title</label>
            <input
              id="ql-title"
              type="text"
              className="form-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="col-md-6">
            <label htmlFor="ql-phone" className="form-label small">Phone</label>
            <input
              id="ql-phone"
              type="text"
              className="form-control"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="col-md-6">
            <label htmlFor="ql-source" className="form-label small">Source</label>
            <select
              id="ql-source"
              className="form-select"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="admin_manual">Manual Entry</option>
              <option value="referral">Referral</option>
              <option value="event">Event</option>
              <option value="linkedin">LinkedIn</option>
              <option value="cold_outreach">Cold Outreach</option>
            </select>
          </div>
          <div className="col-12">
            <label htmlFor="ql-notes" className="form-label small">Notes</label>
            <textarea
              id="ql-notes"
              className="form-control"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any initial notes about this lead..."
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default QuickAddLeadModal;
