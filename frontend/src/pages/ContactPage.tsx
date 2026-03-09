import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import SEOHead from '../components/SEOHead';
import LeadCaptureForm from '../components/LeadCaptureForm';
import StrategyCallModal from '../components/StrategyCallModal';

interface FormErrors {
  [key: string]: string;
}

function ContactPage() {
  const navigate = useNavigate();
  const [showBooking, setShowBooking] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    role: '',
    phone: '',
    interest_area: '',
    message: '',
  });
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (!consentChecked) {
      newErrors.consent = 'You must agree to be contacted';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    if (!validate()) return;

    setSubmitting(true);
    try {
      await api.post('/api/leads', { ...formData, form_type: 'contact', consent_contact: consentChecked });
      setSubmitted(true);
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.details) {
        const fieldErrors: FormErrors = {};
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
        description="Contact the Colaberry Enterprise AI team. Request enrollment, explore corporate sponsorship, or schedule a strategy call about enterprise AI deployment."
      />

      {/* Header */}
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

      {/* Executive AI Briefing Download */}
      <section className="section-alt py-5" aria-label="Download Executive AI Briefing">
        <div className="container" style={{ maxWidth: '1100px' }}>
          <div className="bg-white rounded-4 shadow p-4 p-md-5">
            <div className="text-center mb-5">
              <h2 className="mb-3" style={{ fontSize: '2rem' }}>Executive AI Accelerator Briefing</h2>
              <p className="text-muted mb-0" style={{ maxWidth: '680px', margin: '0 auto', fontSize: '1.1rem' }}>
                Get the full program overview — curriculum, ROI framework, and enterprise case studies
                delivered to your inbox.
              </p>
            </div>

            <div className="row g-4 mb-5">
              {[
                { icon: '📅', title: '21-Day Execution Roadmap', description: 'Clear day-by-day transformation path' },
                { icon: '💰', title: 'ROI & Cost Framework', description: 'Internal build vs consulting math' },
                { icon: '🏢', title: 'Enterprise Case Studies', description: 'Documented deployment results' },
                { icon: '🧱', title: 'AI Architecture Blueprint', description: 'Learn / Build / Manage model' },
              ].map((item) => (
                <div className="col-md-6 col-lg-3" key={item.title}>
                  <div className="card card-lift h-100 border text-center p-3">
                    <div className="fs-2 mb-2" aria-hidden="true">{item.icon}</div>
                    <div className="fw-bold small mb-1">{item.title}</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>{item.description}</div>
                  </div>
                </div>
              ))}
            </div>

            <LeadCaptureForm
              formType="contact_executive_briefing"
              fields={['name', 'email', 'company', 'title', 'phone', 'company_size']}
              submitLabel="Get Executive Briefing →"
              buttonClassName="btn btn-hero-primary btn-lg w-100"
              captureUtm={true}
              onSuccess={(data) => navigate('/executive-overview/thank-you', { state: data })}
              className="mb-4"
            />

            <div className="text-center mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p className="fw-semibold small mb-1">Enterprise Data Respect Policy</p>
              <p className="text-muted small mb-0">
                We never sell your information. Your data is used solely to deliver requested materials.
              </p>
            </div>
          </div>
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
          <p className="mb-4 small" style={{ opacity: 0.6 }}>
            Most executives schedule this call immediately after reviewing the briefing.
          </p>
          <button
            className="btn btn-hero-primary btn-lg px-5"
            onClick={() => setShowBooking(true)}
          >
            Schedule Executive Strategy Call →
          </button>
          <div className="d-flex justify-content-center gap-4 mt-4 flex-wrap" style={{ opacity: 0.7 }}>
            <span className="small">✓ 30-minute focused session</span>
            <span className="small">✓ No obligation</span>
            <span className="small">✓ Architecture-first discussion</span>
          </div>
        </div>
      </section>

      {/* General Contact Form */}
      <section className="section" aria-label="Contact Form">
        <div className="container content-narrow">
          <h2 className="text-center mb-2">Talk to Our Enterprise AI Team</h2>
          <p className="text-center text-muted mb-4">
            Have a specific question or need? Send us a message and we'll respond within one business day.
          </p>
          {submitted ? (
            <div className="text-center py-5" role="alert">
              <h2 className="text-success mb-3">✅ Message Received</h2>
              <p>
                Our Enterprise AI team will be in touch within one business day.
                If your inquiry is time-sensitive, you can also reach us at{' '}
                <a href="mailto:info@colaberry.com">info@colaberry.com</a>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {serverError && (
                <div className="alert alert-danger" role="alert">
                  {serverError}
                </div>
              )}
              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="contact-name" className="form-label">
                    Full Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control ${errors.name ? 'is-invalid' : ''}`}
                    id="contact-name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    aria-required="true"
                    aria-describedby={errors.name ? 'contact-name-error' : undefined}
                  />
                  {errors.name && (
                    <div className="invalid-feedback" id="contact-name-error">{errors.name}</div>
                  )}
                </div>
                <div className="col-md-6">
                  <label htmlFor="contact-email" className="form-label">
                    Email <span className="text-danger">*</span>
                  </label>
                  <input
                    type="email"
                    className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                    id="contact-email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    aria-required="true"
                    aria-describedby={errors.email ? 'contact-email-error' : undefined}
                  />
                  {errors.email && (
                    <div className="invalid-feedback" id="contact-email-error">{errors.email}</div>
                  )}
                </div>
                <div className="col-md-6">
                  <label htmlFor="contact-company" className="form-label">
                    Company
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    id="contact-company"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-6">
                  <label htmlFor="contact-role" className="form-label">
                    Your Role
                  </label>
                  <select
                    className="form-select"
                    id="contact-role"
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                  >
                    <option value="">Select your role</option>
                    <option value="director_vp">Director / VP</option>
                    <option value="c_level">C-Level Executive (CTO, CDO, CIO)</option>
                    <option value="principal_architect">Principal / Staff Architect</option>
                    <option value="senior_manager">Senior Manager / Head of Engineering</option>
                    <option value="other">Other Technical Leader</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label htmlFor="contact-phone" className="form-label">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    className="form-control"
                    id="contact-phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                <div className="col-md-6">
                  <label htmlFor="contact-interest" className="form-label">
                    What brings you here?
                  </label>
                  <select
                    className="form-select"
                    id="contact-interest"
                    name="interest_area"
                    value={formData.interest_area}
                    onChange={handleChange}
                  >
                    <option value="">Select an option</option>
                    <option value="executive_overview">Download Executive Overview</option>
                    <option value="enroll_participant">Enroll a Participant</option>
                    <option value="corporate_sponsorship">Corporate Sponsorship Inquiry</option>
                    <option value="group_enrollment">Group / Team Enrollment</option>
                    <option value="advisory_services">Enterprise AI Advisory Services</option>
                    <option value="strategy_call">Schedule a Strategy Call</option>
                    <option value="general">General Information</option>
                  </select>
                </div>
                <div className="col-12">
                  <label htmlFor="contact-message" className="form-label">
                    Message
                  </label>
                  <textarea
                    className="form-control"
                    id="contact-message"
                    name="message"
                    rows={4}
                    value={formData.message}
                    onChange={handleChange}
                  ></textarea>
                </div>
                <div className="col-12">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className={`form-check-input ${errors.consent ? 'is-invalid' : ''}`}
                      id="contact-consent"
                      checked={consentChecked}
                      onChange={(e) => {
                        setConsentChecked(e.target.checked);
                        if (errors.consent) {
                          setErrors({ ...errors, consent: '' });
                        }
                      }}
                    />
                    <label className="form-check-label small" htmlFor="contact-consent">
                      I agree to be contacted by Colaberry about the Enterprise AI Leadership Accelerator <span className="text-danger">*</span>
                    </label>
                    {errors.consent && (
                      <div className="invalid-feedback">{errors.consent}</div>
                    )}
                  </div>
                </div>
                <div className="col-12">
                  <button
                    type="submit"
                    className="btn btn-primary btn-lg"
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting...' : 'Submit Inquiry'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Contact Info */}
      <section className="section-alt" aria-label="Contact Information">
        <div className="container">
          <div className="row g-4 text-center">
            <div className="col-md-4">
              <h3 className="h5">📧 Email</h3>
              <p className="text-muted">info@colaberry.com</p>
            </div>
            <div className="col-md-4">
              <h3 className="h5">🔗 Social</h3>
              <p className="text-muted">LinkedIn | Twitter</p>
            </div>
            <div className="col-md-4">
              <h3 className="h5">📞 Strategy Call</h3>
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

      <StrategyCallModal show={showBooking} onClose={() => setShowBooking(false)} />
    </>
  );
}

export default ContactPage;
