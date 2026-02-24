import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import SEOHead from '../components/SEOHead';

interface FormErrors {
  [key: string]: string;
}

function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    role: '',
    interest_area: '',
    message: '',
  });
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
      await api.post('/api/leads', { ...formData, form_type: 'contact' });
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

      {/* Contact Form */}
      <section className="section" aria-label="Contact Form">
        <div className="container" style={{ maxWidth: '700px' }}>
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
                  <label htmlFor="name" className="form-label">
                    Full Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control ${errors.name ? 'is-invalid' : ''}`}
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    aria-required="true"
                    aria-describedby={errors.name ? 'name-error' : undefined}
                  />
                  {errors.name && (
                    <div className="invalid-feedback" id="name-error">{errors.name}</div>
                  )}
                </div>
                <div className="col-md-6">
                  <label htmlFor="email" className="form-label">
                    Email <span className="text-danger">*</span>
                  </label>
                  <input
                    type="email"
                    className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    aria-required="true"
                    aria-describedby={errors.email ? 'email-error' : undefined}
                  />
                  {errors.email && (
                    <div className="invalid-feedback" id="email-error">{errors.email}</div>
                  )}
                </div>
                <div className="col-md-6">
                  <label htmlFor="company" className="form-label">
                    Company
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                  />
                </div>
                <div className="col-md-6">
                  <label htmlFor="role" className="form-label">
                    Your Role
                  </label>
                  <select
                    className="form-select"
                    id="role"
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
                <div className="col-12">
                  <label htmlFor="interest_area" className="form-label">
                    What brings you here?
                  </label>
                  <select
                    className="form-select"
                    id="interest_area"
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
                  <label htmlFor="message" className="form-label">
                    Message
                  </label>
                  <textarea
                    className="form-control"
                    id="message"
                    name="message"
                    rows={4}
                    value={formData.message}
                    onChange={handleChange}
                  ></textarea>
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
              {/* TODO: Replace href with Calendly or booking integration URL */}
              <Link to="/contact" className="btn btn-outline-primary btn-sm">
                Book a Call
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default ContactPage;
