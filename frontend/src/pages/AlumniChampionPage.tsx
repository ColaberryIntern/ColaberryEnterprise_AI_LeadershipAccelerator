import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { initTracker, trackEvent } from '../utils/tracker';
import { captureUTMFromURL, getUTMPayloadFields } from '../services/utmService';
import { captureCampaignFromURL, getCampaignId } from '../services/campaignAttributionService';
import SEOHead from '../components/SEOHead';

const DARK = {
  bg: '#0f1219',
  bgCard: '#1a1f2e',
  bgInput: '#1a1f2e',
  border: '#2d3748',
  text: '#e2e8f0',
  textMuted: '#a0aec0',
  accent: '#90cdf4',
  accentHover: '#63b3ed',
  green: '#68d391',
  navy: '#1a365d',
};

const ARTIFACTS = [
  { icon: '\u{1F4CA}', title: 'AI Readiness Assessment', desc: "Evaluate your organization's AI deployment readiness across 6 dimensions" },
  { icon: '\u{1F5FA}\uFE0F', title: 'Enterprise AI Roadmap', desc: 'A 90-day prioritized deployment plan tailored to your organization' },
  { icon: '\u{1F6E1}\uFE0F', title: 'Governance Framework', desc: 'Enterprise AI governance policies, risk controls, and compliance templates' },
  { icon: '\u26A1', title: 'Claude Code Execution Blueprint', desc: 'Production-ready AI coding workflows with security and audit controls' },
  { icon: '\u{1F680}', title: '90-Day Deployment Plan', desc: 'Week-by-week execution milestones with resource allocation and KPIs' },
];

const COMPANY_SIZES = ['1-49', '50-249', '250-999', '1000-4999', '5000+'];

interface FormData {
  name: string;
  email: string;
  company: string;
  title: string;
  alumni_cohort: string;
  company_size: string;
  will_sponsor: string;
  track: string;
}

const initialForm: FormData = {
  name: '',
  email: '',
  company: '',
  title: '',
  alumni_cohort: '',
  company_size: '',
  will_sponsor: '',
  track: '',
};

function AlumniChampionPage() {
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    initTracker();
    captureUTMFromURL();
    captureCampaignFromURL();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim() || !form.email.trim() || !form.company.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    trackEvent('alumni_form_submit', { track: form.track });

    try {
      const utmFields = getUTMPayloadFields();
      const campaignId = getCampaignId();
      const visitorFp = localStorage.getItem('cb_visitor_fp');

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        title: form.title.trim() || undefined,
        interest_area: form.alumni_cohort.trim() || undefined,
        company_size: form.company_size || undefined,
        evaluating_90_days: form.will_sponsor === 'yes',
        message: `[Track: ${form.track || 'not selected'}] [Alumni Cohort: ${form.alumni_cohort || 'not specified'}]`,
        form_type: 'alumni_referral',
        ...utmFields,
      };

      if (campaignId) {
        payload.source = `campaign:${campaignId}`.slice(0, 50);
      }
      if (visitorFp) {
        payload.visitor_fingerprint = visitorFp;
      }

      await api.post('/api/leads', payload);
      setSuccess(true);
      setForm(initialForm);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToForm = (track: string) => {
    setForm((prev) => ({ ...prev, track }));
    document.getElementById('alumni-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const inputStyle: React.CSSProperties = {
    background: DARK.bgInput,
    borderColor: DARK.border,
    color: DARK.text,
  };

  return (
    <>
      <SEOHead
        title="Become the AI Champion Inside Your Company"
        description="Lead AI adoption. Get corporate sponsorship or enroll at 50% alumni rate. Rejoin the Colaberry Executive AI Accelerator."
      />

      <div style={{ background: DARK.bg, color: DARK.text, minHeight: '100vh' }}>

        {/* Hero */}
        <section
          style={{
            background: `linear-gradient(135deg, ${DARK.bg} 0%, #1a2332 50%, ${DARK.navy} 100%)`,
            padding: '5rem 0 4rem',
          }}
        >
          <div className="container text-center" style={{ maxWidth: '800px' }}>
            <img src="/colaberry-icon.png" alt="" width="56" height="56" className="mb-4" style={{ filter: 'brightness(1.2)' }} />
            <h1 className="display-4 fw-bold mb-3" style={{ color: '#fff' }}>
              Become the AI Champion Inside Your Company
            </h1>
            <p className="lead mb-4" style={{ color: DARK.textMuted, fontSize: '1.25rem' }}>
              Lead AI adoption. Get sponsored. Or enroll at 50% alumni rate.
            </p>
            <div className="d-flex justify-content-center gap-3 flex-wrap">
              <button
                className="btn btn-lg fw-bold px-4"
                style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}
                onClick={() => scrollToForm('corporate')}
              >
                Get Corporate Sponsorship Kit
              </button>
              <button
                className="btn btn-lg fw-bold px-4"
                style={{ background: DARK.green, color: DARK.bg, border: 'none' }}
                onClick={() => scrollToForm('self-pay')}
              >
                Claim 50% Alumni Discount
              </button>
            </div>
            <div className="mt-3">
              <a
                href="/referrals/login"
                className="small fw-medium"
                style={{ color: DARK.accent, textDecoration: 'none' }}
              >
                Already an alumni? Activate your referral account &rarr;
              </a>
            </div>
          </div>
        </section>

        {/* Two Paths */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container">
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>Two Paths Back</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted }}>
              Choose the path that fits your situation.
            </p>
            <div className="row g-4">
              <div className="col-md-6">
                <div
                  className="h-100 p-4 rounded-3"
                  style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                >
                  <div className="text-center mb-3">
                    <span className="fs-1" aria-hidden="true">🏢</span>
                  </div>
                  <h3 className="h4 text-center fw-bold" style={{ color: DARK.accent }}>Corporate Sponsored</h3>
                  <p className="text-center mb-4" style={{ color: DARK.textMuted }}>
                    Your company funds your re-enrollment and team expansion.
                  </p>
                  <ul className="list-unstyled" style={{ color: DARK.text }}>
                    <li className="mb-2">&#x2705; Company pays full enrollment</li>
                    <li className="mb-2">&#x2705; Bring additional team members</li>
                    <li className="mb-2">&#x2705; ROI justification materials provided</li>
                    <li className="mb-2">&#x2705; Internal approval templates included</li>
                    <li className="mb-2">&#x2705; Corporate group pricing available</li>
                  </ul>
                  <div className="text-center mt-4">
                    <button
                      className="btn fw-bold px-4"
                      style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}
                      onClick={() => scrollToForm('corporate')}
                    >
                      Get Sponsorship Kit
                    </button>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div
                  className="h-100 p-4 rounded-3"
                  style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                >
                  <div className="text-center mb-3">
                    <span className="fs-1" aria-hidden="true">&#x1F393;</span>
                  </div>
                  <h3 className="h4 text-center fw-bold" style={{ color: DARK.green }}>Alumni Self-Pay</h3>
                  <p className="text-center mb-4" style={{ color: DARK.textMuted }}>
                    Re-enroll individually at the exclusive alumni rate.
                  </p>
                  <ul className="list-unstyled" style={{ color: DARK.text }}>
                    <li className="mb-2">&#x2705; 50% alumni discount ($2,250)</li>
                    <li className="mb-2">&#x2705; Flexible enrollment options</li>
                    <li className="mb-2">&#x2705; Updated curriculum and tools</li>
                    <li className="mb-2">&#x2705; Advanced AI agent building</li>
                    <li className="mb-2">&#x2705; Continued peer network access</li>
                  </ul>
                  <div className="text-center mt-4">
                    <button
                      className="btn fw-bold px-4"
                      style={{ background: DARK.green, color: DARK.bg, border: 'none' }}
                      onClick={() => scrollToForm('self-pay')}
                    >
                      Claim Alumni Rate
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Artifact Value Block (dark variant) */}
        <section style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container">
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>What You'll Walk Away With</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '650px', margin: '0 auto' }}>
              Every participant leaves with production-ready artifacts — not slide decks.
            </p>
            <div className="row g-4 justify-content-center">
              {ARTIFACTS.map((item) => (
                <div className="col-6 col-lg-4" key={item.title}>
                  <div
                    className="h-100 text-center p-4 rounded-3"
                    style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                  >
                    <div className="fs-1 mb-3" aria-hidden="true">{item.icon}</div>
                    <h3 className="h6 fw-bold" style={{ color: '#fff' }}>{item.title}</h3>
                    <p className="small mb-0" style={{ color: DARK.textMuted }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Referral Program */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container">
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>Earn $250 Per Referral</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '600px', margin: '0 auto' }}>
              Know a company that could benefit from enterprise AI training? Refer them and earn a commission for every successful enrollment.
            </p>
            <div className="row g-4">
              {[
                {
                  icon: '\u{1F3E2}',
                  title: 'Corporate Sponsor',
                  desc: 'Introduce the program to your company leadership. Add your referral contact, then download a sponsor kit to share internally.',
                },
                {
                  icon: '\u{1F91D}',
                  title: 'Introduced Referral',
                  desc: 'Submit a contact and we reach out mentioning your name and Colaberry experience. The personal touch drives results.',
                },
                {
                  icon: '\u{1F575}\uFE0F',
                  title: 'Anonymous Referral',
                  desc: 'Submit a company lead anonymously. They enter our standard corporate outreach — your name is never mentioned.',
                },
              ].map((path) => (
                <div className="col-md-4" key={path.title}>
                  <div
                    className="h-100 p-4 rounded-3 text-center"
                    style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                  >
                    <div className="fs-1 mb-3" aria-hidden="true">{path.icon}</div>
                    <h3 className="h5 fw-bold" style={{ color: DARK.accent }}>{path.title}</h3>
                    <p className="small mb-0" style={{ color: DARK.textMuted }}>{path.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-4">
              <a
                href="/referrals/login"
                className="btn fw-bold px-4"
                style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}
              >
                Activate My Alumni Referral Account
              </a>
            </div>
          </div>
        </section>

        {/* Alumni Referral Form */}
        <section id="alumni-form" style={{ padding: '4rem 0' }}>
          <div className="container" style={{ maxWidth: '700px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>
              {form.track === 'corporate' ? 'Request Corporate Sponsorship Kit' : form.track === 'self-pay' ? 'Claim Your Alumni Discount' : 'Get Started'}
            </h2>
            <p className="text-center mb-4" style={{ color: DARK.textMuted }}>
              Fill out the form below and we'll reach out within 24 hours.
            </p>

            {success ? (
              <div className="text-center p-5 rounded-3" style={{ background: DARK.bgCard, border: `1px solid ${DARK.green}` }}>
                <div className="fs-1 mb-3">&#x2705;</div>
                <h3 className="fw-bold" style={{ color: DARK.green }}>Thank You!</h3>
                <p style={{ color: DARK.textMuted }}>
                  We've received your information. A member of our team will reach out within 24 hours.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div
                  className="p-4 rounded-3"
                  style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                >
                  {error && (
                    <div className="alert alert-danger mb-3" role="alert">{error}</div>
                  )}

                  <div className="row g-3">
                    {/* Full Name */}
                    <div className="col-md-6">
                      <label className="form-label small fw-medium" style={{ color: DARK.textMuted }}>Full Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                        style={inputStyle}
                      />
                    </div>

                    {/* Email */}
                    <div className="col-md-6">
                      <label className="form-label small fw-medium" style={{ color: DARK.textMuted }}>Work Email *</label>
                      <input
                        type="email"
                        className="form-control"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        required
                        style={inputStyle}
                      />
                    </div>

                    {/* Company */}
                    <div className="col-md-6">
                      <label className="form-label small fw-medium" style={{ color: DARK.textMuted }}>Company *</label>
                      <input
                        type="text"
                        className="form-control"
                        name="company"
                        value={form.company}
                        onChange={handleChange}
                        required
                        style={inputStyle}
                      />
                    </div>

                    {/* Title */}
                    <div className="col-md-6">
                      <label className="form-label small fw-medium" style={{ color: DARK.textMuted }}>Job Title</label>
                      <input
                        type="text"
                        className="form-control"
                        name="title"
                        value={form.title}
                        onChange={handleChange}
                        style={inputStyle}
                      />
                    </div>

                    {/* Alumni Cohort */}
                    <div className="col-md-6">
                      <label className="form-label small fw-medium" style={{ color: DARK.textMuted }}>Alumni Cohort</label>
                      <input
                        type="text"
                        className="form-control"
                        name="alumni_cohort"
                        value={form.alumni_cohort}
                        onChange={handleChange}
                        placeholder="e.g. Spring 2025"
                        style={inputStyle}
                      />
                    </div>

                    {/* Company Size */}
                    <div className="col-md-6">
                      <label className="form-label small fw-medium" style={{ color: DARK.textMuted }}>Company Size</label>
                      <select
                        className="form-select"
                        name="company_size"
                        value={form.company_size}
                        onChange={handleChange}
                        style={inputStyle}
                      >
                        <option value="">Select...</option>
                        {COMPANY_SIZES.map((s) => (
                          <option key={s} value={s}>{s} employees</option>
                        ))}
                      </select>
                    </div>

                    {/* Will Company Sponsor */}
                    <div className="col-12">
                      <label className="form-label small fw-medium" style={{ color: DARK.textMuted }}>Will your company sponsor your enrollment?</label>
                      <div className="d-flex gap-4">
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="radio"
                            name="will_sponsor"
                            id="sponsor-yes"
                            value="yes"
                            checked={form.will_sponsor === 'yes'}
                            onChange={handleChange}
                          />
                          <label className="form-check-label" htmlFor="sponsor-yes" style={{ color: DARK.text }}>Yes</label>
                        </div>
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="radio"
                            name="will_sponsor"
                            id="sponsor-no"
                            value="no"
                            checked={form.will_sponsor === 'no'}
                            onChange={handleChange}
                          />
                          <label className="form-check-label" htmlFor="sponsor-no" style={{ color: DARK.text }}>No</label>
                        </div>
                      </div>
                    </div>

                    {/* Track Selection */}
                    <div className="col-12">
                      <label className="form-label small fw-medium" style={{ color: DARK.textMuted }}>Preferred Track</label>
                      <div className="d-flex gap-4">
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="radio"
                            name="track"
                            id="track-corporate"
                            value="corporate"
                            checked={form.track === 'corporate'}
                            onChange={handleChange}
                          />
                          <label className="form-check-label" htmlFor="track-corporate" style={{ color: DARK.text }}>Corporate Sponsored</label>
                        </div>
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="radio"
                            name="track"
                            id="track-self"
                            value="self-pay"
                            checked={form.track === 'self-pay'}
                            onChange={handleChange}
                          />
                          <label className="form-check-label" htmlFor="track-self" style={{ color: DARK.text }}>Alumni Self-Pay</label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center mt-4">
                    <button
                      type="submit"
                      className="btn btn-lg fw-bold px-5"
                      disabled={submitting}
                      style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}
                    >
                      {submitting ? 'Submitting...' : 'Submit'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center py-4" style={{ borderTop: `1px solid ${DARK.border}` }}>
          <img src="/colaberry-icon.png" alt="" width="28" height="28" className="mb-2" style={{ filter: 'brightness(1.2)', opacity: 0.7 }} />
          <p className="small mb-0" style={{ color: DARK.textMuted }}>
            &copy; {new Date().getFullYear()} Colaberry Inc. All rights reserved.
          </p>
        </footer>
      </div>
    </>
  );
}

export default AlumniChampionPage;
