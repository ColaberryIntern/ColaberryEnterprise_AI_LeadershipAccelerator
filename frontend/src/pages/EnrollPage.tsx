import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import api from '../utils/api';
import { getUTMPayloadFields } from '../services/utmService';
import { Cohort } from '../models/Cohort';
import CohortUrgencyBadge from '../components/CohortUrgencyBadge';
import StrategyCallModal from '../components/StrategyCallModal';
import { Card } from '../colaberry/components/core/Card';
import { Button } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Input } from '../colaberry/components/core/Input';

interface FormErrors {
  [key: string]: string;
}

interface SponsorErrors {
  [key: string]: string;
}

// Shared styling for native <select> controls so they visually match the DS Input.
const selectStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--fs-body)',
  color: 'var(--text-strong)',
  background: 'var(--surface-card)',
  border: 'var(--border-1) solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  width: '100%',
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 'var(--fs-body-sm)',
  fontWeight: 500,
  color: 'var(--text-strong)',
  display: 'block',
  marginBottom: 'var(--space-1)',
};

const errorMsgStyle: React.CSSProperties = {
  fontSize: 'var(--fs-caption)',
  color: 'var(--red-600)',
  marginTop: 'var(--space-1)',
  display: 'block',
};

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

  // --- Sponsor code redemption (Door B) ---
  const [sponsorData, setSponsorData] = useState({
    code: '',
    full_name: '',
    email: '',
  });
  const [sponsorErrors, setSponsorErrors] = useState<SponsorErrors>({});
  const [sponsorServerError, setSponsorServerError] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemed, setRedeemed] = useState(false);

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

  // --- Sponsor code redemption handlers (Door B) ---
  const handleSponsorChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    const nextValue = name === 'code' ? value.toUpperCase() : value;
    setSponsorData((prev) => ({ ...prev, [name]: nextValue }));
    if (sponsorErrors[name]) {
      setSponsorErrors((prev) => ({ ...prev, [name]: '' }));
    }
    if (sponsorServerError) setSponsorServerError('');
  };

  const validateSponsor = (): boolean => {
    const next: SponsorErrors = {};
    if (!sponsorData.code.trim()) next.code = 'Enter the sponsor code from your employer';
    if (!sponsorData.full_name.trim()) next.full_name = 'Full name is required';
    if (!sponsorData.email.trim()) {
      next.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sponsorData.email)) {
      next.email = 'Please enter a valid email address';
    }
    setSponsorErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSponsorRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setSponsorServerError('');

    if (!validateSponsor()) return;

    setRedeeming(true);
    try {
      await api.post('/api/sponsor/redeem', {
        code: sponsorData.code.trim(),
        full_name: sponsorData.full_name.trim(),
        email: sponsorData.email.trim(),
        ...getUTMPayloadFields(),
        form_type: 'sponsor_redemption',
      });
      setRedeemed(true);
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.details) {
        const fieldErrors: SponsorErrors = {};
        err.response.data.details.forEach(
          (d: { field: string; message: string }) => {
            fieldErrors[d.field] = d.message;
          }
        );
        setSponsorErrors(fieldErrors);
      } else {
        setSponsorServerError(
          err.response?.data?.error ||
            'We could not redeem that code. Check it with your employer and try again.'
        );
      }
    } finally {
      setRedeeming(false);
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
        description="Enroll in the Colaberry AI Challenge. Join as an individual, or redeem a sponsor code from your employer."
      />

      {/* Hero */}
      <section
        aria-label="Page Header"
        style={{
          background: 'var(--surface-inverse)',
          color: 'var(--text-on-accent)',
          padding: 'var(--space-16) var(--space-4)',
        }}
      >
        <div
          className="container text-center"
          style={{ maxWidth: 820, margin: '0 auto' }}
        >
          <img
            src="/colaberry-icon.png"
            alt=""
            width="44"
            height="44"
            style={{ marginBottom: 'var(--space-4)' }}
          />
          <h1
            className="cb-balance"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-display)',
              fontWeight: 900,
              color: 'var(--text-on-accent)',
              marginBottom: 'var(--space-3)',
            }}
          >
            Join the Challenge
          </h1>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              color: 'var(--text-on-accent)',
              opacity: 0.9,
              marginBottom: 'var(--space-2)',
            }}
          >
            Most people consume AI. Very few learn to build with it. Claim your seat
            below, or redeem a code from your employer.
          </p>
          {cohorts.length > 0 && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <CohortUrgencyBadge
                startDate={cohorts[0].start_date}
                seatsRemaining={cohorts[0].max_seats - cohorts[0].seats_taken}
              />
            </div>
          )}
        </div>
      </section>

      {/* Enrollment Form */}
      <section
        aria-label="Enrollment Form"
        style={{
          background: 'var(--surface-page)',
          padding: 'var(--space-16) var(--space-4)',
        }}
      >
        <div className="container" style={{ maxWidth: 760, margin: '0 auto' }}>
          {invoiceSubmitted ? (
            <div role="status">
              <div className="text-center" style={{ marginBottom: 'var(--space-6)' }}>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-h2)',
                    fontWeight: 900,
                    color: 'var(--text-strong)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  Your Seat is Reserved
                </h2>
                <Badge tone="warning" dot>
                  Pending Payment
                </Badge>
              </div>

              <Card accent="red" padded style={{ marginBottom: 'var(--space-5)' }}>
                <p style={{ marginBottom: 'var(--space-3)', color: 'var(--text-body)' }}>
                  A confirmation email with payment instructions has been sent to{' '}
                  <strong style={{ color: 'var(--text-strong)' }}>{formData.email}</strong>.
                </p>
                <p style={{ marginBottom: 'var(--space-3)', color: 'var(--text-body)' }}>
                  Your seat is temporarily reserved. To fully confirm your spot, payment
                  must be completed.
                </p>
                <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginBottom: 0 }}>
                  Seats are only guaranteed once payment is received. Due to limited
                  capacity, we recommend completing payment as soon as possible. If you
                  don't see the email, check your spam or promotions folder.
                </p>
              </Card>

              <Card padded style={{ marginBottom: 'var(--space-5)' }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-h3)',
                    fontWeight: 700,
                    color: 'var(--text-strong)',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  Next Steps
                </h3>
                <ol style={{ lineHeight: 2, marginBottom: 0, color: 'var(--text-body)' }}>
                  <li>Check your email for the confirmation and payment instructions</li>
                  <li>Complete payment (credit card or ACH)</li>
                  <li>Receive your enrollment confirmation and onboarding access</li>
                </ol>
              </Card>

              <div
                className="d-flex justify-content-center flex-wrap"
                style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}
              >
                <Button
                  size="lg"
                  disabled={submitting}
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
                >
                  {submitting ? 'Setting up payment...' : 'Complete Payment Now'}
                </Button>
                <Button variant="outline" size="lg" onClick={() => setShowBooking(true)}>
                  Schedule an AI Strategy Call
                </Button>
              </div>

              <p
                className="text-center"
                style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)' }}
              >
                Secure payment via PaySimple (credit card or ACH)
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {serverError && (
                <Card
                  accent="red"
                  padded
                  role="alert"
                  style={{ marginBottom: 'var(--space-5)', color: 'var(--status-danger)' }}
                >
                  {serverError}
                </Card>
              )}

              <div className="row g-3">
                {/* Cohort Selector */}
                <div className="col-12">
                  <label htmlFor="cohort_id" style={fieldLabelStyle}>
                    Select Cohort{' '}
                    <span style={{ color: 'var(--red-500)' }} aria-hidden="true">
                      *
                    </span>
                  </label>
                  {loadingCohorts ? (
                    <div style={{ color: 'var(--text-muted)' }} aria-live="polite">
                      Loading available cohorts...
                    </div>
                  ) : cohortError ? (
                    <Card accent="blue" padded>
                      Unable to load cohort information. Please try again later or{' '}
                      <Link to="/contact">contact us</Link> directly.
                    </Card>
                  ) : cohorts.length === 0 ? (
                    <Card accent="blue" padded>
                      No upcoming cohorts are currently available. Please check back soon
                      or <Link to="/contact">contact us</Link> for private cohort options.
                    </Card>
                  ) : (
                    <select
                      style={{
                        ...selectStyle,
                        borderColor: errors.cohort_id
                          ? 'var(--red-500)'
                          : 'var(--border-default)',
                      }}
                      id="cohort_id"
                      name="cohort_id"
                      value={formData.cohort_id}
                      onChange={handleChange}
                      aria-invalid={!!errors.cohort_id}
                      aria-describedby={errors.cohort_id ? 'cohort_id-error' : undefined}
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
                    <span id="cohort_id-error" role="alert" style={errorMsgStyle}>
                      {errors.cohort_id}
                    </span>
                  )}
                </div>

                {/* Full Name */}
                <div className="col-md-6">
                  <Input
                    label="Full Name"
                    required
                    id="full_name"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    error={errors.full_name}
                  />
                </div>

                {/* Email */}
                <div className="col-md-6">
                  <Input
                    label="Email"
                    required
                    type="email"
                    id="email"
                    name="email"
                    autoComplete="email"
                    value={formData.email}
                    onChange={handleChange}
                    error={errors.email}
                  />
                </div>

                {/* Company */}
                <div className="col-md-6">
                  <Input
                    label="Company"
                    required
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    error={errors.company}
                  />
                </div>

                {/* Title */}
                <div className="col-md-6">
                  <Input
                    label="Title"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                  />
                </div>

                {/* Phone */}
                <div className="col-md-6">
                  <Input
                    label="Phone"
                    type="tel"
                    id="phone"
                    name="phone"
                    autoComplete="tel"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>

                {/* Company Size */}
                <div className="col-md-6">
                  <label htmlFor="company_size" style={fieldLabelStyle}>
                    Company Size
                  </label>
                  <select
                    style={selectStyle}
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
                <div className="col-12" role="radiogroup" aria-label="Payment option">
                  <span style={{ ...fieldLabelStyle, fontWeight: 700 }}>
                    Payment Option
                  </span>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <Card
                        padded
                        hoverable
                        accent={paymentOption === 'credit_card' ? 'red' : undefined}
                        onClick={() => setPaymentOption('credit_card')}
                        style={{ cursor: 'pointer', height: '100%' }}
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
                            className="form-check-label"
                            htmlFor="payment_cc"
                            style={{ fontWeight: 700, color: 'var(--text-strong)' }}
                          >
                            Pay Now (Credit Card / ACH)
                          </label>
                          <p
                            style={{
                              fontSize: 'var(--fs-body-sm)',
                              color: 'var(--text-muted)',
                              marginBottom: 0,
                              marginTop: 'var(--space-1)',
                            }}
                          >
                            Secure payment via PaySimple
                          </p>
                        </div>
                      </Card>
                    </div>
                    <div className="col-md-6">
                      <Card
                        padded
                        hoverable
                        accent={paymentOption === 'invoice' ? 'red' : undefined}
                        onClick={() => setPaymentOption('invoice')}
                        style={{ cursor: 'pointer', height: '100%' }}
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
                            className="form-check-label"
                            htmlFor="payment_invoice"
                            style={{ fontWeight: 700, color: 'var(--text-strong)' }}
                          >
                            Request Corporate Invoice
                          </label>
                          <p
                            style={{
                              fontSize: 'var(--fs-body-sm)',
                              color: 'var(--text-muted)',
                              marginBottom: 0,
                              marginTop: 'var(--space-1)',
                            }}
                          >
                            For procurement teams — invoice sent within 1 business day
                          </p>
                        </div>
                      </Card>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <div className="col-12" style={{ marginTop: 'var(--space-5)' }}>
                  <Button
                    type="submit"
                    size="lg"
                    fullWidth
                    disabled={submitting || cohorts.length === 0}
                  >
                    {submitting
                      ? paymentOption === 'credit_card'
                        ? 'Setting up payment...'
                        : 'Reserving your seat...'
                      : paymentOption === 'credit_card'
                      ? 'Proceed to Payment'
                      : 'Request Invoice'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Sponsor Code Redemption (Door B) */}
      <section
        aria-label="Redeem a Sponsor Code"
        style={{
          background: 'var(--surface-sunken)',
          padding: 'var(--space-16) var(--space-4)',
          borderTop: 'var(--border-1) solid var(--border-subtle)',
        }}
      >
        <div className="container" style={{ maxWidth: 640, margin: '0 auto' }}>
          <div className="text-center" style={{ marginBottom: 'var(--space-6)' }}>
            <Badge tone="blue" style={{ marginBottom: 'var(--space-3)' }}>
              Employer-sponsored
            </Badge>
            <h2
              className="cb-balance"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-h2)',
                fontWeight: 900,
                color: 'var(--text-strong)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Have a sponsor code?
            </h2>
            <p
              style={{
                fontSize: 'var(--fs-body-lg)',
                color: 'var(--text-muted)',
                marginBottom: 0,
              }}
            >
              Your employer reserved a seat for you. Redeem your code to claim it — no
              payment required. Learn on your own time and climb your company leaderboard.
            </p>
          </div>

          <Card padded elevation="md">
            {redeemed ? (
              <div className="text-center" role="status">
                <Badge tone="green" dot style={{ marginBottom: 'var(--space-3)' }}>
                  Seat Claimed
                </Badge>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-h3)',
                    fontWeight: 700,
                    color: 'var(--text-strong)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  You're in.
                </h3>
                <p style={{ color: 'var(--text-body)', marginBottom: 'var(--space-1)' }}>
                  We've redeemed code{' '}
                  <strong style={{ color: 'var(--text-strong)' }}>{sponsorData.code}</strong>{' '}
                  and sent onboarding details to{' '}
                  <strong style={{ color: 'var(--text-strong)' }}>{sponsorData.email}</strong>.
                </p>
                <p
                  style={{
                    fontSize: 'var(--fs-body-sm)',
                    color: 'var(--text-muted)',
                    marginBottom: 0,
                  }}
                >
                  Check your inbox to set up your account and start building. If you don't
                  see it, check your spam or promotions folder.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSponsorRedeem} noValidate>
                {sponsorServerError && (
                  <div
                    role="alert"
                    style={{
                      color: 'var(--status-danger)',
                      fontSize: 'var(--fs-body-sm)',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    {sponsorServerError}
                  </div>
                )}

                <div className="d-flex flex-column" style={{ gap: 'var(--space-4)' }}>
                  <Input
                    label="Sponsor Code"
                    required
                    id="sponsor_code"
                    name="code"
                    placeholder="e.g. ACME-2026-7QX4"
                    autoComplete="off"
                    value={sponsorData.code}
                    onChange={handleSponsorChange}
                    error={sponsorErrors.code}
                    helperText={
                      sponsorErrors.code
                        ? undefined
                        : 'Provided by your employer when they sponsored your seat.'
                    }
                  />
                  <Input
                    label="Full Name"
                    required
                    id="sponsor_full_name"
                    name="full_name"
                    autoComplete="name"
                    value={sponsorData.full_name}
                    onChange={handleSponsorChange}
                    error={sponsorErrors.full_name}
                  />
                  <Input
                    label="Work Email"
                    required
                    type="email"
                    id="sponsor_email"
                    name="email"
                    autoComplete="email"
                    value={sponsorData.email}
                    onChange={handleSponsorChange}
                    error={sponsorErrors.email}
                  />

                  <Button type="submit" size="lg" fullWidth disabled={redeeming}>
                    {redeeming ? 'Redeeming code...' : 'Redeem & Claim My Seat'}
                  </Button>
                </div>
              </form>
            )}
          </Card>

          <p
            className="text-center"
            style={{
              fontSize: 'var(--fs-body-sm)',
              color: 'var(--text-muted)',
              marginTop: 'var(--space-4)',
              marginBottom: 0,
            }}
          >
            Are you an employer who wants to sponsor your team?{' '}
            <Link to="/contact">Talk to us about team seats.</Link>
          </p>
        </div>
      </section>

      {/* Trust Signals */}
      <section
        aria-label="Trust Signals"
        style={{
          background: 'var(--surface-page)',
          padding: 'var(--space-16) var(--space-4)',
        }}
      >
        <div className="container">
          <div className="row g-4 text-center">
            <div className="col-md-4">
              <div style={{ fontSize: 'var(--fs-h1)', marginBottom: 'var(--space-2)' }} aria-hidden="true">
                🔒
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-h4)',
                  fontWeight: 700,
                  color: 'var(--text-strong)',
                }}
              >
                Secure Payment
              </h3>
              <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginBottom: 0 }}>
                Payments processed securely via PaySimple
              </p>
            </div>
            <div className="col-md-4">
              <div style={{ fontSize: 'var(--fs-h1)', marginBottom: 'var(--space-2)' }} aria-hidden="true">
                🏢
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-h4)',
                  fontWeight: 700,
                  color: 'var(--text-strong)',
                }}
              >
                Invoice & Sponsor Codes
              </h3>
              <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginBottom: 0 }}>
                Corporate invoices and employer-sponsored seats supported
              </p>
            </div>
            <div className="col-md-4">
              <div style={{ fontSize: 'var(--fs-h1)', marginBottom: 'var(--space-2)' }} aria-hidden="true">
                ✔
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-h4)',
                  fontWeight: 700,
                  color: 'var(--text-strong)',
                }}
              >
                Instant Confirmation
              </h3>
              <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginBottom: 0 }}>
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
