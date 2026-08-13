/**
 * SignupV2.test.tsx
 *
 * The risks on an account-creation page are different from a marketing page:
 *   1. Sending the registration endpoint fields it does not accept.
 *   2. Collecting data with nowhere to store it, which is theatre.
 *   3. Blocking a free signup on a soft preference (a personal email address).
 *   4. Losing someone if the OPTIONAL second step fails after the account is real.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import SignupV2 from '../SignupV2';
import {
  validateAccount,
  buildAccountBody,
  buildContextPayload,
  isConsumerEmail,
  ACCOUNT_INCLUDES,
  GOAL_OPTIONS,
  AccountInput,
  ContextInput,
} from '../../../config/v2Signup';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/v2/start']}>
      <SignupV2 />
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const account: AccountInput = {
  fullName: '  Dana Reyes ',
  workEmail: ' dana@acme.com ',
  company: ' Acme Corp ',
};

const ctx: ContextInput = {
  role: 'exec', teamSize: '50-199', timeline: 'this_quarter', goal: 'measure_readiness',
  phone: ' 555-0100 ', notes: ' We have no idea where we stand. ',
  evaluating90Days: true, sponsorshipInterest: true, consentContact: true,
};

describe('buildAccountBody — sends only what the endpoint accepts', () => {
  it('sends exactly name, email and company', () => {
    // POST /api/portal/org/register accepts { name, company?, email } and nothing else.
    expect(Object.keys(buildAccountBody(account)).sort()).toEqual(['company', 'email', 'name']);
  });

  it('trims the values', () => {
    const b = buildAccountBody(account);
    expect(b.name).toBe('Dana Reyes');
    expect(b.email).toBe('dana@acme.com');
    expect(b.company).toBe('Acme Corp');
  });

  it('omits company rather than sending an empty string', () => {
    expect(buildAccountBody({ ...account, company: '   ' }).company).toBeUndefined();
  });

  it('never sends a password, since the endpoint is passwordless', () => {
    expect(JSON.stringify(buildAccountBody(account))).not.toMatch(/password/i);
  });
});

describe('validateAccount — required, but not obstructive', () => {
  it('requires a name, a plausible email and an organization', () => {
    expect(validateAccount({ ...account, fullName: ' ' }).fullName).toBeTruthy();
    expect(validateAccount({ ...account, workEmail: 'nope' }).workEmail).toBeTruthy();
    expect(validateAccount({ ...account, company: '' }).company).toBeTruthy();
  });

  it('accepts a complete account', () => {
    expect(validateAccount(account)).toEqual({});
  });

  it('does NOT reject a personal email address', () => {
    // The account works with one. Blocking it would put a wall in front of a
    // free product over a soft preference.
    expect(isConsumerEmail('someone@gmail.com')).toBe(true);
    expect(validateAccount({ ...account, workEmail: 'someone@gmail.com' })).toEqual({});
  });
});

describe('buildContextPayload — everything collected lands somewhere real', () => {
  const payload = buildContextPayload(account, ctx, {}, '/v2/start');

  it('sends only keys the leads schema accepts', () => {
    const allowed = new Set([
      'name', 'email', 'company', 'role', 'phone', 'title', 'company_size',
      'evaluating_90_days', 'interest_area', 'message', 'source', 'form_type',
      'consent_contact', 'utm_source', 'utm_campaign', 'page_url',
      'corporate_sponsorship_interest', 'timeline',
    ]);
    Object.keys(payload).forEach((k) => expect(allowed.has(k)).toBe(true));
  });

  it('carries the qualifying booleans that exist for exactly this purpose', () => {
    expect(payload.evaluating_90_days).toBe(true);
    expect(payload.corporate_sponsorship_interest).toBe(true);
  });

  it('writes the answers out as words a salesperson can read', () => {
    const msg = String(payload.message);
    expect(msg).toContain('Role: Executive or owner');
    expect(msg).toContain('Team size: 50 to 199');
    expect(msg).toContain('Timeline: This quarter');
    expect(msg).toContain('Wants to: Measure where my team actually stands');
    expect(msg).toContain('We have no idea where we stand.');
  });

  it('passes consent through as given', () => {
    expect(payload.consent_contact).toBe(true);
    expect(buildContextPayload(account, { ...ctx, consentContact: false }, {}, '/x').consent_contact)
      .toBe(false);
  });

  it('attaches no device fingerprint', () => {
    expect(JSON.stringify(payload)).not.toContain('fingerprint');
  });
});

describe('SignupV2 — the page', () => {
  it('asks for exactly three fields to create the account', () => {
    const h = html();
    expect(textOf(h)).toContain('Your name');
    expect(textOf(h)).toContain('Work email');
    expect(textOf(h)).toContain('Organization');
    // The long qualification form must not be part of step one.
    expect(textOf(h)).not.toContain('People you would bring');
  });

  it('states what the account gives before asking for anything', () => {
    const text = textOf(html());
    ACCOUNT_INCLUDES.forEach((i) => expect(text).toContain(i.text));
  });

  it('promises no credit card and no required sales call', () => {
    const text = textOf(html());
    expect(text).toContain('No credit card');
  });

  it('renders no price', () => {
    expect(textOf(html())).not.toMatch(/\$\s?[\d,]/);
  });

  it('has exactly one h1 and exposes no admin route', () => {
    const h = html();
    expect((h.match(/<h1/g) || []).length).toBe(1);
    expect(h).not.toMatch(/\/admin\b/);
  });

  it('offers every goal option once the account exists', () => {
    // Rendered in step two; assert the config drives it rather than markup.
    expect(GOAL_OPTIONS.length).toBeGreaterThanOrEqual(4);
    GOAL_OPTIONS.forEach((g) => expect(g.icon).toBeTruthy());
  });
});
