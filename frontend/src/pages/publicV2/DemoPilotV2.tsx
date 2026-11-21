import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import Icon from '../../components/publicV2/Icon';
import { getUTMParams } from '../../services/utmService';
import { identifyVisitor } from '../../utils/tracker';
import { createIntake } from '../../services/enterpriseIntakeApi';
import { PHONE_CONSENT_TEXT } from '../../config/consentText';
import DemoPilotIntake from './DemoPilotIntake';
import {
  DEPARTMENTS,
  EMPTY,
  PilotForm,
  SERVICES,
  START_TIMINGS,
  WHAT_HAPPENS,
  toIntakeBody,
  validate,
} from './demoPilotModel';

/**
 * DemoPilotV2 - /demo-pilot. The single conversion page, and since W28 the start of the
 * Enterprise intake.
 *
 * Ali, 2026-11-20: "an intake process that starts from the moment they decide to fill out
 * the form... upon completing that they can have the AI call them." So the page has two
 * steps: this short form, then (DemoPilotIntake) their own time figure and a 10-minute AI
 * interview, by phone or typed. The form asks only what the interview cannot: who they are,
 * the process, two numbers, and permission. The interview asks the rest.
 *
 * CONSENT IS NOT OPTIONAL. The tick to be contacted blocks submission, as /contact always has.
 * The phone NUMBER is required (PH1, Ali 2026-11-19: every public lead form requires one). The
 * call/text permission beside it is a separate tick, always shown, unticked and NOT required:
 * one sentence about being "contacted" must never authorize an automated call. No tick means
 * no AI call is offered; the interview is typed instead.
 *
 * It posts to /api/enterprise/intake, which writes the same lead /api/leads wrote (same form
 * type, same message, same pipeline) and opens an intake record. Its random id goes in the
 * URL as `?intake=`, so a reload, or a link we email later, picks the interview back up.
 */

const FORM_TYPE = 'demo_pilot_request';

export function DemoPilotV2(): React.ReactElement {
  const [params, setParams] = useSearchParams();
  const token = params.get('intake');
  const [form, setForm] = useState<PilotForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const change = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm((p) => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: '' }));
  };

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setServerError('');
    const next = validate(form);
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setSubmitting(true);
    try {
      const utm = getUTMParams();
      const created = await createIntake(
        toIntakeBody(form, {
          utmSource: utm.utmSource,
          utmMedium: utm.utmMedium,
          utmCampaign: utm.utmCampaign,
          pageUrl: window.location.href,
        }),
      );
      identifyVisitor(form.email.trim(), {
        name: form.fullName.trim(),
        company: form.company.trim(),
        metadata: { source_form: FORM_TYPE, title: form.role.trim() },
      });
      setParams({ intake: created.token });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setServerError('That did not send. Please try again, or email info@colaberry.com and we will pick it up.');
    } finally {
      setSubmitting(false);
    }
  };

  const err = (name: string, id: string): React.ReactElement | null =>
    errors[name] ? (
      <p className="cbv2-field5__err" id={id}>
        {errors[name]}
      </p>
    ) : null;

  const field = (
    name: keyof PilotForm,
    id: string,
    label: React.ReactNode,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ): React.ReactElement => (
    <div className="cbv2-field5">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        value={String(form[name])}
        onChange={change}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${id}-err` : undefined}
        {...extra}
      />
      {err(name, `${id}-err`)}
    </div>
  );

  if (token) {
    return (
      <>
        <SeoV2 title="Plan your demo pilot" description="Your AI interview, our research and your meeting with Ali, planned in one visit." />
        <section className="cbv2-prhero5 cbv2-dp5" aria-labelledby="cbv2-dp-done">
          <div className="cbv2-wrap">
            <p className="cbv2-k5">Thank you. Two minutes to plan the rest</p>
            <h1 id="cbv2-dp-done">Plan your AI interview and your meeting with Ali.</h1>
            <p className="cbv2-lede">
              A 10-minute AI interview tells us how your process works. We research your company,
              your industry and where AI fits, then meet you with pilot options ranked by what each
              could return.
            </p>
            <DemoPilotIntake token={token} phone={form.phone.trim() || undefined} />
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
          'Tell us about one process and two numbers, then talk to our AI for 10 minutes. Our ' +
          'first meeting starts with options for your pilot, so you see AI running on your own ' +
          'work before you commit to anything.'
        }
      />

      <section className="cbv2-prhero5 cbv2-dp5" aria-labelledby="cbv2-dp-title">
        <div className="cbv2-wrap">
          <p className="cbv2-crumb5">
            <Link to="/">Home</Link> / Book a demo pilot
          </p>
          <div className="cbv2-dp5__g">
            <div>
              <h1 id="cbv2-dp-title">See AI run on one of your processes.</h1>
              <p className="cbv2-lede">
                Tell us about one process and two numbers. Then talk to our AI for 10 minutes, so our
                first meeting starts with your pilot options.
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

            <form className="cbv2-fcard5" onSubmit={submit} noValidate aria-labelledby="cbv2-dp-form">
              <h2 id="cbv2-dp-form" className="cbv2-sr-only">
                Book a demo pilot
              </h2>
              <div className="cbv2-fgrid5">
                {field('fullName', 'dp-name', 'Your name', { autoComplete: 'name' })}
                {field('email', 'dp-email', 'Work email', { type: 'email', autoComplete: 'email' })}
              </div>
              <div className="cbv2-fgrid5">
                {field('company', 'dp-company', 'Company', { autoComplete: 'organization' })}
                {field('role', 'dp-role', 'Your role', { autoComplete: 'organization-title' })}
              </div>
              <div className="cbv2-fgrid5">
                {field('website', 'dp-website', <>Company website <small>optional</small></>, {
                  autoComplete: 'url',
                  placeholder: 'e.g. acme.com',
                })}
                {field('phone', 'dp-phone', 'Mobile number', {
                  type: 'tel',
                  inputMode: 'tel',
                  autoComplete: 'tel',
                  required: true,
                })}
              </div>
              {/* PH1: always shown beside the phone, unticked, never required. It is also the
                  grant the AI interview call rests on: no tick, no "Call me now". */}
              <div className="cbv2-consent5">
                <input
                  type="checkbox"
                  id="dp-phone-consent"
                  name="callConsent"
                  checked={form.callConsent}
                  onChange={change}
                />
                <label htmlFor="dp-phone-consent">{PHONE_CONSENT_TEXT}</label>
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

              <div className="cbv2-fgrid5">
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
                  <label htmlFor="dp-start">When do you want to start?</label>
                  <select id="dp-start" name="startTiming" value={form.startTiming} onChange={change}>
                    <option value="">Choose one</option>
                    {START_TIMINGS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
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
                {err('process', 'dp-process-err')}
              </div>

              {/* The two figures: what the process costs today (people and hours, so we can show
                  it back as hours a year), and what AI has to return. */}
              <fieldset className="cbv2-figs5">
                <legend className="cbv2-fig5">
                  <span className="cbv2-k5">The two figures</span>
                </legend>
                <p className="cbv2-fig5__p">They are how we pick the pilot, and how you will judge it. Rough is fine.</p>
                <div className="cbv2-fgrid5">
                  {field('peopleCount', 'dp-people', 'People who do this today', { inputMode: 'numeric', placeholder: 'e.g. 4' })}
                  {field('hoursPerWeek', 'dp-hours', <>Hours a week <small>in total</small></>, {
                    inputMode: 'decimal',
                    placeholder: 'e.g. 20',
                  })}
                </div>
                {field('requiredReturn', 'dp-return', 'What AI needs to return', { placeholder: 'e.g. hours back, faster close' })}
              </fieldset>

              {field('otherDeciders', 'dp-deciders', <>Who else decides? <small>optional</small></>, {
                placeholder: 'e.g. our CFO and IT lead',
              })}

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
                <label htmlFor="dp-consent">I agree that Colaberry may contact me about this request.</label>
                {err('consentContact', 'dp-consent-err')}
              </div>

              {serverError ? (
                <p className="cbv2-field5__err" role="alert">
                  {serverError}
                </p>
              ) : null}

              <button className="cbv2-btn cbv2-btn--primary cbv2-fcard5__go" type="submit" disabled={submitting}>
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
