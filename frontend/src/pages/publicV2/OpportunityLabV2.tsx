import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { getUTMPayloadFields } from '../../services/utmService';
import SeoV2 from '../../components/publicV2/SeoV2';
import { CapabilityNotice } from '../../components/publicV2/Claim';
import {
  LAB_STEPS,
  TIMELINE_OPTIONS,
  COMPANY_SIZE_OPTIONS,
  buildLeadPayload,
  validateContact,
  composeSummary,
  StepId,
} from '../../config/v2Lab';
import './opportunityLabV2.css';

/**
 * OpportunityLabV2 -- map an AI opportunity in five steps.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It returns no score, ROI figure, payback period or readiness rating. The
 * scoring backend does not exist (`surface.opportunity.lab` is capability
 * `unbuilt`), and computing a number client-side would present arithmetic as
 * analysis. The page says so plainly instead, via CapabilityNotice.
 *
 * PRIVACY
 * The existing LeadCaptureForm attaches `visitor_fingerprint` from localStorage.
 * This page does not, and that stays true now that consent exists (task 1.10):
 * agreeing to measurement is not agreeing to have a device id stapled to a form
 * submission. This form sends only what the person knowingly typed, plus UTM
 * parameters already present in the URL they arrived on.
 */

const LAST_STEP = LAB_STEPS.length - 1;

interface FieldErrors {
  [key: string]: string;
}

function OpportunityLabV2(): React.ReactElement {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [timeline, setTimeline] = useState('');
  const [consent, setConsent] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = LAB_STEPS[stepIndex];
  const isLast = stepIndex === LAST_STEP;

  /* Move focus to the new step's heading so the change is announced rather than
     silently re-rendering under a screen-reader user. */
  useEffect(() => {
    if (!submitted) headingRef.current?.focus();
  }, [stepIndex, submitted]);

  const choose = useCallback(
    (id: StepId, value: string) => {
      setAnswers((prev) => ({ ...prev, [id]: value }));
      setErrors((prev) => ({ ...prev, [id]: '' }));
    },
    [],
  );

  const validateStep = (): boolean => {
    const next: FieldErrors = {};
    if (step.options && !answers[step.id]) {
      next[step.id] = 'Choose an option to continue.';
    }
    if (isLast) {
      Object.assign(
        next,
        validateContact({ name, email, company, title, companySize, timeline, consent }),
      );
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (!validateStep()) return;
    setStepIndex((i) => Math.min(i + 1, LAST_STEP));
  };

  const goBack = () => {
    setErrors({});
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!validateStep()) return;

    setSubmitting(true);
    try {
      // visitor_fingerprint is deliberately NOT attached here. See file header.
      const payload = buildLeadPayload(
        { name, email, company, title, companySize, timeline, consent },
        answers,
        freeText,
        getUTMPayloadFields() as unknown as Record<string, string>,
        typeof window !== 'undefined' ? window.location.pathname : '',
      );
      await api.post('/api/leads', payload);
      setSubmitted(true);
    } catch (err) {
      const e2 = err as {
        response?: { status?: number; data?: { details?: { field: string; message: string }[] } };
      };
      const status = e2.response?.status;
      if (status === 400 && e2.response?.data?.details) {
        const fieldErrors: FieldErrors = {};
        e2.response.data.details.forEach((d) => {
          fieldErrors[d.field] = d.message;
        });
        setErrors(fieldErrors);
        setServerError('Some details need correcting.');
      } else if (status === 429) {
        setServerError('That is several submissions in a short window. Try again in a few minutes.');
      } else {
        setServerError(
          'We could not send that. Nothing was lost -- try again, or email us directly.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------------------------------------ submitted -- */

  if (submitted) {
    return (
      <>
        <SeoV2 title="Received" description="Your opportunity has been sent to a person." />
        <section className="cbv2-section" aria-labelledby="cbv2-lab-done">
          <div className="cbv2-wrap cbv2-wrap--narrow">
            <p className="cbv2-eyebrow">Received</p>
            <h1 id="cbv2-lab-done">That is with a person now</h1>
            <p className="cbv2-lede" style={{ margin: 'var(--space-4) 0' }}>
              No automated score is coming, because we do not have one worth sending. Someone
              will read what you wrote and reply to {email.trim()}.
            </p>
            <div className="cbv2-recap">
              <h2 className="cbv2-recap__title">What you told us</h2>
              <pre className="cbv2-recap__body">{composeSummary(answers, freeText)}</pre>
            </div>
            <div className="cbv2-hero__ctas" style={{ marginTop: 'var(--space-6)' }}>
              <Link className="cbv2-btn cbv2-btn--primary" to="/v2/platform">
                See the platform
              </Link>
              <Link className="cbv2-btn cbv2-btn--ghost" to="/v2/proof">
                Read the proof standard
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  /* ----------------------------------------------------------------- form -- */

  return (
    <>
      <SeoV2
        title="Map an AI opportunity"
        description={
          'Describe one process in five steps and a person will reply. No automated score, ' +
          'no ROI estimate generated from a form.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-lab-title">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Opportunity Lab</p>
          <h1 id="cbv2-lab-title">Map one opportunity in five steps</h1>
          <p className="cbv2-pagehero__lede">
            Describe a single process that is slower or more expensive than it should be. It
            takes about two minutes.
          </p>
        </div>
      </section>

      <section className="cbv2-section" aria-labelledby="cbv2-lab-form-title">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h2 id="cbv2-lab-form-title" className="cbv2-sr-only">
            Opportunity questions
          </h2>

          <ol className="cbv2-steps" aria-label="Progress">
            {LAB_STEPS.map((s, i) => (
              <li
                key={s.id}
                className={`cbv2-steps__item${i === stepIndex ? ' is-current' : ''}${
                  i < stepIndex ? ' is-done' : ''
                }`}
                aria-current={i === stepIndex ? 'step' : undefined}
              >
                <span className="cbv2-steps__n">{s.n}</span>
                <span className="cbv2-steps__label">{s.title}</span>
              </li>
            ))}
          </ol>

          <form className="cbv2-lab" onSubmit={handleSubmit} noValidate>
            <h3 className="cbv2-lab__q" tabIndex={-1} ref={headingRef}>
              {step.question}
            </h3>
            <p className="cbv2-lab__help">{step.help}</p>

            {step.options ? (
              <fieldset className="cbv2-lab__fieldset">
                <legend className="cbv2-sr-only">{step.question}</legend>
                <div className="cbv2-choices">
                  {step.options.map((o) => {
                    const selected = answers[step.id] === o.value;
                    return (
                      <label
                        key={o.value}
                        className={`cbv2-choice${selected ? ' is-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={step.id}
                          value={o.value}
                          checked={selected}
                          onChange={() => choose(step.id, o.value)}
                        />
                        <span className="cbv2-choice__label">{o.label}</span>
                        {o.hint ? <span className="cbv2-choice__hint">{o.hint}</span> : null}
                      </label>
                    );
                  })}
                </div>
                {errors[step.id] ? (
                  <p className="cbv2-err" role="alert">
                    {errors[step.id]}
                  </p>
                ) : null}
              </fieldset>
            ) : null}

            {isLast ? (
              <div className="cbv2-fields">
                <label className="cbv2-field">
                  <span className="cbv2-field__label">Anything we should know</span>
                  <textarea
                    className="cbv2-field__input"
                    rows={4}
                    value={freeText}
                    onChange={(ev) => setFreeText(ev.target.value)}
                    placeholder="Optional. The detail that the options above did not capture."
                  />
                </label>

                <label className="cbv2-field">
                  <span className="cbv2-field__label">Your name</span>
                  <input
                    className="cbv2-field__input"
                    type="text"
                    value={name}
                    onChange={(ev) => setName(ev.target.value)}
                    aria-invalid={Boolean(errors.name)}
                    autoComplete="name"
                  />
                  {errors.name ? (
                    <span className="cbv2-err" role="alert">
                      {errors.name}
                    </span>
                  ) : null}
                </label>

                <label className="cbv2-field">
                  <span className="cbv2-field__label">Work email</span>
                  <input
                    className="cbv2-field__input"
                    type="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    aria-invalid={Boolean(errors.email)}
                    autoComplete="email"
                  />
                  {errors.email ? (
                    <span className="cbv2-err" role="alert">
                      {errors.email}
                    </span>
                  ) : null}
                </label>

                <div className="cbv2-fields__row">
                  <label className="cbv2-field">
                    <span className="cbv2-field__label">Organization</span>
                    <input
                      className="cbv2-field__input"
                      type="text"
                      value={company}
                      onChange={(ev) => setCompany(ev.target.value)}
                      autoComplete="organization"
                    />
                  </label>
                  <label className="cbv2-field">
                    <span className="cbv2-field__label">Your role</span>
                    <input
                      className="cbv2-field__input"
                      type="text"
                      value={title}
                      onChange={(ev) => setTitle(ev.target.value)}
                      autoComplete="organization-title"
                    />
                  </label>
                </div>

                <div className="cbv2-fields__row">
                  <label className="cbv2-field">
                    <span className="cbv2-field__label">People in the organization</span>
                    <select
                      className="cbv2-field__input"
                      value={companySize}
                      onChange={(ev) => setCompanySize(ev.target.value)}
                    >
                      <option value="">Prefer not to say</option>
                      {COMPANY_SIZE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cbv2-field">
                    <span className="cbv2-field__label">Where this sits</span>
                    <select
                      className="cbv2-field__input"
                      value={timeline}
                      onChange={(ev) => setTimeline(ev.target.value)}
                    >
                      <option value="">Prefer not to say</option>
                      {TIMELINE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="cbv2-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(ev) => setConsent(ev.target.checked)}
                    aria-invalid={Boolean(errors.consent)}
                  />
                  <span>
                    You may contact me about this. We will not add you to a mailing list, and
                    we do not sell or share this.
                  </span>
                </label>
                {errors.consent ? (
                  <p className="cbv2-err" role="alert">
                    {errors.consent}
                  </p>
                ) : null}
              </div>
            ) : null}

            {serverError ? (
              <p className="cbv2-err cbv2-err--server" role="alert">
                {serverError}
              </p>
            ) : null}

            <div className="cbv2-lab__nav">
              {stepIndex > 0 ? (
                <button type="button" className="cbv2-btn cbv2-btn--ghost" onClick={goBack}>
                  Back
                </button>
              ) : (
                <span />
              )}
              {isLast ? (
                <button type="submit" className="cbv2-btn cbv2-btn--primary" disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send to a person'}
                </button>
              ) : (
                <button type="button" className="cbv2-btn cbv2-btn--primary" onClick={goNext}>
                  Continue
                </button>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* The scoring half of this surface does not exist. Say so. */}
      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-lab-scoring">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h2 id="cbv2-lab-scoring">Why there is no instant score</h2>
          <p className="cbv2-lede" style={{ margin: 'var(--space-3) 0 var(--space-5)' }}>
            A form cannot know your constraints, your data or your people. A number generated
            from five clicks would look like analysis without being any. When scored assessment
            is built on evidence rather than self-report, it will appear here.
          </p>
          <CapabilityNotice claimKey="surface.opportunity.lab" />
        </div>
      </section>
    </>
  );
}

export default OpportunityLabV2;
