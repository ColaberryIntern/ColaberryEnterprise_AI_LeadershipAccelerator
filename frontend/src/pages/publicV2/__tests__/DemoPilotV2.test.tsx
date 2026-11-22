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
import {
  EMPTY,
  SERVICE_CHOICES,
  formatHours,
  hoursPerYear,
  toIntakeBody,
  validate,
} from '../demoPilotModel';

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
    // R23 Phase 5: the service answer is required, so a "filled" form has one. The value is
    // the plan KEY the backend groups revenue by, not the chip's display word.
    service: 'build',
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

  /**
   * R23 Phase 5 — the service question is answered, and the answer is a plan key.
   *
   * Two separate claims, and both matter to the revenue board. An OPTIONAL question could be
   * skipped, and a skipped answer is indistinguishable there from a question nobody asked.
   * A LABEL as the stored value worked by coincidence for three of the four chips, because
   * "Build" lowercases to the key "build", and broke on the fourth.
   */
  describe('the service answer', () => {
    it('requires one, and counts "Not sure yet" as one', () => {
      expect(validate({ ...filled, service: '' }).service).toBeTruthy();
      // Requiring an answer is not requiring a decision. This is the escape hatch, and it
      // must satisfy the validator or the requirement would force a guess.
      expect(validate({ ...filled, service: 'not_sure' })).toEqual({});
    });

    it('accepts each of the four answers and nothing else', () => {
      for (const value of SERVICE_CHOICES.map((c) => c.value)) {
        expect(validate({ ...filled, service: value })).toEqual({});
      }
      // The display word is no longer a valid submission from this form, which is what keeps
      // the stored value canonical rather than leaving it to the backend's leniency.
      expect(validate({ ...filled, service: 'Build' }).service).toBeTruthy();
      expect(validate({ ...filled, service: 'anything else' }).service).toBeTruthy();
    });

    it('sends the key on the wire, not the chip\'s wording', () => {
      expect(toIntakeBody({ ...filled, service: 'not_sure' }, {}).service).toBe('not_sure');
      expect(toIntakeBody({ ...filled, service: 'train' }, {}).service).toBe('train');
    });

    it('offers exactly the three plans plus an honest "not sure"', () => {
      expect(SERVICE_CHOICES.map((c) => c.value)).toEqual(['build', 'guide', 'train', 'not_sure']);
      // The words the buyer reads are unchanged by this phase, deliberately: the stored value
      // changed, the page did not.
      expect(SERVICE_CHOICES.map((c) => c.label)).toEqual(['Build', 'Guide', 'Train', 'Not sure yet']);
    });
  });
});

describe('DemoPilotV2 — the service question on the page', () => {
  const serviceFieldset = (h: string): string => {
    const at = h.indexOf('Which service are you considering?');
    expect(at).toBeGreaterThan(-1);
    return h.slice(at, h.indexOf('</fieldset>', at));
  };

  it('posts the plan keys as the radio values', () => {
    const set = serviceFieldset(html());
    for (const value of ['build', 'guide', 'train', 'not_sure']) {
      expect(set).toContain(`value="${value}"`);
    }
    // And not the old display words, which is the regression this guards.
    expect(set).not.toContain('value="Build"');
    expect(set).not.toContain('value="Not sure yet"');
  });

  it('no longer calls the question optional', () => {
    // Scoped to this fieldset on purpose: "optional" is correct elsewhere on the form, on
    // the website and role fields, so a whole-page assertion would be wrong rather than
    // strict.
    expect(serviceFieldset(html())).not.toContain('optional');
  });

  it('still shows the buyer the same four words', () => {
    const set = textOf(serviceFieldset(html()));
    expect(set).toContain('Build');
    expect(set).toContain('Guide');
    expect(set).toContain('Train');
    expect(set).toContain('Not sure yet');
  });

  it('pre-selects nothing, so the plan recorded is the one they chose', () => {
    // A pre-ticked chip would manufacture attribution for a prospect who never answered,
    // which is worse than the gap this phase closed: a wrong number reads as a real one.
    expect(serviceFieldset(html())).not.toContain('checked');
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
