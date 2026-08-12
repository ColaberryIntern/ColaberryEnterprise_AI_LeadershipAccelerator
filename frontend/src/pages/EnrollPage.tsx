import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import api from '../utils/api';
import { getUTMPayloadFields } from '../services/utmService';
import { trackEvent } from '../utils/tracker';
import { markOncePerSession } from '../utils/oncePerSession';
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

function EnrollPage() {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    company: '',
    title: '',
    phone: '',
    company_size: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);

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

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.full_name.trim()) newErrors.full_name = 'Full name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Explorer Growth OS §6.2 tier-3 intent. Fires on the first real field
  // interaction, NOT on mount — on mount it would emit for every page view and
  // become a tier-1 view signal wearing a tier-3 label, corrupting the
  // HIGH_INTENT gate that decides who gets contacted.
  const signalFormStart = (): void => {
    if (markOncePerSession('form_start:enroll')) {
      trackEvent('form_start', { form: 'enroll' });
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    signalFormStart();
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

      await api.post('/api/create-free-account', {
        ...formData,
        ...trackingData,
      });
      setSignupComplete(true);
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

  return (
    <>
      <SEOHead
        title="Enroll"
        description="Create your free Colaberry account and start exploring the AI Systems Architect Accelerator, or redeem a sponsor code from your employer."
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
            Start for free
          </h1>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              color: 'var(--text-on-accent)',
              opacity: 0.9,
              marginBottom: 0,
            }}
          >
            Most people consume AI. Very few learn to build with it. Create your
            free account below — no card needed — or redeem a code from your
            employer.
          </p>
        </div>
      </section>

      {/* Enrollment Form */}
      <section
        aria-label="Free Account Signup"
        style={{
          background: 'var(--surface-page)',
          padding: 'var(--space-16) var(--space-4)',
        }}
      >
        <div className="container" style={{ maxWidth: 760, margin: '0 auto' }}>
          {signupComplete ? (
            <div role="status" className="text-center">
              <Badge tone="green" dot style={{ marginBottom: 'var(--space-3)' }}>
                Registration Confirmed
              </Badge>
              <h2
                className="cb-balance"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-h2)',
                  fontWeight: 900,
                  color: 'var(--text-strong)',
                  marginBottom: 'var(--space-3)',
                }}
              >
                You're in. Let's get you started.
              </h2>
              <p style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--text-body)', marginBottom: 'var(--space-6)' }}>
                Your login is on its way to{' '}
                <strong style={{ color: 'var(--text-strong)' }}>{formData.email}</strong> —
                open that email to enter your portal: free AI material, a community
                of builders, and free live events.
              </p>

              <Card padded style={{ marginBottom: 'var(--space-5)', textAlign: 'left' }}>
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
                  <li>Check your email for your sign-in link</li>
                  <li>Click it to enter your free portal — no card required</li>
                  <li>Explore the program, then upgrade whenever you're ready</li>
                </ol>
              </Card>

              <div
                className="d-flex justify-content-center flex-wrap"
                style={{ gap: 'var(--space-3)' }}
              >
                <Button variant="outline" size="lg" onClick={() => setShowBooking(true)}>
                  Schedule an AI Strategy Call
                </Button>
              </div>

              <p
                className="text-center"
                style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}
              >
                If you don't see it, check your spam or promotions folder.
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

                {/* Submit */}
                <div className="col-12" style={{ marginTop: 'var(--space-5)' }}>
                  <Button type="submit" size="lg" fullWidth disabled={submitting}>
                    {submitting ? 'Creating your account...' : 'Create My Free Account'}
                  </Button>
                  <p
                    className="text-center"
                    style={{
                      fontSize: 'var(--fs-body-sm)',
                      color: 'var(--text-muted)',
                      marginTop: 'var(--space-2)',
                      marginBottom: 0,
                    }}
                  >
                    No card required. Upgrade anytime from inside the portal.
                  </p>
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
                🆓
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-h4)',
                  fontWeight: 700,
                  color: 'var(--text-strong)',
                }}
              >
                No Card Needed
              </h3>
              <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', marginBottom: 0 }}>
                Free to start — upgrade anytime from inside the portal
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
                Your sign-in link is emailed immediately
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
