import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import Icon from '../../components/publicV2/Icon';
import { EnterpriseLead, toLeadPayload } from '../../models/EnterpriseLead';
import { getUTMParams } from '../../services/utmService';
import { identifyVisitor } from '../../utils/tracker';
import api from '../../utils/api';

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
        <section className="cbv2-prhero5 cbv2-dp5" aria-labelledby="cbv2-dp-done">
          <div className="cbv2-wrap">
            <p className="cbv2-k5">Thank you</p>
            <h1 id="cbv2-dp-done">That is with an architect now.</h1>
            <p className="cbv2-lede">
              A person will read it and reply to plan a first conversation. If you would
              rather add anything in the meantime, email{' '}
              <a href="mailto:info@colaberry.com">info@colaberry.com</a>.
            </p>
            <p className="cbv2-btns5">
              <Link className="cbv2-btn cbv2-btn--line" to="/services">
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

      {/*
        LAYOUT IS THE MODEL'S (2026-11-16, page group 3): one light band, the promise and
        "what happens next" on the left, the form card on the right. The form's data
        contract is unchanged: same field names, same checks, same consent, same endpoint.
        The service question is the model's row of chips; they are radio buttons with the
        same `service` name and values the dropdown had, so the lead message is identical.
      */}
      <section className="cbv2-prhero5 cbv2-dp5" aria-labelledby="cbv2-dp-title">
        <div className="cbv2-wrap">
          <p className="cbv2-crumb5">
            <Link to="/">Home</Link> / Book a demo pilot
          </p>
          <div className="cbv2-dp5__g">
            <div>
              <p className="cbv2-k5 cbv2-dp5__k">Book a demo pilot</p>
              <h1 id="cbv2-dp-title">See AI run on one of your processes.</h1>
              <p className="cbv2-lede">
                Tell us about one process and two numbers. An architect will come back to you
                to plan the demo pilot, for Build or Guide, or to set up Train.
              </p>
              <h2 id="cbv2-dp-next" className="cbv2-sr-only">
                What happens after you send this
              </h2>
              <ol className="cbv2-next5" aria-labelledby="cbv2-dp-next">
                {WHAT_HAPPENS.map((s) => (
                  <li key={s.n}>
                    <b aria-hidden="true">{s.n}</b>
                    <p>
                      <strong>{s.title}</strong>
                      <span>{s.body}</span>
                    </p>
                  </li>
                ))}
              </ol>
            </div>

            <form
              className="cbv2-fcard5"
              onSubmit={submit}
              noValidate
              aria-labelledby="cbv2-dp-form"
            >
              <h2 id="cbv2-dp-form" className="cbv2-sr-only">
                Book a demo pilot
              </h2>
              <div className="cbv2-fgrid5">
                <div className="cbv2-field5">
                  <label htmlFor="dp-name">Your name</label>
                  <input
                    id="dp-name"
                    name="fullName"
                    value={form.fullName}
                    onChange={change}
                    autoComplete="name"
                    aria-invalid={Boolean(errors.fullName)}
                    aria-describedby={errors.fullName ? 'dp-name-err' : undefined}
                  />
                  {errors.fullName ? (
                    <p className="cbv2-field5__err" id="dp-name-err">
                      {errors.fullName}
                    </p>
                  ) : null}
                </div>
                <div className="cbv2-field5">
                  <label htmlFor="dp-email">Work email</label>
                  <input
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
                    <p className="cbv2-field5__err" id="dp-email-err">
                      {errors.email}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="cbv2-fgrid5">
                <div className="cbv2-field5">
                  <label htmlFor="dp-company">Company</label>
                  <input
                    id="dp-company"
                    name="company"
                    value={form.company}
                    onChange={change}
                    autoComplete="organization"
                  />
                </div>
                <div className="cbv2-field5">
                  <label htmlFor="dp-role">Your role</label>
                  <input
                    id="dp-role"
                    name="role"
                    value={form.role}
                    onChange={change}
                    autoComplete="organization-title"
                  />
                </div>
              </div>

              <fieldset className="cbv2-field5 cbv2-field5--set">
                <legend>
                  Which service are you considering? <small>optional</small>
                </legend>
                <div className="cbv2-chips5">
                  {SERVICES.map((s) => {
                    const id = `dp-service-${s.toLowerCase().replace(/[^a-z]+/g, '-')}`;
                    return (
                      <label key={s} htmlFor={id}>
                        <input
                          type="radio"
                          id={id}
                          name="service"
                          value={s}
                          checked={form.service === s}
                          onChange={change}
                        />
                        {s}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="cbv2-field5">
                <label htmlFor="dp-dept">Department</label>
                <select id="dp-dept" name="department" value={form.department} onChange={change}>
                  <option value="">Choose one</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cbv2-field5">
                <label htmlFor="dp-process">The process you would start with</label>
                <textarea
                  id="dp-process"
                  name="process"
                  rows={4}
                  placeholder="What happens today, who does it, and where it hurts."
                  value={form.process}
                  onChange={change}
                  aria-invalid={Boolean(errors.process)}
                  aria-describedby={errors.process ? 'dp-process-err' : undefined}
                />
                {errors.process ? (
                  <p className="cbv2-field5__err" id="dp-process-err">
                    {errors.process}
                  </p>
                ) : null}
              </div>

              {/* The two figures are one question asked in two boxes, so they stay a real
                  fieldset; the legend and its hint are drawn as the model's one tinted callout. */}
              <fieldset className="cbv2-figs5">
                <legend className="cbv2-fig5">
                  <span className="cbv2-k5">The two figures</span>
                </legend>
                <p className="cbv2-fig5__p">
                  They are how we pick the pilot, and how you will judge it. Rough is fine.
                </p>
                <div className="cbv2-fgrid5">
                  <div className="cbv2-field5">
                    <label htmlFor="dp-cost">
                      What it costs today <small>people &times; hours</small>
                    </label>
                    <input
                      id="dp-cost"
                      name="costToday"
                      placeholder="e.g. 4 people, ~20 hrs/week"
                      value={form.costToday}
                      onChange={change}
                    />
                  </div>
                  <div className="cbv2-field5">
                    <label htmlFor="dp-return">What AI needs to return</label>
                    <input
                      id="dp-return"
                      name="requiredReturn"
                      placeholder="e.g. hours back, faster close"
                      value={form.requiredReturn}
                      onChange={change}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Consent is not in the model and is not optional (see the note at the top). */}
              <div className="cbv2-consent5">
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
                  <p className="cbv2-field5__err" id="dp-consent-err">
                    {errors.consentContact}
                  </p>
                ) : null}
              </div>

              {serverError ? (
                <p className="cbv2-field5__err" role="alert">
                  {serverError}
                </p>
              ) : null}

              <button
                className="cbv2-btn cbv2-btn--primary cbv2-fcard5__go"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Sending…' : 'Book my demo pilot'}
                {submitting ? null : <Icon name="arrowRight" size={16} />}
              </button>

              <p className="cbv2-fcard5__note">
                Prefer email? <a href="mailto:info@colaberry.com">info@colaberry.com</a>
              </p>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}

export default DemoPilotV2;
