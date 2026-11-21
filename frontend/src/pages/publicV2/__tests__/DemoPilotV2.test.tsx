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

  it('PH1: asks for a REQUIRED phone, with its own optional call/text tick beside it', () => {
    // Ali, 2026-11-19: every public lead form requires a phone number. The permission to call
    // it is a separate tick: always shown, unticked, not required. W28: it is also what lets
    // the AI interview call them.
    const h = html();
    expect(h).toContain('name="phone"');
    expect(h).toMatch(/id="dp-phone"[^>]*required/);
    expect(h).toContain('name="callConsent"');
    // Static markup escapes the apostrophe in the wording, so match a span without one.
    expect(textOf(h)).toContain('including with AI-assisted or automated calls');
    expect(h).not.toMatch(/id="dp-phone-consent"[^>]*checked/);
  });
});

describe('W28: demoPilotModel', () => {
  const filled = {
    ...EMPTY,
    fullName: 'Dana',
    email: 'dana@acme.test',
    phone: '214 555 0100',
    company: 'Acme',
    process: 'Re-keying orders',
    consentContact: true,
  };

  it('requires a company, because we research it before we meet', () => {
    expect(validate({ ...filled, company: '' }).company).toBeTruthy();
    expect(validate(filled)).toEqual({});
  });

  it('PH1: requires a phone number, and sends the call grant only when ticked', () => {
    expect(validate({ ...filled, phone: '' }).phone).toBeTruthy();
    expect(validate({ ...filled, phone: '555 0100' }).phone).toBeTruthy();
    expect(toIntakeBody(filled, {}).callConsent).toBe(false);
    expect(toIntakeBody({ ...filled, callConsent: true }, {}).callConsent).toBe(true);
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
    // W28 + v2: the AI interview (now or later) comes first, then our research and ROI-ranked
    // options, then the meeting with Ali, booked in the same visit.
    expect(text).toContain('A 10-minute AI interview, now or later');
    expect(text).toContain('instead of a 20 to 30 minute call with everyone');
    expect(text).toContain('We do the homework');
    expect(text).toContain('Pilot options ranked by potential return');
    expect(text).toContain('Meet with Ali, booked in the same visit');
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
