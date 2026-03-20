import React, { useState } from 'react';
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import { EnterpriseLead, toLeadPayload } from '../models/EnterpriseLead';
import { validateForm, ValidationRules } from '../utils/formValidation';
import { getUTMParams } from '../services/utmService';
import api from '../utils/api';
import { STANDARD_CTAS } from '../config/programSchedule';

const VALIDATION_RULES: ValidationRules = {
  required: ['fullName', 'email', 'company', 'title'],
  conditionalRequired: [
    {
      when: { field: 'willSeekCorporateSponsorship', equals: true },
      require: ['budgetOwner', 'timeline'],
    },
  ],
  email: ['email'],
  phone: ['phone'],
};

function ContactPage() {
  const [showBooking, setShowBooking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [sendBriefing, setSendBriefing] = useState(false);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    company: '',
    title: '',
    companySize: '',
    industry: '',
    roleInAIInitiative: '',
    aiMaturityLevel: '',
    primaryObjective: [] as string[],
    willSeekCorporateSponsorship: false,
    budgetOwner: '',
    timeline: '',
    message: '',
    consentContact: false,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleObjectiveToggle = (val: string) => {
    setForm((prev) => ({
      ...prev,
      primaryObjective: prev.primaryObjective.includes(val)
        ? prev.primaryObjective.filter((v) => v !== val)
        : [...prev.primaryObjective, val],
    }));
    if (errors.primaryObjective) setErrors((prev) => ({ ...prev, primaryObjective: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    const validationErrors = validateForm(form as unknown as Record<string, unknown>, VALIDATION_RULES);
    if (!form.consentContact) validationErrors.consentContact = 'You must agree to be contacted';
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      const lead: EnterpriseLead = {
        ...form,
        formType: sendBriefing ? 'enterprise_inquiry_with_briefing' : 'enterprise_inquiry',
        ...getUTMParams(),
        pageOrigin: window.location.href,
      };
      await api.post('/api/leads', toLeadPayload(lead));
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.details) {
        const fieldErrors: Record<string, string> = {};
        err.response.data.details.forEach((d: { field: string; message: string }) => {
          fieldErrors[d.field] = d.message;
        });
        setErrors(fieldErrors);
      } else {
        setServerError('Something went wrong. Please try again later.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEOHead
        title="Contact"
        description="Contact the Colaberry Enterprise AI team. Enterprise AI inquiry, corporate sponsorship, or schedule a strategy call about AI deployment."
      />

      {/* Hero */}
      <section
        className="hero-bg text-light py-5"
        aria-label="Page Header"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1423666639041-f56000c27a9a?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container text-center py-4">
          <img src="/colaberry-icon.png" alt="" width="44" height="44" className="mb-3 logo-hero" />
          <h1 className="display-5 fw-bold text-light">Talk to Our Enterprise AI Team</h1>
          <p className="lead">
            Whether you're evaluating enrollment, sponsoring a team, or exploring
            advisory options — we respond within one business day.
          </p>
        </div>
      </section>

      {/* Enterprise AI Inquiry Form */}
      <section className="section" aria-label="Enterprise AI Inquiry">
        <div className="container" style={{ maxWidth: '800px' }}>
          {submitted ? (
            <div className="text-center py-5" role="alert">
              <h2 className="text-success mb-3">Inquiry Received</h2>
              {form.phone.trim() ? (
                <p className="fs-5 mb-4">
                  Maya, our Director of Admissions, will be calling you in less than 60 seconds to discuss your AI initiatives.
                  {sendBriefing && ' The Executive Briefing will also be sent to your email shortly.'}
                </p>
              ) : (
                <p className="fs-5 mb-4">
                  Our Enterprise AI team will follow up via email shortly.
                  {sendBriefing && ' The Executive Briefing will be sent to your email as well.'}
                </p>
              )}
              <p className="text-muted">
                If your inquiry is time-sensitive, reach us at{' '}
                <a href="mailto:info@colaberry.com">info@colaberry.com</a>.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-4 shadow p-4 p-md-5">
              <h2 className="mb-2" style={{ fontSize: '1.75rem' }}>Enterprise AI Inquiry</h2>
              <p className="text-muted mb-4">
                Tell us about your AI initiative and we'll connect you with the right resources.
              </p>

              {serverError && (
                <div className="alert alert-danger" role="alert">{serverError}</div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                {/* Section 1: Identity */}
                <div className="mb-4">
                  <p className="fw-semibold small text-muted text-uppercase mb-3">Contact Information</p>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label htmlFor="ci-fullName" className="form-label small fw-medium">
                        Full Name <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className={`form-control form-control-sm ${errors.fullName ? 'is-invalid' : ''}`}
                        id="ci-fullName"
                        name="fullName"
                        value={form.fullName}
                        onChange={handleChange}
                        required
                      />
                      {errors.fullName && <div className="invalid-feedback">{errors.fullName}</div>}
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="ci-email" className="form-label small fw-medium">
                        Work Email <span className="text-danger">*</span>
                      </label>
                      <input
                        type="email"
                        className={`form-control form-control-sm ${errors.email ? 'is-invalid' : ''}`}
                        id="ci-email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        required
                      />
                      {errors.email && <div className="invalid-feedback">{errors.email}</div>}
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="ci-phone" className="form-label small fw-medium">Phone</label>
                      <input
                        type="tel"
                        className={`form-control form-control-sm ${errors.phone ? 'is-invalid' : ''}`}
                        id="ci-phone"
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="+1 (555) 123-4567"
                      />
                      {errors.phone && <div className="invalid-feedback">{errors.phone}</div>}
                    </div>
                  </div>
                </div>

                {/* Section 2: Company */}
                <div className="mb-4">
                  <p className="fw-semibold small text-muted text-uppercase mb-3">Organization</p>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label htmlFor="ci-company" className="form-label small fw-medium">
                        Company <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className={`form-control form-control-sm ${errors.company ? 'is-invalid' : ''}`}
                        id="ci-company"
                        name="company"
                        value={form.company}
                        onChange={handleChange}
                        required
                      />
                      {errors.company && <div className="invalid-feedback">{errors.company}</div>}
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="ci-title" className="form-label small fw-medium">
                        Title <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className={`form-control form-control-sm ${errors.title ? 'is-invalid' : ''}`}
                        id="ci-title"
                        name="title"
                        value={form.title}
                        onChange={handleChange}
                        required
                      />
                      {errors.title && <div className="invalid-feedback">{errors.title}</div>}
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="ci-companySize" className="form-label small fw-medium">Company Size</label>
                      <select
                        className="form-select form-select-sm"
                        id="ci-companySize"
                        name="companySize"
                        value={form.companySize}
                        onChange={handleChange}
                      >
                        <option value="">Select...</option>
                        <option value="1-49">1-49 employees</option>
                        <option value="50-249">50-249 employees</option>
                        <option value="250-999">250-999 employees</option>
                        <option value="1000-4999">1,000-4,999 employees</option>
                        <option value="5000+">5,000+ employees</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="ci-industry" className="form-label small fw-medium">Industry</label>
                      <select
                        className="form-select form-select-sm"
                        id="ci-industry"
                        name="industry"
                        value={form.industry}
                        onChange={handleChange}
                      >
                        <option value="">Select...</option>
                        <option value="technology">Technology</option>
                        <option value="finance">Finance & Banking</option>
                        <option value="healthcare">Healthcare & Life Sciences</option>
                        <option value="manufacturing">Manufacturing</option>
                        <option value="energy">Energy & Utilities</option>
                        <option value="retail">Retail & eCommerce</option>
                        <option value="government">Government & Public Sector</option>
                        <option value="logistics">Logistics & Supply Chain</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 3: AI Initiative */}
                <div className="mb-4">
                  <p className="fw-semibold small text-muted text-uppercase mb-3">AI Initiative Context</p>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label htmlFor="ci-aiMaturityLevel" className="form-label small fw-medium">
                        AI Maturity Level
                      </label>
                      <select
                        className="form-select form-select-sm"
                        id="ci-aiMaturityLevel"
                        name="aiMaturityLevel"
                        value={form.aiMaturityLevel}
                        onChange={handleChange}
                      >
                        <option value="">Select...</option>
                        <option value="exploring">Exploring — No AI in production</option>
                        <option value="piloting">Piloting — Running initial experiments</option>
                        <option value="scaling">Scaling — Deploying AI across teams</option>
                        <option value="embedded">Embedded — AI is core to operations</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="ci-roleInAIInitiative" className="form-label small fw-medium">
                        Your Role in AI Initiative
                      </label>
                      <select
                        className="form-select form-select-sm"
                        id="ci-roleInAIInitiative"
                        name="roleInAIInitiative"
                        value={form.roleInAIInitiative}
                        onChange={handleChange}
                      >
                        <option value="">Select...</option>
                        <option value="executive_sponsor">Executive Sponsor</option>
                        <option value="technical_lead">Technical Lead</option>
                        <option value="evaluator">Evaluator / Researcher</option>
                        <option value="participant">Potential Participant</option>
                        <option value="hr_ld">HR / L&D Coordinator</option>
                      </select>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium">Primary Objectives</label>
                      <div className="d-flex flex-wrap gap-2">
                        {[
                          'Build internal AI capability',
                          'Evaluate AI vendors',
                          'Deploy AI POC',
                          'Train leadership team',
                          'AI governance & compliance',
                          'Accelerate time to production',
                        ].map((obj) => (
                          <button
                            key={obj}
                            type="button"
                            className={`btn btn-sm ${
                              form.primaryObjective.includes(obj)
                                ? 'btn-primary'
                                : 'btn-outline-secondary'
                            }`}
                            onClick={() => handleObjectiveToggle(obj)}
                          >
                            {obj}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 4: Timeline & Budget */}
                <div className="mb-4">
                  <p className="fw-semibold small text-muted text-uppercase mb-3">Timeline & Sponsorship</p>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label htmlFor="ci-timeline" className="form-label small fw-medium">
                        Timeline{form.willSeekCorporateSponsorship && <span className="text-danger"> *</span>}
                      </label>
                      <select
                        className={`form-select form-select-sm ${errors.timeline ? 'is-invalid' : ''}`}
                        id="ci-timeline"
                        name="timeline"
                        value={form.timeline}
                        onChange={handleChange}
                      >
                        <option value="">Select...</option>
                        <option value="immediate">Immediate — Next 30 days</option>
                        <option value="quarter">This quarter</option>
                        <option value="6months">Within 6 months</option>
                        <option value="exploring">Just exploring</option>
                      </select>
                      {errors.timeline && <div className="invalid-feedback">{errors.timeline}</div>}
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="ci-budgetOwner" className="form-label small fw-medium">
                        Budget Owner{form.willSeekCorporateSponsorship && <span className="text-danger"> *</span>}
                      </label>
                      <input
                        type="text"
                        className={`form-control form-control-sm ${errors.budgetOwner ? 'is-invalid' : ''}`}
                        id="ci-budgetOwner"
                        name="budgetOwner"
                        value={form.budgetOwner}
                        onChange={handleChange}
                        placeholder="e.g., VP Engineering, CTO"
                      />
                      {errors.budgetOwner && <div className="invalid-feedback">{errors.budgetOwner}</div>}
                    </div>
                    <div className="col-12">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="ci-sponsorship"
                          name="willSeekCorporateSponsorship"
                          checked={form.willSeekCorporateSponsorship}
                          onChange={handleChange}
                        />
                        <label className="form-check-label small" htmlFor="ci-sponsorship">
                          My organization will seek corporate sponsorship for this program
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 5: Message */}
                <div className="mb-4">
                  <label htmlFor="ci-message" className="form-label small fw-medium">
                    Message or Questions
                  </label>
                  <textarea
                    className="form-control form-control-sm"
                    id="ci-message"
                    name="message"
                    rows={3}
                    value={form.message}
                    onChange={handleChange}
                  />
                </div>

                {/* Briefing opt-in */}
                <div className="mb-3">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="ci-sendBriefing"
                      checked={sendBriefing}
                      onChange={(e) => setSendBriefing(e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor="ci-sendBriefing">
                      Send me the Executive Briefing
                    </label>
                  </div>
                </div>

                {/* Consent */}
                <div className="mb-4">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className={`form-check-input ${errors.consentContact ? 'is-invalid' : ''}`}
                      id="ci-consent"
                      name="consentContact"
                      checked={form.consentContact}
                      onChange={handleChange}
                    />
                    <label className="form-check-label small" htmlFor="ci-consent">
                      I agree to be contacted by Colaberry about the Enterprise AI Leadership Accelerator <span className="text-danger">*</span>
                    </label>
                    {errors.consentContact && (
                      <div className="invalid-feedback">{errors.consentContact}</div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg w-100"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit Inquiry'}
                </button>
              </form>

              <div className="text-center mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <p className="text-muted small mb-0">
                  We never sell your information. Your data is used solely to deliver requested materials.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Strategy Call CTA */}
      <section
        className="text-light text-center"
        aria-label="Schedule Strategy Call"
        style={{
          background: 'linear-gradient(135deg, #0f1b2d 0%, #1a365d 50%, #1e3a5f 100%)',
          padding: '5rem 0',
        }}
      >
        <div className="container" style={{ maxWidth: '750px' }}>
          <h2 className="text-light mb-3" style={{ fontSize: '2rem' }}>
            Ready to Deploy AI in the Next 30 Days?
          </h2>
          <p className="mb-4" style={{ opacity: 0.85, fontSize: '1.1rem' }}>
            Schedule a 30-minute executive strategy session to align roadmap,
            architecture, and internal capability.
          </p>
          <button
            className="btn btn-hero-primary btn-lg px-5"
            onClick={() => setShowBooking(true)}
          >
            {STANDARD_CTAS.secondary}
          </button>
          <div className="d-flex justify-content-center gap-4 mt-4 flex-wrap" style={{ opacity: 0.7 }}>
            <span className="small">30-minute focused session</span>
            <span className="small">No obligation</span>
            <span className="small">Architecture-first discussion</span>
          </div>
        </div>
      </section>

      {/* Contact Info */}
      <section className="section-alt" aria-label="Contact Information">
        <div className="container">
          <div className="row g-4 text-center">
            <div className="col-md-4">
              <h3 className="h5">Email</h3>
              <p className="text-muted">info@colaberry.com</p>
            </div>
            <div className="col-md-4">
              <h3 className="h5">Social</h3>
              <p className="text-muted">LinkedIn | Twitter</p>
            </div>
            <div className="col-md-4">
              <h3 className="h5">Strategy Call</h3>
              <p className="text-muted">Book a 30-minute strategy call with our Enterprise AI team.</p>
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => setShowBooking(true)}
              >
                Book a Call
              </button>
            </div>
          </div>
        </div>
      </section>

      <StrategyCallModal show={showBooking} onClose={() => setShowBooking(false)} pageOrigin="/contact" />
    </>
  );
}

export default ContactPage;
