import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import { EnterpriseLead, toLeadPayload } from '../../models/EnterpriseLead';
import { getUTMParams } from '../../services/utmService';
import { identifyVisitor } from '../../utils/tracker';
import api from '../../utils/api';
import './demoPilotV2.css';
/* The form pattern (.cbv2-field, .cbv2-fields) is the one /lab already used --
   reused rather than reinvented, since /lab is the page this one absorbs. */
import './opportunityLabV2.css';

/**
 * DemoPilotV2 — /demo-pilot. The single conversion page.
 *
 * WHAT THIS REPLACES. /contact and /lab. The v5 site model folds both into one
 * page and points every primary button on the site at it, because the site had
 * two different "get in touch" destinations asking for different things, and a
 * visitor who wanted to start had to guess which one was the real front door.
 *
 * WHAT IT ASKS FOR. One process and two numbers: what the process costs today,
 * and what AI would have to return to be worth doing. Those two figures are the
 * ones an architect needs to pick a pilot, and they are also the figures the
 * customer will judge the pilot by -- which is the point of asking for them
 * before anyone has sold anything.
 *
 * CONSENT IS NOT OPTIONAL, AND IS NOT IN THE MODEL. The design model's form has
 * name, email, company, role, service, department, process and the two figures,
 * and no consent tick. /contact has always required an explicit
 * `consentContact` before it will submit, and that is a compliance surface, not
 * a styling choice. Replacing a consented lead form with an unconsented one
 * would be a regression dressed as a redesign, so the tick is carried over and
 * submission is blocked without it. Phone is not collected here at all, which
 * is why there is no phone-consent tick: no number, no call.
 *
 * It posts to the SAME endpoint as /contact (`/api/leads`) with the same
 * `EnterpriseLead` shape, so these leads land in the pipeline that already
 * exists rather than in a new one nobody is watching. `formType` distinguishes
 * them.
 */

const FORM_TYPE = 'demo_pilot_request';

const SERVICES = ['Build', 'Guide', 'Train', 'Not sure yet'] as const;

const DEPARTMENTS = [
  'Finance',
  'Operations',
  'Customer service',
  'Sales',
  'HR',
  'IT & Data',
  'Company-wide',
  'Other',
] as const;

const WHAT_HAPPENS: readonly { n: string; title: string; body: string }[] = [
  {
    n: '1',
    title: 'An architect reads it',
    body: 'A person, not a sequence. They will reply to plan a first conversation.',
  },
  {
    n: '2',
    title: 'We meet the leader and the experts',
    body: 'The people who own the process, so the pilot targets the right thing.',
  },
  {
    n: '3',
    title: 'You see the demo pilot',
    body: 'One process, running, with the ROI case beside it. Then you decide.',
  },
];

interface PilotForm {
  fullName: string;
  email: string;
  company: string;
  role: string;
  service: string;
  department: string;
  process: string;
  costToday: string;
  requiredReturn: string;
  consentContact: boolean;
}

const EMPTY: PilotForm = {
  fullName: '',
  email: '',
  company: '',
  role: '',
  service: '',
  department: '',
  process: '',
  costToday: '',
  requiredReturn: '',
  consentContact: false,
};

/**
 * Fold the pilot-specific answers into the lead's message.
 *
 * EnterpriseLead has no column for "the process you would start with" or for
 * the two figures, and inventing backend fields is a bigger change than this
 * page justifies. Composing them into `message` keeps every answer attached to
 * the lead and readable by whoever picks it up, with labels so nothing is
 * ambiguous once it is out of the form's context.
 */
function composeMessage(f: PilotForm): string {
  const lines = [
    `Service considered: ${f.service || 'not stated'}`,
    `Department: ${f.department || 'not stated'}`,
    '',
    'Process to start with:',
    f.process.trim() || 'not stated',
    '',
    `What it costs today: ${f.costToday.trim() || 'not stated'}`,
    `What AI needs to return: ${f.requiredReturn.trim() || 'not stated'}`,
  ];
  return lines.join('\n');
}

export function DemoPilotV2(): React.ReactElement {
  const [form, setForm] = useState<PilotForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');

  const change = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ): void => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm((p) => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: '' }));
  };

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setServerError('');

    const next: Record<string, string> = {};
    if (!form.fullName.trim()) next.fullName = 'Please tell us your name';
    if (!form.email.trim()) next.email = 'Please give us a work email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'That does not look like an email address';
    }
    if (!form.process.trim()) next.process = 'Name one process, even roughly';
    // Blocking, deliberately: see the consent note in this file's header.
    if (!form.consentContact) next.consentContact = 'You must agree to be contacted';

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      const lead: EnterpriseLead = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        company: form.company.trim() || undefined,
        title: form.role.trim() || undefined,
        message: composeMessage(form),
        consentContact: form.consentContact,
        formType: FORM_TYPE,
        ...getUTMParams(),
        pageOrigin: window.location.href,
      };
      await api.post('/api/leads', toLeadPayload(lead));
      identifyVisitor(lead.email, {
        name: lead.fullName,
        company: lead.company,
        metadata: { source_form: FORM_TYPE, title: lead.title },
      });
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setServerError(
        'That did not send. Please try again, or email info@colaberry.com and we will pick it up.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <>
        <SeoV2 title="Thank you" description="Your demo pilot request is with an architect." />
        <section className="cbv2-section" aria-labelledby="cbv2-dp-done">
          <div className="cbv2-wrap cbv2-wrap--narrow">
            <p className="cbv2-eyebrow">Thank you</p>
            <h1 id="cbv2-dp-done">That is with an architect now.</h1>
            <p className="cbv2-lede">
              A person will read it and reply to plan a first conversation. If you would
              rather add anything in the meantime, email{' '}
              <a href="mailto:info@colaberry.com">info@colaberry.com</a>.
            </p>
            <p style={{ marginTop: 'var(--space-6)' }}>
              <Link className="cbv2-btn cbv2-btn--secondary" to="/services">
                Read about the three services
              </Link>
            </p>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <SeoV2
        title="Book a demo pilot"
        description={
          'Tell us about one process and two numbers. An architect will come back to you to ' +
          'plan a demo pilot, so you can see AI running on your own work before you commit ' +
          'to anything.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-dp-title">
        <div className="cbv2-wrap">
          <p className="cbv2-breadcrumb">
            <Link to="/">Home</Link> / Book a demo pilot
          </p>
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Book a demo pilot</p>
          <h1 id="cbv2-dp-title">See AI run on one of your processes.</h1>
          <p className="cbv2-pagehero__lede">
            Tell us about one process and two numbers. An architect will come back to you to
            plan the demo pilot &mdash; for Build or Guide &mdash; or to set up Train.
          </p>
        </div>
      </section>

      <section className="cbv2-section" aria-labelledby="cbv2-dp-next">
        <div className="cbv2-wrap">
          <h2 id="cbv2-dp-next" className="cbv2-sr-only">
            What happens after you send this
          </h2>
          <ol className="cbv2-pilot">
            {WHAT_HAPPENS.map((s) => (
              <li className="cbv2-pilot__step" key={s.n}>
                <span className="cbv2-pilot__n" aria-hidden="true">
                  {s.n}
                </span>
                <div>
                  <h3 className="cbv2-pilot__title">{s.title}</h3>
                  <p className="cbv2-pilot__body">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-dp-form">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h2 id="cbv2-dp-form" className="cbv2-sr-only">
            Book a demo pilot
          </h2>

          <form className="cbv2-dp-form" onSubmit={submit} noValidate>
            <div className="cbv2-fields">
              <div className="cbv2-fields__row">
                <div className="cbv2-field">
                  <label className="cbv2-field__label" htmlFor="dp-name">
                    Your name
                  </label>
                  <input
                    className="cbv2-field__input"
                    id="dp-name"
                    name="fullName"
                    value={form.fullName}
                    onChange={change}
                    autoComplete="name"
                    aria-invalid={Boolean(errors.fullName)}
                    aria-describedby={errors.fullName ? 'dp-name-err' : undefined}
                  />
                  {errors.fullName ? (
                    <p className="cbv2-field__err" id="dp-name-err">
                      {errors.fullName}
                    </p>
                  ) : null}
                </div>

                <div className="cbv2-field">
                  <label className="cbv2-field__label" htmlFor="dp-email">
                    Work email
                  </label>
                  <input
                    className="cbv2-field__input"
                    id="dp-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={change}
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'dp-email-err' : undefined}
                  />
                  {errors.email ? (
                    <p className="cbv2-field__err" id="dp-email-err">
                      {errors.email}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="cbv2-fields__row">
                <div className="cbv2-field">
                  <label className="cbv2-field__label" htmlFor="dp-company">
                    Company
                  </label>
                  <input
                    className="cbv2-field__input"
                    id="dp-company"
                    name="company"
                    value={form.company}
                    onChange={change}
                    autoComplete="organization"
                  />
                </div>

                <div className="cbv2-field">
                  <label className="cbv2-field__label" htmlFor="dp-role">
                    Your role
                  </label>
                  <input
                    className="cbv2-field__input"
                    id="dp-role"
                    name="role"
                    value={form.role}
                    onChange={change}
                    autoComplete="organization-title"
                  />
                </div>
              </div>

              <div className="cbv2-fields__row">
                <div className="cbv2-field">
                  <label className="cbv2-field__label" htmlFor="dp-service">
                    Which service are you considering? <span className="cbv2-opt">optional</span>
                  </label>
                  <select
                    className="cbv2-field__input"
                    id="dp-service"
                    name="service"
                    value={form.service}
                    onChange={change}
                  >
                    <option value="">Choose one</option>
                    {SERVICES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cbv2-field">
                  <label className="cbv2-field__label" htmlFor="dp-dept">
                    Department
                  </label>
                  <select
                    className="cbv2-field__input"
                    id="dp-dept"
                    name="department"
                    value={form.department}
                    onChange={change}
                  >
                    <option value="">Choose one</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="cbv2-field">
                <label className="cbv2-field__label" htmlFor="dp-process">
                  The process you would start with
                </label>
                <textarea
                  className="cbv2-field__input"
                  id="dp-process"
                  name="process"
                  rows={4}
                  value={form.process}
                  onChange={change}
                  aria-invalid={Boolean(errors.process)}
                  aria-describedby={errors.process ? 'dp-process-err' : undefined}
                />
                {errors.process ? (
                  <p className="cbv2-field__err" id="dp-process-err">
                    {errors.process}
                  </p>
                ) : null}
              </div>

              <fieldset className="cbv2-figures">
                <legend className="cbv2-field__label">The two figures</legend>
                <p className="cbv2-figures__hint">
                  They are how we pick the pilot, and how you will judge it. Rough is fine.
                </p>
                <div className="cbv2-fields__row">
                  <div className="cbv2-field">
                    <label className="cbv2-field__label" htmlFor="dp-cost">
                      What it costs today{' '}
                      <span className="cbv2-opt">people &times; hours</span>
                    </label>
                    <input
                      className="cbv2-field__input"
                      id="dp-cost"
                      name="costToday"
                      value={form.costToday}
                      onChange={change}
                    />
                  </div>
                  <div className="cbv2-field">
                    <label className="cbv2-field__label" htmlFor="dp-return">
                      What AI needs to return
                    </label>
                    <input
                      className="cbv2-field__input"
                      id="dp-return"
                      name="requiredReturn"
                      value={form.requiredReturn}
                      onChange={change}
                    />
                  </div>
                </div>
              </fieldset>

              <div className="cbv2-consent">
                <input
                  type="checkbox"
                  id="dp-consent"
                  name="consentContact"
                  checked={form.consentContact}
                  onChange={change}
                  aria-invalid={Boolean(errors.consentContact)}
                  aria-describedby={errors.consentContact ? 'dp-consent-err' : undefined}
                />
                <label htmlFor="dp-consent">
                  I agree that Colaberry may contact me about this request.
                </label>
                {errors.consentContact ? (
                  <p className="cbv2-field__err" id="dp-consent-err">
                    {errors.consentContact}
                  </p>
                ) : null}
              </div>

              {serverError ? (
                <p className="cbv2-field__err" role="alert">
                  {serverError}
                </p>
              ) : null}

              <div>
                <button
                  className="cbv2-btn cbv2-btn--primary"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? 'Sending…' : 'Book my demo pilot'}
                </button>
              </div>

              <p className="cbv2-note">
                Prefer email? <a href="mailto:info@colaberry.com">info@colaberry.com</a>
              </p>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}

export default DemoPilotV2;
