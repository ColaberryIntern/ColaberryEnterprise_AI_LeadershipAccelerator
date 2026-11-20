/**
 * DemoPilotV2.test.tsx — /demo-pilot, the single conversion page.
 *
 * The load-bearing assertions here are about CONSENT, not layout. This page
 * replaces /contact, which has always required an explicit `consentContact`
 * tick before it would submit. The v5 design model's form does not have one.
 * Carrying it over is the difference between a redesign and a compliance
 * regression, so it is pinned here rather than left to a code review.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DemoPilotV2 } from '../DemoPilotV2';
import { EMPTY, formatHours, hoursPerYear, toIntakeBody, validate } from '../demoPilotModel';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/demo-pilot']}>
      <DemoPilotV2 />
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('DemoPilotV2 — consent', () => {
  it('renders a consent checkbox', () => {
    const h = html();
    expect(h).toContain('name="consentContact"');
    expect(h).toContain('type="checkbox"');
  });

  it('does not pre-tick it', () => {
    // A pre-ticked consent box is not consent. If this ever renders `checked`,
    // the page is collecting agreement nobody gave.
    const h = html();
    const box = h.slice(h.indexOf('name="consentContact"') - 200, h.indexOf('name="consentContact"') + 200);
    expect(box).not.toContain('checked=""');
  });

  it('labels the checkbox, and ties the label to it', () => {
    const h = html();
    expect(h).toContain('id="dp-consent"');
    expect(h).toContain('for="dp-consent"');
    expect(textOf(h)).toContain('I agree that Colaberry may contact me');
  });

  it('W28: asks for a mobile number only for the AI call, with no call tick until a number is typed', () => {
    // The AI call needs its own grant, tied to the number. The general "may contact me"
    // tick must never stand in for it, so the call tick only appears beside a number.
    const h = html();
    expect(h).toContain('name="phone"');
    expect(h).not.toContain('name="callConsent"');
  });
});

describe('W28: demoPilotModel', () => {
  const filled = {
    ...EMPTY,
    fullName: 'Dana',
    email: 'dana@acme.test',
    company: 'Acme',
    process: 'Re-keying orders',
    consentContact: true,
  };

  it('requires a company, because we research it before we meet', () => {
    expect(validate({ ...filled, company: '' }).company).toBeTruthy();
    expect(validate(filled)).toEqual({});
  });

  it('never sends a call grant without a number', () => {
    expect(toIntakeBody({ ...filled, callConsent: true, phone: '' }, {}).callConsent).toBe(false);
    expect(validate({ ...filled, callConsent: true, phone: '12' }).phone).toBeTruthy();
    expect(toIntakeBody({ ...filled, callConsent: true, phone: '214 555 0100' }, {}).callConsent).toBe(true);
  });

  it('sends the two cost numbers as numbers, and blanks as null', () => {
    const body = toIntakeBody({ ...filled, peopleCount: '4', hoursPerWeek: '1,200' }, {});
    expect(body).toMatchObject({ peopleCount: 4, hoursPerWeek: 1200 });
    expect(toIntakeBody(filled, {})).toMatchObject({ peopleCount: null, hoursPerWeek: null });
  });

  it('shows hours a year from their hours a week, and nothing when they gave none', () => {
    expect(hoursPerYear(20)).toBe(1040);
    expect(hoursPerYear(null)).toBeNull();
    expect(hoursPerYear(0)).toBeNull();
    expect(formatHours(1040)).toBe('1,040');
  });
});

describe('DemoPilotV2 — the two figures', () => {
  it('asks for both, inside a real fieldset with a legend', () => {
    const h = html();
    expect(h).toContain('<fieldset');
    expect(h).toContain('<legend');
    expect(textOf(h)).toContain('The two figures');
    // W28: the cost is two numbers (people, hours a week), so it can be shown back as hours a year.
    expect(h).toContain('name="peopleCount"');
    expect(h).toContain('name="hoursPerWeek"');
    expect(h).toContain('name="requiredReturn"');
  });

  it('asks which process to start with', () => {
    expect(html()).toContain('name="process"');
  });

  it('states no figure of its own', () => {
    // The page asks the customer for numbers. It must not supply any.
    expect(textOf(html())).not.toMatch(/\$\s?[\d,]/);
  });
});

describe('DemoPilotV2 — the page', () => {
  it('has exactly one h1', () => {
    expect((html().match(/<h1/g) || []).length).toBe(1);
  });

  it('says what happens after you send it', () => {
    const text = textOf(html());
    // W28: the AI interview comes first, and the first meeting starts with options.
    expect(text).toContain('Talk to our AI for 10 minutes');
    expect(text).toContain('We do the homework');
    expect(text).toContain('Our first meeting starts with your options');
  });

  it('offers an email route for anyone who will not fill in a form', () => {
    expect(html()).toContain('mailto:info@colaberry.com');
  });

  it('labels every input, so none is placeholder-only', () => {
    const h = html();
    const ids = Array.from(h.matchAll(/<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)).map(
      (m) => m[1],
    );
    expect(ids.length).toBeGreaterThan(5);
    ids.forEach((id) => expect(h).toContain(`for="${id}"`));
  });
});
