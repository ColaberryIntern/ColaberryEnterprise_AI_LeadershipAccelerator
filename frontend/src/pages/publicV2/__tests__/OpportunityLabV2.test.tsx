/**
 * OpportunityLabV2.test.tsx
 *
 * Two things carry real risk on this page and both are asserted directly rather
 * than through the markup:
 *   1. The payload. What it OMITS matters more than what it contains -- no
 *      visitor fingerprint, no client-computed score, nothing the person did not
 *      knowingly provide.
 *   2. The absence of a scored result. The scoring backend does not exist, so any
 *      number presented as analysis would be fabricated.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import OpportunityLabV2 from '../OpportunityLabV2';
import {
  LAB_STEPS,
  LAB_FORM_TYPE,
  buildLeadPayload,
  validateContact,
  composeSummary,
  LabContact,
} from '../../../config/v2Lab';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/v2/lab']}>
      <OpportunityLabV2 />
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const contact: LabContact = {
  name: '  Dana Reyes  ',
  email: '  dana@example.com  ',
  company: ' Example Co ',
  title: ' Director of Operations ',
  companySize: '251-1000',
  timeline: 'this_quarter',
  consent: true,
};

const answers = {
  function: 'operations',
  friction: 'manual_review',
  volume: 'daily',
  outcome: 'capacity',
};

describe('buildLeadPayload — what it omits', () => {
  const payload = buildLeadPayload(contact, answers, 'Some context.', {}, '/v2/lab');

  it('never sends a visitor fingerprint', () => {
    expect(payload).not.toHaveProperty('visitor_fingerprint');
    expect(JSON.stringify(payload)).not.toContain('fingerprint');
  });

  it('sends no score, rating or ROI figure', () => {
    ['score', 'lead_score', 'roi', 'rating', 'readiness', 'payback'].forEach((k) => {
      expect(payload).not.toHaveProperty(k);
    });
  });

  it('sends only keys the leads schema accepts', () => {
    // Mirrors leadSchema in backend/src/services/leadService.ts. A key outside
    // this set would be silently dropped or rejected server-side.
    const allowed = new Set([
      'name', 'email', 'company', 'role', 'phone', 'title', 'company_size',
      'evaluating_90_days', 'interest_area', 'message', 'source', 'form_type',
      'consent_contact', 'utm_source', 'utm_campaign', 'page_url',
      'corporate_sponsorship_interest', 'timeline',
    ]);
    Object.keys(payload).forEach((k) => expect(allowed.has(k)).toBe(true));
  });
});

describe('buildLeadPayload — what it carries', () => {
  const payload = buildLeadPayload(contact, answers, 'Some context.', {}, '/v2/lab');

  it('trims the free-text identity fields', () => {
    expect(payload.name).toBe('Dana Reyes');
    expect(payload.email).toBe('dana@example.com');
    expect(payload.company).toBe('Example Co');
    expect(payload.title).toBe('Director of Operations');
  });

  it('passes consent through as given, never defaulted to true', () => {
    expect(payload.consent_contact).toBe(true);
    const declined = buildLeadPayload({ ...contact, consent: false }, answers, '', {}, '/v2/lab');
    expect(declined.consent_contact).toBe(false);
  });

  it('tags the submission so it is distinguishable from other forms', () => {
    expect(payload.form_type).toBe(LAB_FORM_TYPE);
    expect(payload.interest_area).toBe('operations');
  });

  it('merges UTM parameters without letting them overwrite answers', () => {
    const withUtm = buildLeadPayload(
      contact, answers, '', { utm_source: 'linkedin', utm_campaign: 'q3' }, '/v2/lab',
    );
    expect(withUtm.utm_source).toBe('linkedin');
    expect(withUtm.form_type).toBe(LAB_FORM_TYPE);
  });
});

describe('composeSummary — readable by a person, not a JSON blob', () => {
  it('writes each answer out in full so the label is recoverable', () => {
    const s = composeSummary(answers, '');
    expect(s).toContain('Function: Operations');
    expect(s).toContain('Friction: Manual review of documents or data');
    expect(s).toContain('Frequency: Daily');
    expect(s).toContain('Desired outcome: More throughput without more headcount');
  });

  it('marks unanswered questions rather than omitting them', () => {
    expect(composeSummary({ function: 'finance' }, '')).toContain('Not answered');
  });

  it('includes free text only when given', () => {
    expect(composeSummary(answers, '   ')).not.toContain('In their words');
    expect(composeSummary(answers, 'We close books late.')).toContain('We close books late.');
  });
});

describe('OpportunityLabV2 — no fabricated analysis', () => {
  it('presents no score, ROI or payback figure', () => {
    const text = textOf(html());
    expect(text).not.toMatch(/\b\d+%\s*(ROI|return)/i);
    expect(text).not.toContain('your score');
    expect(text).not.toContain('Readiness score');
    expect(text).not.toMatch(/payback/i);
  });

  it('explains why there is no instant score', () => {
    expect(textOf(html())).toContain('Why there is no instant score');
  });

  it('states that the scored assessment is in development', () => {
    expect(textOf(html())).toMatch(/In development/i);
  });

  it('renders no price', () => {
    expect(textOf(html())).not.toMatch(/\$\s?[\d,]/);
  });
});

describe('validateContact — consent is not optional', () => {
  it('refuses to submit without explicit consent', () => {
    const errors = validateContact({ ...contact, consent: false });
    expect(errors.consent).toBeTruthy();
  });

  it('accepts a complete, consented contact', () => {
    expect(validateContact(contact)).toEqual({});
  });

  it('requires a name and a plausible email', () => {
    expect(validateContact({ ...contact, name: '   ' }).name).toBeTruthy();
    expect(validateContact({ ...contact, email: '' }).email).toBeTruthy();
    expect(validateContact({ ...contact, email: 'not-an-address' }).email).toBeTruthy();
  });
});

describe('OpportunityLabV2 — structure', () => {
  it('opens on the first step, before any contact detail is asked for', () => {
    const text = textOf(html());
    expect(text).toContain(LAB_STEPS[0].question);
  });

  it('marks the current step for assistive technology', () => {
    expect(html()).toContain('aria-current="step"');
  });

  it('has exactly one h1', () => {
    expect((html().match(/<h1/g) || []).length).toBe(1);
  });

  it('exposes no admin route', () => {
    expect(html()).not.toMatch(/\/admin\b/);
  });
});
