import React, { useState } from 'react';
import alumniApi from '../../utils/alumniApi';

interface AddReferralModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const initialForm = {
  company_name: '',
  contact_name: '',
  contact_email: '',
  job_title: '',
  referral_type: 'introduced' as 'corporate_sponsor' | 'introduced' | 'anonymous',
};

function AddReferralModal({ show, onClose, onSuccess }: AddReferralModalProps) {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<typeof initialForm | null>(null);

  if (!show) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name || !form.contact_name || !form.contact_email) {
      setError('Company name, contact name, and email are required.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await alumniApi.post('/api/referrals/submit', form);
      onSuccess();
      // For introduced / corporate_sponsor, show success screen with download
      if (form.referral_type === 'introduced' || form.referral_type === 'corporate_sponsor') {
        setSubmitted({ ...form });
      } else {
        setForm(initialForm);
        onClose();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit referral. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadKit = () => {
    const a = document.createElement('a');
    a.href = '/assets/The_AI_Execution_Engine.pdf';
    a.download = 'AI_Leadership_Accelerator_Kit.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleClose = () => {
    setSubmitted(null);
    setForm(initialForm);
    onClose();
  };

  // Success screen with download prompt
  if (submitted) {
    const typeLabel = submitted.referral_type === 'corporate_sponsor' ? 'Corporate Sponsor' : 'Introduced Referral';
    return (
      <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content border-0 shadow">
            <div className="modal-header bg-white border-bottom">
              <h5 className="modal-title fw-semibold" style={{ color: 'var(--color-accent)' }}>Referral Submitted</h5>
              <button type="button" className="btn-close" onClick={handleClose} aria-label="Close" />
            </div>
            <div className="modal-body text-center py-4">
              <div className="mb-3" style={{ fontSize: '2.5rem' }}>&#10003;</div>
              <h6 className="fw-semibold mb-2">
                {submitted.contact_name} at {submitted.company_name}
              </h6>
              <p className="text-muted small mb-4">
                {typeLabel} referral submitted successfully.
              </p>
              <div className="card border-0 shadow-sm mx-auto" style={{ maxWidth: 380, backgroundColor: '#f7fafc' }}>
                <div className="card-body py-3">
                  <p className="small fw-medium mb-2" style={{ color: 'var(--color-primary)' }}>
                    Download your presentation kit
                  </p>
                  <p className="text-muted small mb-3">
                    A personalized one-pager you can share with {submitted.contact_name} to introduce the program.
                  </p>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleDownloadKit}
                  >
                    Download Kit
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer bg-white border-top">
              <button className="btn btn-sm btn-outline-secondary" onClick={handleClose}>
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const REFERRAL_TYPES = [
    { value: 'corporate_sponsor', label: 'Corporate Sponsor', desc: 'Introduce your company to the program' },
    { value: 'introduced', label: 'Introduced Referral', desc: 'We reach out mentioning your name' },
    { value: 'anonymous', label: 'Anonymous', desc: 'Lead enters standard outreach — no mention of you' },
  ];

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow">
          <div className="modal-header bg-white border-bottom">
            <h5 className="modal-title fw-semibold" style={{ color: 'var(--color-primary)' }}>Add Referral</h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="alert alert-danger py-2 small">{error}</div>}

              <div className="mb-3">
                <label className="form-label small fw-medium">Company Name *</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  name="company_name"
                  value={form.company_name}
                  onChange={handleChange}
                  placeholder="Acme Corp"
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label small fw-medium">Contact Name *</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  name="contact_name"
                  value={form.contact_name}
                  onChange={handleChange}
                  placeholder="Sarah Johnson"
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label small fw-medium">Contact Email *</label>
                <input
                  type="email"
                  className="form-control form-control-sm"
                  name="contact_email"
                  value={form.contact_email}
                  onChange={handleChange}
                  placeholder="sarah@acme.com"
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label small fw-medium">Job Title</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  name="job_title"
                  value={form.job_title}
                  onChange={handleChange}
                  placeholder="VP of Engineering"
                />
              </div>

              <div className="mb-3">
                <label className="form-label small fw-medium">Referral Type *</label>
                {REFERRAL_TYPES.map((t) => (
                  <div key={t.value} className="form-check mb-2">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="referral_type"
                      id={`ref-type-${t.value}`}
                      value={t.value}
                      checked={form.referral_type === t.value}
                      onChange={handleChange}
                    />
                    <label className="form-check-label small" htmlFor={`ref-type-${t.value}`}>
                      <strong>{t.label}</strong>
                      <span className="text-muted ms-1">— {t.desc}</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer bg-white border-top">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-sm btn-primary" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Referral'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AddReferralModal;
