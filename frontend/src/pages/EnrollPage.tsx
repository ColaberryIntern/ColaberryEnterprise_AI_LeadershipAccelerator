import React, { useState, useEffect } from 'react';
import SEOHead from '../components/SEOHead';
import api from '../utils/api';

interface Cohort {
  id: string;
  name: string;
  start_date: string;
  core_day: string;
  core_time: string;
  optional_lab_day: string | null;
  max_seats: number;
  seats_taken: number;
}

interface FormErrors {
  [key: string]: string;
}

function EnrollPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loadingCohorts, setLoadingCohorts] = useState(true);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    company: '',
    title: '',
    phone: '',
    company_size: '',
    cohort_id: '',
  });
  const [paymentOption, setPaymentOption] = useState<'credit_card' | 'invoice'>('credit_card');
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [invoiceSubmitted, setInvoiceSubmitted] = useState(false);

  useEffect(() => {
    api
      .get('/api/cohorts')
      .then((res) => {
        const openCohorts = (res.data.cohorts || []).filter(
          (c: Cohort) => c.seats_taken < c.max_seats
        );
        setCohorts(openCohorts);
        if (openCohorts.length === 1) {
          setFormData((prev) => ({ ...prev, cohort_id: openCohorts[0].id }));
        }
      })
      .catch(() => setCohorts([]))
      .finally(() => setLoadingCohorts(false));
  }, []);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.full_name.trim()) newErrors.full_name = 'Full name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (!formData.company.trim()) newErrors.company = 'Company is required';
    if (!formData.cohort_id) newErrors.cohort_id = 'Please select a cohort';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
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
      if (paymentOption === 'credit_card') {
        const res = await api.post('/api/create-checkout-session', {
          ...formData,
        });
        // Redirect to Stripe Checkout
        window.location.href = res.data.url;
      } else {
        await api.post('/api/create-invoice-request', { ...formData });
        setInvoiceSubmitted(true);
      }
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.details) {
        const fieldErrors: FormErrors = {};
        err.response.data.details.forEach(
          (d: { field: string; message: string }) => {
            fieldErrors[d.field] = d.message;
          }
        );
        setErrors(fieldErrors);
      } else {
        setServerError(
          err.response?.data?.error || 'Something went wrong. Please try again later.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <>
      <SEOHead
        title="Enroll"
        description="Enroll in the Enterprise AI Leadership Accelerator. $4,500 per participant — pay by credit card or request a corporate invoice."
      />

      {/* Hero */}
      <section
        className="hero-bg text-light py-5"
        aria-label="Page Header"
        style={{
          backgroundImage:
            'url(https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1920&q=80)',
        }}
      >
        <div className="container text-center py-4">
          <img
            src="/colaberry-icon.png"
            alt=""
            width="44"
            height="44"
            className="mb-3 logo-hero"
          />
          <h1 className="display-5 fw-bold text-light">
            Enroll in the Enterprise AI Leadership Accelerator
          </h1>
          <p className="lead">
            $4,500 per participant — pay by credit card or request a corporate invoice
          </p>
        </div>
      </section>

      {/* Enrollment Form */}
      <section className="section" aria-label="Enrollment Form">
        <div className="container" style={{ maxWidth: '700px' }}>
          {invoiceSubmitted ? (
            <div className="text-center py-5" role="alert">
              <h2 className="text-success mb-3">✅ Invoice Request Received</h2>
              <p className="fs-5 mb-4">
                Our Enterprise AI team will contact you within one business day with
                invoice details and next steps.
              </p>
              <p className="text-muted">
                If your inquiry is time-sensitive, reach us at{' '}
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
                {/* Cohort Selector */}
                <div className="col-12">
                  <label htmlFor="cohort_id" className="form-label">
                    Select Cohort <span className="text-danger">*</span>
                  </label>
                  {loadingCohorts ? (
                    <div className="text-muted">Loading available cohorts...</div>
                  ) : cohorts.length === 0 ? (
                    <div className="alert alert-info">
                      No cohorts are currently accepting enrollment. Please check back
                      soon or{' '}
                      <a href="/contact">contact us</a> for upcoming dates.
                    </div>
                  ) : (
                    <select
                      className={`form-select ${errors.cohort_id ? 'is-invalid' : ''}`}
                      id="cohort_id"
                      name="cohort_id"
                      value={formData.cohort_id}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Choose a cohort...</option>
                      {cohorts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — Starts {formatDate(c.start_date)} (
                          {c.max_seats - c.seats_taken} seats remaining)
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.cohort_id && (
                    <div className="invalid-feedback">{errors.cohort_id}</div>
                  )}
                </div>

                {/* Full Name */}
                <div className="col-md-6">
                  <label htmlFor="full_name" className="form-label">
                    Full Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control ${errors.full_name ? 'is-invalid' : ''}`}
                    id="full_name"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    required
                  />
                  {errors.full_name && (
                    <div className="invalid-feedback">{errors.full_name}</div>
                  )}
                </div>

                {/* Email */}
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
                  />
                  {errors.email && (
                    <div className="invalid-feedback">{errors.email}</div>
                  )}
                </div>

                {/* Company */}
                <div className="col-md-6">
                  <label htmlFor="company" className="form-label">
                    Company <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control ${errors.company ? 'is-invalid' : ''}`}
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    required
                  />
                  {errors.company && (
                    <div className="invalid-feedback">{errors.company}</div>
                  )}
                </div>

                {/* Title */}
                <div className="col-md-6">
                  <label htmlFor="title" className="form-label">
                    Title
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                  />
                </div>

                {/* Phone */}
                <div className="col-md-6">
                  <label htmlFor="phone" className="form-label">
                    Phone
                  </label>
                  <input
                    type="tel"
                    className="form-control"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>

                {/* Company Size */}
                <div className="col-md-6">
                  <label htmlFor="company_size" className="form-label">
                    Company Size
                  </label>
                  <select
                    className="form-select"
                    id="company_size"
                    name="company_size"
                    value={formData.company_size}
                    onChange={handleChange}
                  >
                    <option value="">Select...</option>
                    <option value="1-49">1–49 employees</option>
                    <option value="50-249">50–249 employees</option>
                    <option value="250-999">250–999 employees</option>
                    <option value="1000-4999">1,000–4,999 employees</option>
                    <option value="5000+">5,000+ employees</option>
                  </select>
                </div>

                {/* Payment Option */}
                <div className="col-12">
                  <label className="form-label fw-bold">Payment Option</label>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <div
                        className={`card h-100 p-3 cursor-pointer ${
                          paymentOption === 'credit_card'
                            ? 'border-primary border-2'
                            : 'border'
                        }`}
                        onClick={() => setPaymentOption('credit_card')}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="radio"
                            name="paymentOption"
                            id="payment_cc"
                            checked={paymentOption === 'credit_card'}
                            onChange={() => setPaymentOption('credit_card')}
                          />
                          <label
                            className="form-check-label fw-bold"
                            htmlFor="payment_cc"
                          >
                            💳 Pay by Credit Card
                          </label>
                          <p className="text-muted small mb-0 mt-1">
                            Secure payment via Stripe — $4,500
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div
                        className={`card h-100 p-3 ${
                          paymentOption === 'invoice'
                            ? 'border-primary border-2'
                            : 'border'
                        }`}
                        onClick={() => setPaymentOption('invoice')}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="radio"
                            name="paymentOption"
                            id="payment_invoice"
                            checked={paymentOption === 'invoice'}
                            onChange={() => setPaymentOption('invoice')}
                          />
                          <label
                            className="form-check-label fw-bold"
                            htmlFor="payment_invoice"
                          >
                            🏢 Request Corporate Invoice
                          </label>
                          <p className="text-muted small mb-0 mt-1">
                            Our team will send an invoice within 1 business day
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <div className="col-12 mt-4">
                  <button
                    type="submit"
                    className="btn btn-primary btn-lg w-100"
                    disabled={submitting || cohorts.length === 0}
                  >
                    {submitting
                      ? 'Processing...'
                      : paymentOption === 'credit_card'
                      ? '💳 Proceed to Payment'
                      : '🏢 Request Invoice'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Trust Signals */}
      <section className="section-alt" aria-label="Trust Signals">
        <div className="container">
          <div className="row g-4 text-center">
            <div className="col-md-4">
              <div className="fs-2 mb-2" aria-hidden="true">🔒</div>
              <h3 className="h6">Secure Payment</h3>
              <p className="text-muted small mb-0">
                Payments processed securely via Stripe
              </p>
            </div>
            <div className="col-md-4">
              <div className="fs-2 mb-2" aria-hidden="true">📋</div>
              <h3 className="h6">Invoice Available</h3>
              <p className="text-muted small mb-0">
                Corporate invoice option for procurement teams
              </p>
            </div>
            <div className="col-md-4">
              <div className="fs-2 mb-2" aria-hidden="true">📧</div>
              <h3 className="h6">Instant Confirmation</h3>
              <p className="text-muted small mb-0">
                Enrollment confirmation and details sent immediately
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default EnrollPage;
