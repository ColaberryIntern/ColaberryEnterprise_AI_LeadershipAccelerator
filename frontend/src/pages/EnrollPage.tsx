import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import api from '../utils/api';
import { PROGRAM_SCHEDULE } from '../config/programSchedule';
import { getUTMPayloadFields } from '../services/utmService';
import { Cohort } from '../models/Cohort';
import CohortUrgencyBadge from '../components/CohortUrgencyBadge';
import StrategyCallModal from '../components/StrategyCallModal';

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

  const [cohortError, setCohortError] = useState(false);
  const [showBooking, setShowBooking] = useState(false);

  useEffect(() => {
    api
      .get('/api/cohorts')
      .then((res) => {
        const today = new Date().toISOString().split('T')[0];
        const allCohorts = res.data.cohorts || [];
        const openCohorts = allCohorts.filter(
          (c: Cohort) => c.seats_taken < c.max_seats && c.start_date >= today
        );

        if (allCohorts.length > 0 && openCohorts.length === 0) {
          console.warn('[EnrollPage] Cohorts exist but none pass filters:', {
            total: allCohorts.length,
            reasons: allCohorts.map((c: Cohort) => ({
              id: c.id,
              name: c.name,
              start_date: c.start_date,
              seats_remaining: c.max_seats - c.seats_taken,
              pastDate: c.start_date < today,
              full: c.seats_taken >= c.max_seats,
            })),
          });
        }

        setCohorts(openCohorts);
        if (openCohorts.length === 1) {
          setFormData((prev) => ({ ...prev, cohort_id: openCohorts[0].id }));
        }
      })
      .catch(() => {
        setCohorts([]);
        setCohortError(true);
      })
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
      const trackingData = {
        ...getUTMPayloadFields(),
        form_type: 'enrollment',
      };

      if (paymentOption === 'credit_card') {
        const res = await api.post('/api/create-invoice', {
          ...formData,
          ...trackingData,
        });
        // Redirect to PaySimple hosted payment page
        window.location.href = res.data.payment_link;
      } else {
        await api.post('/api/create-invoice-request', {
          ...formData,
          ...trackingData,
        });
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
        description="Enroll in the Enterprise AI Leadership Accelerator. Pay by credit card, ACH, or request a corporate invoice."
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
            {PROGRAM_SCHEDULE.price} per participant — pay by credit card or request a corporate invoice
          </p>
          {cohorts.length > 0 && (
            <CohortUrgencyBadge
              startDate={cohorts[0].start_date}
              seatsRemaining={cohorts[0].max_seats - cohorts[0].seats_taken}
              className="mt-3"
            />
          )}
        </div>
      </section>

      {/* Enrollment Form */}
      <section className="section" aria-label="Enrollment Form">
        <div className="container content-narrow">
          {invoiceSubmitted ? (
            <div className="py-4">
              <div className="text-center mb-4">
                <h2 className="mb-2" style={{ color: 'var(--color-primary)' }}>
                  Your Seat is Reserved
                </h2>
                <span className="badge bg-warning text-dark fs-6 px-3 py-2">
                  Pending Payment
                </span>
              </div>

              <div className="card border-warning mb-4">
                <div className="card-body">
                  <p className="mb-3">
                    A confirmation email with payment instructions has been sent to{' '}
                    <strong>{formData.email}</strong>.
                  </p>
                  <p className="mb-3">
                    Your seat is temporarily reserved. To fully confirm your spot,
                    payment must be completed.
                  </p>
                  <p className="text-muted small mb-0">
                    Seats are only guaranteed once payment is received. Due to limited
                    capacity, we recommend completing payment as soon as possible.
                    If you don't see the email, check your spam or promotions folder.
                  </p>
                </div>
              </div>

              <div className="card border-0 shadow-sm p-4 mb-4">
                <h3 className="h5 mb-3" style={{ color: 'var(--color-primary)' }}>
                  Next Steps
                </h3>
                <ol className="fs-5 mb-0" style={{ lineHeight: 2 }}>
                  <li>Check your email for the confirmation and payment instructions</li>
                  <li>Complete payment (credit card or ACH)</li>
                  <li>Receive your enrollment confirmation and onboarding access</li>
                </ol>
              </div>

              <div className="d-flex justify-content-center gap-3 flex-wrap mb-4">
                <button
                  className="btn btn-primary btn-lg"
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      const res = await api.post('/api/create-invoice', formData);
                      window.location.href = res.data.payment_link;
                    } catch {
                      setServerError('Unable to create payment link. Please try again.');
                      setInvoiceSubmitted(false);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  disabled={submitting}
                >
                  {submitting ? 'Setting up payment...' : 'Complete Payment Now'}
                </button>
                <button className="btn btn-outline-primary btn-lg" onClick={() => setShowBooking(true)}>
                  Schedule an AI Strategy Call
                </button>
              </div>

              <p className="text-center text-muted small">
                Secure payment via PaySimple (credit card or ACH)
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
                  ) : cohortError ? (
                    <div className="alert alert-warning">
                      Unable to load cohort information. Please try again later or{' '}
                      <Link to="/contact">contact us</Link> directly.
                    </div>
                  ) : cohorts.length === 0 ? (
                    <div className="alert alert-info">
                      No upcoming cohorts are currently available. Please check back
                      soon or{' '}
                      <Link to="/contact">contact us</Link> for private cohort options.
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
                        className={`card h-100 p-3 ${
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
                            Pay Now (Credit Card / ACH)
                          </label>
                          <p className="text-muted small mb-0 mt-1">
                            Secure payment via PaySimple — {PROGRAM_SCHEDULE.price}
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
                            Request Corporate Invoice
                          </label>
                          <p className="text-muted small mb-0 mt-1">
                            For procurement teams — invoice sent within 1 business day
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
                    {submitting ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        />
                        {paymentOption === 'credit_card'
                          ? 'Setting up payment...'
                          : 'Reserving your seat...'}
                      </>
                    ) : paymentOption === 'credit_card' ? (
                      'Proceed to Payment'
                    ) : (
                      'Request Invoice'
                    )}
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
                Payments processed securely via PaySimple
              </p>
            </div>
            <div className="col-md-4">
              <div className="fs-2 mb-2" aria-hidden="true">🏢</div>
              <h3 className="h6">Invoice Available</h3>
              <p className="text-muted small mb-0">
                Corporate invoice option for procurement teams
              </p>
            </div>
            <div className="col-md-4">
              <div className="fs-2 mb-2" aria-hidden="true">✔</div>
              <h3 className="h6">Instant Confirmation</h3>
              <p className="text-muted small mb-0">
                Enrollment confirmation sent immediately
              </p>
            </div>
          </div>
        </div>
      </section>

      <StrategyCallModal show={showBooking} onClose={() => setShowBooking(false)} pageOrigin="/enroll" />
    </>
  );
}

export default EnrollPage;
