import React, { useState } from 'react';
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import IndustryDemoGrid from '../components/IndustryDemoGrid';
import { EnterpriseLead, toLeadPayload } from '../models/EnterpriseLead';
import { validateForm, ValidationRules } from '../utils/formValidation';
import { getUTMParams } from '../services/utmService';
import api from '../utils/api';
import { Button } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';
import { Input } from '../colaberry/components/core/Input';
import { Textarea } from '../colaberry/components/core/Textarea';
import { Checkbox } from '../colaberry/components/core/Checkbox';

type Segment = 'individual' | 'sponsor';

const COMPANY_SIZES = [
  '1-49 employees',
  '50-249 employees',
  '250-999 employees',
  '1,000-4,999 employees',
  '5,000+ employees',
] as const;

const INDUSTRIES = [
  'Technology',
  'Finance & Banking',
  'Healthcare & Life Sciences',
  'Manufacturing',
  'Energy & Utilities',
  'Retail & eCommerce',
  'Government & Public Sector',
  'Logistics & Supply Chain',
  'Other',
] as const;

const SPONSOR_RULES: ValidationRules = {
  required: ['fullName', 'email', 'company', 'companySize'],
  email: ['email'],
  phone: ['phone'],
};

const INDIVIDUAL_RULES: ValidationRules = {
  required: ['fullName', 'email'],
  email: ['email'],
  phone: ['phone'],
};

const FORM_TYPE: Record<Segment, string> = {
  individual: 'enterprise_inquiry',
  sponsor: 'sponsor_inquiry',
};

interface ContactForm {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  companySize: string;
  industry: string;
  seatsInterest: string;
  message: string;
  consentContact: boolean;
}

const EMPTY_FORM: ContactForm = {
  fullName: '',
  email: '',
  phone: '',
  company: '',
  title: '',
  companySize: '',
  industry: '',
  seatsInterest: '',
  message: '',
  consentContact: false,
};

function ContactPage() {
  const [segment, setSegment] = useState<Segment>('individual');
  const [showBooking, setShowBooking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);

  const isSponsor = segment === 'sponsor';

  const switchSegment = (next: Segment) => {
    if (next === segment) return;
    setSegment(next);
    setErrors({});
    setServerError('');
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    const rules = isSponsor ? SPONSOR_RULES : INDIVIDUAL_RULES;
    const validationErrors = validateForm(
      form as unknown as Record<string, unknown>,
      rules,
    );
    if (!form.consentContact) {
      validationErrors.consentContact = 'You must agree to be contacted';
    }
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      const seatsLine = isSponsor && form.seatsInterest
        ? `Seats of interest: ${form.seatsInterest}`
        : '';
      const composedMessage = [form.message.trim(), seatsLine]
        .filter(Boolean)
        .join('\n');

      const lead: EnterpriseLead = {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || undefined,
        company: form.company || undefined,
        title: form.title || undefined,
        companySize: form.companySize || undefined,
        industry: form.industry || undefined,
        willSeekCorporateSponsorship: isSponsor,
        message: composedMessage || undefined,
        consentContact: form.consentContact,
        formType: FORM_TYPE[segment],
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
        description="Talk to Colaberry. Join the AI Challenge as an individual, or sponsor your team to discover your real AI builders without taking anyone off the job."
      />

      {/* Hero */}
      <section
        aria-label="Page Header"
        style={{
          background: 'var(--surface-inverse)',
          color: 'var(--text-on-accent)',
          padding: 'var(--space-20) 0 var(--space-16)',
        }}
      >
        <div
          className="container text-center"
          style={{ maxWidth: 820 }}
        >
          <Badge tone="red" dot style={{ marginBottom: 'var(--space-5)' }}>
            We respond within one business day
          </Badge>
          <h1
            className="cb-balance"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-display)',
              fontWeight: 900,
              lineHeight: 1.05,
              margin: '0 0 var(--space-4)',
              color: 'var(--text-on-accent)',
            }}
          >
            Most people consume AI.
            <br />
            Very few learn to build with it.
          </h1>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              lineHeight: 1.6,
              opacity: 0.88,
              maxWidth: 620,
              margin: '0 auto',
            }}
          >
            One program, two doors. Join the Challenge yourself, or sponsor your
            team and find out who your real AI builders are.
          </p>
        </div>
      </section>

      {/* Form section */}
      <section
        aria-label="Contact"
        style={{ background: 'var(--surface-sunken)', padding: 'var(--space-16) 0' }}
      >
        <div className="container" style={{ maxWidth: 860 }}>
          {submitted ? (
            <Card elevation="md" padded accent="green" role="alert">
              <div className="text-center" style={{ padding: 'var(--space-6) 0' }}>
                <Badge tone="green" dot style={{ marginBottom: 'var(--space-4)' }}>
                  {isSponsor ? 'Sponsorship inquiry received' : 'Inquiry received'}
                </Badge>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-h2)',
                    color: 'var(--text-strong)',
                    margin: '0 0 var(--space-3)',
                  }}
                >
                  Thanks — we'll be in touch.
                </h2>
                <p
                  style={{
                    fontSize: 'var(--fs-body-lg)',
                    color: 'var(--text-body)',
                    maxWidth: 560,
                    margin: '0 auto var(--space-5)',
                  }}
                >
                  {isSponsor
                    ? 'Our team will reach out to scope annual seats, reassignable codes, and your company-scoped leaderboard so you can discover talent without taking anyone off the job.'
                    : 'Our team will follow up shortly with next steps to join the Challenge.'}
                </p>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                  Time-sensitive? Reach us at{' '}
                  <a href="mailto:info@colaberry.com" style={{ color: 'var(--brand-accent)' }}>
                    info@colaberry.com
                  </a>
                  .
                </p>
              </div>
            </Card>
          ) : (
            <Card elevation="md" padded>
              {/* Segment switcher — the two doors */}
              <div
                role="tablist"
                aria-label="Choose how you'd like to connect"
                style={{
                  display: 'inline-flex',
                  gap: 'var(--space-1)',
                  padding: 'var(--space-1)',
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-pill)',
                  marginBottom: 'var(--space-6)',
                  maxWidth: '100%',
                  flexWrap: 'wrap',
                }}
              >
                <SegmentTab
                  id="contact-tab-individual"
                  controls="contact-form-panel"
                  active={!isSponsor}
                  onClick={() => switchSegment('individual')}
                  label="Join the Challenge"
                  sub="For individuals"
                />
                <SegmentTab
                  id="contact-tab-sponsor"
                  controls="contact-form-panel"
                  active={isSponsor}
                  onClick={() => switchSegment('sponsor')}
                  label="Sponsor Your Team"
                  sub="For employers"
                />
              </div>

              <div
                id="contact-form-panel"
                role="tabpanel"
                aria-labelledby={isSponsor ? 'contact-tab-sponsor' : 'contact-tab-individual'}
              >
              {isSponsor ? (
                <SponsorIntro />
              ) : (
                <IndividualIntro />
              )}

              {serverError && (
                <div
                  role="alert"
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--status-danger)',
                    color: 'var(--status-danger)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3) var(--space-4)',
                    margin: 'var(--space-4) 0',
                    fontSize: 'var(--fs-body-sm)',
                  }}
                >
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <FieldGroup label="Your details">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <Input
                        label="Full name"
                        required
                        name="fullName"
                        value={form.fullName}
                        onChange={handleChange}
                        error={errors.fullName}
                        autoComplete="name"
                      />
                    </div>
                    <div className="col-md-6">
                      <Input
                        label="Work email"
                        required
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        error={errors.email}
                        autoComplete="email"
                      />
                    </div>
                    <div className="col-md-6">
                      <Input
                        label="Phone"
                        type="tel"
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        error={errors.phone}
                        placeholder="+1 (555) 123-4567"
                        autoComplete="tel"
                      />
                    </div>
                    <div className="col-md-6">
                      <Input
                        label={isSponsor ? 'Your title' : 'Title (optional)'}
                        name="title"
                        value={form.title}
                        onChange={handleChange}
                        error={errors.title}
                        autoComplete="organization-title"
                      />
                    </div>
                  </div>
                </FieldGroup>

                {/* Employer block — only the sponsor door requires company + size */}
                <FieldGroup
                  label={isSponsor ? 'Your organization' : 'Company (optional)'}
                >
                  <div className="row g-3">
                    <div className="col-md-6">
                      <Input
                        label="Company"
                        required={isSponsor}
                        name="company"
                        value={form.company}
                        onChange={handleChange}
                        error={errors.company}
                        autoComplete="organization"
                      />
                    </div>
                    <div className="col-md-6">
                      <SelectField
                        label="Company size"
                        required={isSponsor}
                        name="companySize"
                        value={form.companySize}
                        onChange={handleChange}
                        error={errors.companySize}
                        options={COMPANY_SIZES}
                      />
                    </div>
                    <div className="col-md-6">
                      <SelectField
                        label="Industry"
                        name="industry"
                        value={form.industry}
                        onChange={handleChange}
                        options={INDUSTRIES}
                      />
                    </div>
                    {isSponsor && (
                      <div className="col-md-6">
                        <Input
                          label="Seats you're considering"
                          name="seatsInterest"
                          value={form.seatsInterest}
                          onChange={handleChange}
                          placeholder="e.g., 10–25"
                          helperText="Seats are reassignable — reassign if someone leaves."
                        />
                      </div>
                    )}
                  </div>
                </FieldGroup>

                <FieldGroup
                  label={isSponsor ? 'What are you hoping to discover?' : 'Anything to add?'}
                >
                  <Textarea
                    label="Message"
                    name="message"
                    rows={3}
                    value={form.message}
                    onChange={handleChange}
                    placeholder={
                      isSponsor
                        ? 'Tell us about your team and the AI capability you want to surface.'
                        : 'Tell us what you want to build.'
                    }
                  />
                </FieldGroup>

                <div style={{ margin: 'var(--space-5) 0 var(--space-6)' }}>
                  <Checkbox
                    name="consentContact"
                    checked={form.consentContact}
                    onChange={handleChange}
                    label={
                      <span style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-body)' }}>
                        I agree to be contacted by Colaberry about the AI Challenge.{' '}
                        <span style={{ color: 'var(--status-danger)' }}>*</span>
                      </span>
                    }
                  />
                  {errors.consentContact && (
                    <div
                      style={{
                        color: 'var(--status-danger)',
                        fontSize: 'var(--fs-body-sm)',
                        marginTop: 'var(--space-1)',
                      }}
                    >
                      {errors.consentContact}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={submitting}
                >
                  {submitting
                    ? 'Submitting…'
                    : isSponsor
                      ? 'Sponsor Your Team'
                      : 'Join the Challenge'}
                </Button>
              </form>

              <p
                className="text-center"
                style={{
                  color: 'var(--text-muted)',
                  fontSize: 'var(--fs-body-sm)',
                  margin: 'var(--space-5) 0 0',
                  paddingTop: 'var(--space-4)',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                We never sell your information. Your data is used solely to respond to your request.
              </p>
              </div>
            </Card>
          )}
        </div>
      </section>

      <div className="container" style={{ maxWidth: 900 }}>
        <IndustryDemoGrid trackContext="contact" />
      </div>

      {/* Strategy Call CTA */}
      <section
        aria-label="Schedule Strategy Call"
        className="text-center"
        style={{
          background: 'var(--surface-inverse)',
          color: 'var(--text-on-accent)',
          padding: 'var(--space-20) 0',
        }}
      >
        <div className="container" style={{ maxWidth: 760 }}>
          <h2
            className="cb-balance"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-h1)',
              fontWeight: 900,
              color: 'var(--text-on-accent)',
              margin: '0 0 var(--space-3)',
            }}
          >
            Learn With Claude. Build Through Colaberry. Deploy In The Real World.
          </h2>
          <p
            style={{
              fontSize: 'var(--fs-body-lg)',
              opacity: 0.85,
              margin: '0 auto var(--space-6)',
              maxWidth: 580,
            }}
          >
            Prefer to talk it through first? Book a 30-minute session to map seats,
            timing, and how the company-scoped leaderboard works.
          </p>
          <Button variant="solid" tone="red" size="lg" onClick={() => setShowBooking(true)}>
            Schedule an Executive AI Strategy Call
          </Button>
          <div
            className="d-flex justify-content-center gap-4 flex-wrap"
            style={{ opacity: 0.7, marginTop: 'var(--space-6)' }}
          >
            <span style={{ fontSize: 'var(--fs-body-sm)' }}>30-minute focused session</span>
            <span style={{ fontSize: 'var(--fs-body-sm)' }}>No obligation</span>
            <span style={{ fontSize: 'var(--fs-body-sm)' }}>Talent discovery, not training</span>
          </div>
        </div>
      </section>

      {/* Contact Info */}
      <section
        aria-label="Contact Information"
        style={{ background: 'var(--surface-page)', padding: 'var(--space-16) 0' }}
      >
        <div className="container">
          <div className="row g-4">
            <div className="col-md-4">
              <Card elevation="sm" padded hoverable style={{ height: '100%' }}>
                <h3 style={infoTitle}>Email</h3>
                <p style={infoBody}>
                  <a href="mailto:info@colaberry.com" style={{ color: 'var(--brand-accent)' }}>
                    info@colaberry.com
                  </a>
                </p>
              </Card>
            </div>
            <div className="col-md-4">
              <Card elevation="sm" padded hoverable style={{ height: '100%' }}>
                <h3 style={infoTitle}>Social</h3>
                <p style={infoBody}>
                  <a
                    href="https://www.linkedin.com/company/colaberry"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--brand-accent)' }}
                  >
                    LinkedIn
                  </a>
                  {' · '}
                  <a
                    href="https://twitter.com/Colaberry"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--brand-accent)' }}
                  >
                    Twitter
                  </a>
                </p>
              </Card>
            </div>
            <div className="col-md-4">
              <Card elevation="sm" padded hoverable style={{ height: '100%' }}>
                <h3 style={infoTitle}>Strategy Call</h3>
                <p style={{ ...infoBody, marginBottom: 'var(--space-3)' }}>
                  Book a 30-minute call with our team.
                </p>
                <Button variant="outline" size="sm" onClick={() => setShowBooking(true)}>
                  Book a Call
                </Button>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <StrategyCallModal show={showBooking} onClose={() => setShowBooking(false)} pageOrigin="/contact" />
    </>
  );
}

/* ---------- Local presentational helpers ---------- */

const infoTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-h3)',
  color: 'var(--text-strong)',
  margin: '0 0 var(--space-2)',
};

const infoBody: React.CSSProperties = {
  color: 'var(--text-muted)',
  margin: 0,
};

interface SegmentTabProps {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
  id: string;
  controls: string;
}

function SegmentTab({ active, onClick, label, sub, id, controls }: SegmentTabProps) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      style={{
        border: 'none',
        cursor: 'pointer',
        borderRadius: 'var(--radius-pill)',
        padding: 'var(--space-2) var(--space-5)',
        background: active ? 'var(--action-bg)' : 'transparent',
        color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
        transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
        textAlign: 'left',
        minHeight: 48,
      }}
    >
      <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--fs-body-sm)' }}>
        {label}
      </span>
      <span style={{ display: 'block', fontSize: 'var(--fs-caption)', opacity: 0.85 }}>
        {sub}
      </span>
    </button>
  );
}

interface FieldGroupProps {
  label: string;
  children: React.ReactNode;
}

function FieldGroup({ label, children }: FieldGroupProps) {
  return (
    <div style={{ marginBottom: 'var(--space-5)' }}>
      <p
        style={{
          fontSize: 'var(--fs-caption)',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          margin: '0 0 var(--space-3)',
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: readonly string[];
  required?: boolean;
  error?: string;
}

function SelectField({ label, name, value, onChange, options, required, error }: SelectFieldProps) {
  const id = `cf-${name}`;
  return (
    <div className="cb-min0">
      <label
        htmlFor={id}
        style={{
          display: 'block',
          fontSize: 'var(--fs-body-sm)',
          fontWeight: 500,
          color: 'var(--text-strong)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--status-danger)' }}> *</span>}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          minHeight: 48,
          padding: '0 var(--space-3)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--fs-body-sm)',
          color: 'var(--text-strong)',
          background: 'var(--surface-card)',
          border: `1px solid ${error ? 'var(--status-danger)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
        }}
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {error && (
        <div
          style={{
            color: 'var(--status-danger)',
            fontSize: 'var(--fs-body-sm)',
            marginTop: 'var(--space-1)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function IndividualIntro() {
  return (
    <p
      style={{
        fontSize: 'var(--fs-body)',
        color: 'var(--text-body)',
        lineHeight: 1.6,
        margin: '0 0 var(--space-5)',
      }}
    >
      Self-serve your seat in the cohort. Learn on Claude, build real systems with
      Colaberry, and present at Demo Day. Tell us about you and we'll get you started.
    </p>
  );
}

function SponsorIntro() {
  return (
    <div style={{ marginBottom: 'var(--space-5)' }}>
      <p
        style={{
          fontSize: 'var(--fs-body)',
          color: 'var(--text-body)',
          lineHeight: 1.6,
          margin: '0 0 var(--space-3)',
        }}
      >
        <strong style={{ color: 'var(--text-strong)' }}>
          Find out who your real AI builders are — without taking anyone off the job.
        </strong>{' '}
        Sponsor annual seats; your people redeem codes, learn on their own time, and
        climb a company-scoped leaderboard, then present at Demo Day.
      </p>
      <div className="d-flex flex-wrap gap-2">
        <Badge tone="blue">Reassignable seats</Badge>
        <Badge tone="blue">Company-scoped leaderboard</Badge>
        <Badge tone="blue">Talent discovery, not training</Badge>
      </div>
    </div>
  );
}

export default ContactPage;
