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

  it('collects no phone number, which is why there is no phone-consent tick', () => {
    // /contact asked for a phone and therefore needed a second, separate
    // consent. This page does not ask, so it must not imply it might call.
    const h = html();
    expect(h).not.toContain('name="phone"');
    expect(h).not.toContain('autoComplete="tel"');
  });
});

describe('DemoPilotV2 — the two figures', () => {
  it('asks for both, inside a real fieldset with a legend', () => {
    const h = html();
    expect(h).toContain('<fieldset');
    expect(h).toContain('<legend');
    expect(textOf(h)).toContain('The two figures');
    expect(h).toContain('name="costToday"');
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
    expect(text).toContain('An architect reads it');
    expect(text).toContain('We meet the leader and the experts');
    expect(text).toContain('You see the demo pilot');
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
