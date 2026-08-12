import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { registerOrg, persistParticipantSession } from '../../services/orgApi';
import { getUTMPayloadFields } from '../../services/utmService';
import SeoV2 from '../../components/publicV2/SeoV2';
import Icon from '../../components/publicV2/Icon';
import { SampleBadge } from '../../components/publicV2/Claim';
import {
  AccountInput,
  AccountErrors,
  ContextInput,
  ACCOUNT_INCLUDES,
  ROLE_OPTIONS,
  TEAM_SIZE_OPTIONS,
  TIMELINE_OPTIONS,
  GOAL_OPTIONS,
  validateAccount,
  buildAccountBody,
  buildContextPayload,
  isConsumerEmail,
} from '../../config/v2Signup';
import './signupV2.css';

/**
 * SignupV2 -- create the free business account.
 *
 * WHY THE ACCOUNT IS CREATED BEFORE THE QUESTIONS ARE ASKED
 * `POST /api/portal/org/register` is passwordless and takes three fields. The
 * account can therefore exist within seconds, and it does. The qualifying
 * questions come AFTER, on the same page, once the person is in and answering
 * costs them nothing. Putting them first would gate a free product behind a
 * long form for data the account does not need.
 *
 * The second step is genuinely skippable. It says so, and skipping still lands
 * the person in their workspace -- because the account is already real by then.
 *
 * FAILURE PATH
 * If registration fails, nothing is lost and the form says so; the person can
 * retry. If the SECOND step fails, the account still exists, so the failure is
 * swallowed deliberately rather than shown as an error that implies otherwise.
 */

const WORKSPACE_URL = '/portal/company';

function SignupV2(): React.ReactElement {
  const [account, setAccount] = useState<AccountInput>({ fullName: '', workEmail: '', company: '' });
  const [errors, setErrors] = useState<AccountErrors>({});
  const [serverError, setServerError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const [ctx, setCtx] = useState<ContextInput>({
    role: '', teamSize: '', timeline: '', goal: '', phone: '', notes: '',
    evaluating90Days: false, sponsorshipInterest: false, consentContact: false,
  });

  const setField = <K extends keyof AccountInput>(k: K, v: AccountInput[K]) =>
    setAccount((p) => ({ ...p, [k]: v }));
  const setCtxField = <K extends keyof ContextInput>(k: K, v: ContextInput[K]) =>
    setCtx((p) => ({ ...p, [k]: v }));

  /* ------------------------------------------------ step 1: create account -- */

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    const next = validateAccount(account);
    setErrors(next);
    if (Object.keys(next).length) return;

    setCreating(true);
    try {
      const res = await registerOrg(buildAccountBody(account));
      persistParticipantSession(res.jwt);
      setCreated(true);
    } catch (err) {
      /*
       * The endpoint returns a specific, human-readable reason on a 400
       * (`{ error: 'a valid email is required' }` and similar, straight from its
       * Zod schema). Showing our own generic sentence instead would hide the one
       * piece of information that tells the person how to fix it.
       *
       * Registering twice is NOT an error worth guarding: registerManager is
       * idempotent -- free account by email, organization by owner, roster row by
       * (org, email) -- so a repeat signup returns the existing account with a
       * fresh session rather than failing.
       */
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      const fromServer = e.response?.data?.error;
      setServerError(
        fromServer ||
          'We could not create the account just then. Nothing was lost -- try again, or use the ' +
            'contact form and a person will set it up.',
      );
    } finally {
      setCreating(false);
    }
  };

  /* ----------------------------------------------- step 2: context, then in -- */

  const goToWorkspace = () => {
    // Full reload rather than a route change: the auth context reads the token
    // at boot, which is how the existing free-preview registration works too.
    window.location.assign(WORKSPACE_URL);
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setFinishing(true);
    try {
      await api.post(
        '/api/leads',
        buildContextPayload(
          account,
          ctx,
          getUTMPayloadFields() as unknown as Record<string, string>,
          typeof window !== 'undefined' ? window.location.pathname : '',
        ),
      );
    } catch {
      // The account already exists. Failing to record context must not strand
      // someone on a form, so this is deliberately swallowed.
    } finally {
      goToWorkspace();
    }
  };

  /* --------------------------------------------------------------- render --- */

  return (
    <>
      <SeoV2
        title="Create your free business account"
        description={
          'One free account gives you the manager view of your organization and the learner ' +
          'experience. No credit card.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-signup-title">
        <div className="cbv2-wrap cbv2-pagehero__split">
          <div>
            <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Create your account</p>
            <h1 id="cbv2-signup-title">
              {created ? 'Your workspace is ready' : 'Start with your own workspace'}
            </h1>
            <p className="cbv2-pagehero__lede">
              {created
                ? 'The account exists and you are signed in. A few questions so the right person ' +
                  'follows up with something useful, then we will take you in.'
                : 'It takes three fields and no credit card. Your workspace opens on sample data ' +
                  'shaped to the metrics the product really captures, and fills with your own as ' +
                  'your team joins.'}
            </p>
            <ul className="cbv2-includes">
              {ACCOUNT_INCLUDES.map((i) => (
                <li key={i.text}>
                  <span className="cbv2-icon-tile cbv2-icon-tile--blue">
                    <Icon name={i.icon} size={20} />
                  </span>
                  <span>{i.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="cbv2-signup-card">
            {!created ? (
              <form onSubmit={handleCreate} noValidate>
                <h2 className="cbv2-signup-card__title">Create the account</h2>

                <label className="cbv2-field">
                  <span className="cbv2-field__label">Your name</span>
                  <input
                    className="cbv2-field__input"
                    type="text"
                    autoComplete="name"
                    value={account.fullName}
                    onChange={(ev) => setField('fullName', ev.target.value)}
                    aria-invalid={Boolean(errors.fullName)}
                  />
                  {errors.fullName ? <span className="cbv2-err" role="alert">{errors.fullName}</span> : null}
                </label>

                <label className="cbv2-field">
                  <span className="cbv2-field__label">Work email</span>
                  <input
                    className="cbv2-field__input"
                    type="email"
                    autoComplete="email"
                    value={account.workEmail}
                    onChange={(ev) => setField('workEmail', ev.target.value)}
                    aria-invalid={Boolean(errors.workEmail)}
                  />
                  {errors.workEmail ? <span className="cbv2-err" role="alert">{errors.workEmail}</span> : null}
                  {/* A personal address works. Saying why a work one is better beats blocking it. */}
                  {!errors.workEmail && account.workEmail && isConsumerEmail(account.workEmail) ? (
                    <span className="cbv2-hint">
                      That works. A work address keeps your team on one workspace when they join.
                    </span>
                  ) : null}
                </label>

                <label className="cbv2-field">
                  <span className="cbv2-field__label">Organization</span>
                  <input
                    className="cbv2-field__input"
                    type="text"
                    autoComplete="organization"
                    value={account.company}
                    onChange={(ev) => setField('company', ev.target.value)}
                    aria-invalid={Boolean(errors.company)}
                  />
                  {errors.company ? <span className="cbv2-err" role="alert">{errors.company}</span> : null}
                </label>

                {serverError ? (
                  <p className="cbv2-err cbv2-err--server" role="alert">{serverError}</p>
                ) : null}

                <button type="submit" className="cbv2-btn cbv2-btn--primary cbv2-signup-card__go" disabled={creating}>
                  {creating ? 'Creating...' : 'Create my free workspace'}
                </button>
                <p className="cbv2-signup-card__foot">
                  No credit card. No sales call required. You can invite your team later.
                </p>
              </form>
            ) : (
              <form onSubmit={handleFinish}>
                <h2 className="cbv2-signup-card__title">A few things about your team</h2>
                <p className="cbv2-signup-card__sub">
                  Optional, and it takes about a minute. It decides who follows up and what they
                  bring.
                </p>

                <label className="cbv2-field">
                  <span className="cbv2-field__label">Your role</span>
                  <select className="cbv2-field__input" value={ctx.role}
                    onChange={(ev) => setCtxField('role', ev.target.value)}>
                    <option value="">Prefer not to say</option>
                    {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>

                <div className="cbv2-fields__row">
                  <label className="cbv2-field">
                    <span className="cbv2-field__label">People you would bring</span>
                    <select className="cbv2-field__input" value={ctx.teamSize}
                      onChange={(ev) => setCtxField('teamSize', ev.target.value)}>
                      <option value="">Prefer not to say</option>
                      {TEAM_SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="cbv2-field">
                    <span className="cbv2-field__label">Where this sits</span>
                    <select className="cbv2-field__input" value={ctx.timeline}
                      onChange={(ev) => setCtxField('timeline', ev.target.value)}>
                      <option value="">Prefer not to say</option>
                      {TIMELINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                </div>

                <fieldset className="cbv2-lab__fieldset">
                  <legend className="cbv2-field__label">What would make this worth it?</legend>
                  <div className="cbv2-goals">
                    {GOAL_OPTIONS.map((g) => (
                      <label key={g.value} className={`cbv2-goal${ctx.goal === g.value ? ' is-selected' : ''}`}>
                        <input type="radio" name="goal" value={g.value}
                          checked={ctx.goal === g.value}
                          onChange={() => setCtxField('goal', g.value)} />
                        <Icon name={g.icon} size={20} />
                        <span>{g.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="cbv2-field">
                  <span className="cbv2-field__label">Phone, if you would rather be called</span>
                  <input className="cbv2-field__input" type="tel" autoComplete="tel"
                    value={ctx.phone} onChange={(ev) => setCtxField('phone', ev.target.value)} />
                </label>

                <label className="cbv2-field">
                  <span className="cbv2-field__label">Anything we should know</span>
                  <textarea className="cbv2-field__input" rows={3} value={ctx.notes}
                    onChange={(ev) => setCtxField('notes', ev.target.value)} />
                </label>

                <label className="cbv2-consent">
                  <input type="checkbox" checked={ctx.evaluating90Days}
                    onChange={(ev) => setCtxField('evaluating90Days', ev.target.checked)} />
                  <span>We are likely to decide on something within 90 days.</span>
                </label>
                <label className="cbv2-consent">
                  <input type="checkbox" checked={ctx.sponsorshipInterest}
                    onChange={(ev) => setCtxField('sponsorshipInterest', ev.target.checked)} />
                  <span>I would consider sponsoring seats for my team.</span>
                </label>
                <label className="cbv2-consent">
                  <input type="checkbox" checked={ctx.consentContact}
                    onChange={(ev) => setCtxField('consentContact', ev.target.checked)} />
                  <span>You may contact me about this. We will not add you to a mailing list.</span>
                </label>

                <div className="cbv2-signup-card__actions">
                  <button type="submit" className="cbv2-btn cbv2-btn--primary" disabled={finishing}>
                    {finishing ? 'Taking you in...' : 'Save and open my workspace'}
                  </button>
                  <button type="button" className="cbv2-btn cbv2-btn--ghost" onClick={goToWorkspace}>
                    Skip, take me in
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-signup-what">
        <div className="cbv2-wrap cbv2-split">
          <div>
            <p className="cbv2-eyebrow">What opens</p>
            <h2 id="cbv2-signup-what">The manager view, from the first minute</h2>
            <p className="cbv2-lede" style={{ marginTop: 'var(--space-4)' }}>
              Your workspace opens on sample data arranged in the metrics the product actually
              captures, so you are judging the real shape of it before anyone on your team signs
              in. Invite people and the sample gives way to their own evidence, evaluations and
              shipped work.
            </p>
            <p style={{ marginTop: 'var(--space-6)' }}>
              <Link className="cbv2-btn cbv2-btn--ghost" to="/v2/platform">
                See the platform first
              </Link>
            </p>
          </div>
          <figure className="cbv2-shot-frame">
            <img
              className="cbv2-shot"
              src="/site-v2/shot-hero-dashboard.png"
              alt="The organization readiness dashboard as it opens: average architect readiness, builder XP, evidence shipped and evaluations passed for a sample company."
              loading="lazy"
              decoding="async"
            />
            <figcaption className="cbv2-shot-caption">
              <SampleBadge />
              <span>What your workspace looks like on day one.</span>
            </figcaption>
          </figure>
        </div>
      </section>
    </>
  );
}

export default SignupV2;
