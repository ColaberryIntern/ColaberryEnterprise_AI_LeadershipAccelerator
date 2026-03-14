import React, { useState } from 'react';
import alumniApi from '../../utils/alumniApi';

interface AddReferralModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
  alumniName?: string;
}

const initialForm = {
  company_name: '',
  contact_name: '',
  contact_email: '',
  job_title: '',
  referral_type: 'introduced' as 'corporate_sponsor' | 'introduced' | 'anonymous',
};

function AddReferralModal({ show, onClose, onSuccess, alumniName }: AddReferralModalProps) {
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
    if (!submitted) return;
    // Import the generator from the parent — it's defined on the page level.
    // We inline the same HTML generation here to keep the component self-contained.
    const name = alumniName || 'A Colaberry Graduate';
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Enterprise AI Leadership Accelerator</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;color:#2d3748;padding:48px;max-width:800px;margin:0 auto}
.header{text-align:center;border-bottom:3px solid #1a365d;padding-bottom:24px;margin-bottom:32px}
.header h1{color:#1a365d;font-size:24px;margin-bottom:4px}
.header .sub{color:#718096;font-size:14px}
.intro{background:#f7fafc;border-left:4px solid #1a365d;padding:16px 20px;margin-bottom:28px;font-size:14px;line-height:1.6}
.intro strong{color:#1a365d}
h2{color:#1a365d;font-size:16px;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px}
.section{margin-bottom:28px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}
.card{background:#f7fafc;border-radius:8px;padding:16px}
.card h3{color:#1a365d;font-size:14px;margin-bottom:6px}
.card p{font-size:13px;color:#4a5568;line-height:1.5;margin:0}
.outcomes li{font-size:13px;line-height:1.8;color:#4a5568}
.outcomes li strong{color:#2d3748}
.highlight{background:#1a365d;color:#fff;border-radius:8px;padding:20px;text-align:center;margin:28px 0}
.highlight .price{font-size:28px;font-weight:700}
.highlight .compare{font-size:13px;color:#a0aec0;margin-top:4px}
.cta{text-align:center;margin-top:32px;padding-top:24px;border-top:2px solid #e2e8f0}
.cta p{font-size:14px;color:#4a5568;margin-bottom:8px}
.cta .link{color:#1a365d;font-weight:600;font-size:16px}
.footer{text-align:center;margin-top:32px;font-size:12px;color:#a0aec0}
@media print{body{padding:32px}@page{margin:0.5in}}
</style></head><body>
<div class="header">
<h1>Enterprise AI Leadership Accelerator</h1>
<div class="sub">Colaberry Enterprise AI Division</div>
</div>

<div class="intro">
<strong>${name}</strong>, a Colaberry graduate, thought this program would be valuable for
<strong>${submitted.contact_name}</strong> at <strong>${submitted.company_name}</strong>.
As someone who experienced Colaberry's approach to hands-on learning firsthand, they wanted to share this opportunity.
</div>

<div class="section">
<h2>Program Overview</h2>
<div class="grid">
<div class="card"><h3>Format</h3><p>5-day intensive program. Live, instructor-led sessions with hands-on labs and executive coaching.</p></div>
<div class="card"><h3>Who It's For</h3><p>Directors, VPs, CTOs, and senior leaders responsible for AI strategy and execution.</p></div>
<div class="card"><h3>Cohort Size</h3><p>Limited to 15 participants per cohort for personalized attention and peer-level discussion.</p></div>
<div class="card"><h3>Deliverables</h3><p>Working AI proof of concept, executive presentation deck, and a 90-day implementation roadmap.</p></div>
</div>
</div>

<div class="section">
<h2>What Graduates Have Achieved</h2>
<ul class="outcomes">
<li><strong>VP of Engineering, Fortune 500:</strong> Built AI document analysis system saving 70% processing time</li>
<li><strong>Director of Data Science:</strong> Created AI readiness dashboard that secured $2M budget approval</li>
<li><strong>CTO, Mid-Market SaaS:</strong> Deployed churn prediction model with 89% accuracy within 30 days</li>
<li><strong>Head of Operations:</strong> Automated supply chain forecasting, reducing inventory costs by 35%</li>
</ul>
</div>

<div class="highlight">
<div class="price">$4,500</div>
<div class="compare">vs. $50K-$150K for comparable consulting engagements</div>
</div>

<div class="section">
<h2>Why This Program Is Different</h2>
<div class="grid">
<div class="card"><h3>Build, Don't Just Learn</h3><p>Leave with a working proof of concept - not just slides and theory.</p></div>
<div class="card"><h3>Executive-Level Peers</h3><p>Learn alongside other senior leaders facing the same AI adoption challenges.</p></div>
</div>
</div>

<div class="cta">
<p>Schedule a 15-minute strategy call to explore if this is the right fit.</p>
<div class="link">enterprise.colaberry.ai</div>
</div>

<div class="footer">Colaberry Enterprise AI Division &bull; enterprise.colaberry.ai</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI-Leadership-Accelerator_${submitted.company_name.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
