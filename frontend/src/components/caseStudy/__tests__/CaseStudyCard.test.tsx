import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import CaseStudyCard, { proofPointFor } from '../CaseStudyCard';
import { metric, summary } from '../__fixtures__/caseStudyPublicFixtures';
import type { PublicCaseStudySummary } from '../../../services/caseStudyPublicTypes';

/**
 * The card's one non-negotiable behaviour: a record with no verified metric
 * still renders a valid card, and it does not acquire a number on the way.
 *
 * This is the exact failure the whole build exists to replace. The page it
 * replaces carried invented figures beside invented quotations, and nothing on
 * screen said so. A layout that only looks finished with a big number in it is
 * the pressure that produces those figures, so the no-metric card has to be a
 * first-class layout rather than a degraded one.
 *
 * HOW "DID NOT INVENT A NUMBER" IS PROVED. Not by eyeballing the markup: the
 * test pulls every digit group out of the rendered card and asserts each one is
 * a number the payload STATES — compared as whole tokens against the payload's
 * own extracted numbers, not as a substring of its serialised JSON.
 *
 * That distinction is the whole test, and the first version of this suite got it
 * wrong. It used `JSON.stringify(payload).includes(n)`, which is a substring
 * check, and the payload is full of ISO timestamps: `'2026-08-01T00:00:00.000Z'`
 * alone makes '0', '1', '2', '6', '8' and '20' all "present". Verification
 * proved the hole by rendering `metric.limitations.length` as "1 noted limits" —
 * an invented number — and the suite passed 19/19. Tokenising both sides closes
 * it, and a derived array-length count now fails both assertions.
 *
 * So: a fabricated figure fails, a rounded "about 40%" fails, and a count
 * computed from an array length fails — each proven by mutation, not asserted.
 */

const render = (element: React.ReactElement): string =>
  renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);

const textOf = (markup: string): string =>
  markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Every digit run the reader can see, e.g. "41%", "1,204", "3.5". */
const numbersIn = (text: string): string[] => text.match(/\d[\d.,]*%?/g) ?? [];

/**
 * Every number the PAYLOAD actually states, as whole tokens.
 *
 * This exists because `JSON.stringify(payload).includes(n)` — the obvious check,
 * and the one this suite originally used — is a SUBSTRING test, and the payload
 * is full of ISO timestamps. `'2026-08-01T00:00:00.000Z'` alone makes `'0'`,
 * `'1'`, `'2'`, `'6'`, `'8'` and `'20'` all "present". So the weak check passed
 * for any small integer, and a derived figure like `metric.limitations.length`
 * rendered as "1 noted limits" shipped green — an invented number, which is
 * exactly what spec §22 forbids and what this test claims to prevent.
 *
 * Tokenising both sides closes it: a rendered `1` must correspond to a `1` the
 * payload states as its own value, not to a digit buried inside a date.
 */
function payloadNumbers(payload: unknown): Set<string> {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (typeof node === 'number') { found.add(String(node)); return; }
    if (typeof node === 'string') {
      // Skip ISO-8601 timestamps outright: their digits are structural, never a
      // claim the card is entitled to repeat.
      if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(node)) return;
      for (const token of numbersIn(node)) found.add(token);
      return;
    }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node === 'object') { Object.values(node as object).forEach(walk); }
  };
  walk(payload);
  return found;
}

/** Percent/comma variants of the same figure count as stated. */
function payloadStates(payload: unknown, rendered: string): boolean {
  const stated = payloadNumbers(payload);
  if (stated.has(rendered)) return true;
  const bare = rendered.replace(/[%,]/g, '');
  return stated.has(bare) || [...stated].some((s) => s.replace(/[%,]/g, '') === bare);
}

const card = (caseStudy: PublicCaseStudySummary, href: string | null = '/x/sample-record'): string =>
  render(<CaseStudyCard caseStudy={caseStudy} href={href} />);

describe('a record with no verified metric renders a proof point, never a number', () => {
  const noMetric = summary({ headlineMetric: null });

  it('renders a card at all', () => {
    const markup = card(noMetric);
    expect(markup).toContain('cbv2-cs-card');
    expect(textOf(markup)).toContain(noMetric.title);
  });

  it('marks the headline as a proof point rather than a metric', () => {
    const markup = card(noMetric);
    expect(markup).toContain('data-headline="proof-point"');
    expect(markup).toContain('data-proof-point="true"');
  });

  it('renders no metric element and no metric value', () => {
    const markup = card(noMetric);
    expect(markup).not.toContain('data-metric="true"');
    expect(markup).not.toContain('cbv2-metric__value');
  });

  it('prints no number that is not already in the payload', () => {
    for (const number of numbersIn(textOf(card(noMetric)))) {
      expect({ number, inPayload: payloadStates(noMetric, number) })
        .toEqual({ number, inPayload: true });
    }
  });

  it('draws the proof point from a fact on the record', () => {
    expect(proofPointFor(noMetric)).toEqual({
      value: 'Agentic workflow',
      label: 'Primary capability',
    });
    expect(textOf(card(noMetric))).toContain('Agentic workflow');
  });

  it('falls back through capability, deliverable and stack in that order', () => {
    const base = { headlineMetric: null, primaryCapability: null, capabilities: [] as string[] };
    expect(proofPointFor(summary({ ...base }))?.value).toBe('Planner console');
    expect(proofPointFor(summary({ ...base, deliverables: [] }))?.value).toBe('Claude');
  });

  it('renders a still-valid card when the record carries no facts to point at', () => {
    const bare = summary({
      headlineMetric: null,
      primaryCapability: null,
      capabilities: [],
      deliverables: [],
      stack: [],
      standfirst: null,
    });
    const markup = card(bare);
    expect(proofPointFor(bare)).toBeNull();
    expect(markup).toContain('data-headline="none"');
    // Still a complete card: title, and the record's own verification pair.
    expect(textOf(markup)).toContain(bare.title);
    expect(markup).toContain('data-verification-class="verified"');
    expect(numbersIn(textOf(markup))).toEqual([]);
  });
});

describe('a record with a verified metric renders it through the shared Metric', () => {
  const withMetric = summary();

  it('marks the headline as a metric and labels the figure with its class', () => {
    const markup = card(withMetric);
    expect(markup).toContain('data-headline="metric"');
    expect(markup).toContain('data-metric="true"');
    expect(markup).toContain('data-evidence="verified"');
  });

  it('prints the approved value display verbatim', () => {
    expect(textOf(card(withMetric))).toContain('41% fewer');
  });

  it('prints no number that is not already in the payload', () => {
    for (const number of numbersIn(textOf(card(withMetric)))) {
      expect({ number, inPayload: payloadStates(withMetric, number) })
        .toEqual({ number, inPayload: true });
    }
  });

  it('shows the figure its own badge when it was verified differently from the record', () => {
    const differing = summary({
      verificationClass: 'verified',
      verificationMethod: 'repo',
      headlineMetric: metric({ verificationClass: 'anonymized', verificationMethod: 'client' }),
    });
    const markup = card(differing);
    expect(markup).toContain('data-verification-method="client"');
    expect(markup).toContain('data-verification-method="repo"');
  });
});

describe('links, images and headings', () => {
  it('links the title when the surface has a route', () => {
    const markup = card(summary());
    expect(markup).toContain('href="/x/sample-record"');
    // The accessible name of the link is the title, not "read more".
    expect(markup).toMatch(/<a[^>]*>A routing agent for dispatch planners<\/a>/);
  });

  it('renders the title as plain text when there is no route to link to', () => {
    const markup = card(summary(), null);
    expect(markup).not.toContain('<a ');
    expect(textOf(markup)).toContain('A routing agent for dispatch planners');
  });

  it('renders no image element when no approved image exists', () => {
    expect(card(summary())).not.toContain('<img');
  });

  it('marks an approved image decorative when no human wrote alt text for it', () => {
    // The heading sits beside it and carries the meaning. Inventing a
    // description of an image this code has never seen would be a fabrication,
    // and repeating the title would make a screen reader say it twice.
    const markup = card(summary({ heroImageUrl: 'https://example.org/a.png' }));
    expect(markup).toContain('alt=""');
  });

  it('uses real alt text when a caller supplies it', () => {
    const markup = render(
      <CaseStudyCard
        caseStudy={summary({ heroImageUrl: 'https://example.org/a.png' })}
        href="/x/sample-record"
        imageAlt="The dispatch console showing four planned routes"
      />,
    );
    expect(markup).toContain('alt="The dispatch console showing four planned routes"');
  });

  it('fits whatever heading outline the page has', () => {
    const markup = render(
      <CaseStudyCard caseStudy={summary()} href="/x/sample-record" headingLevel={2} />,
    );
    expect(markup).toContain('<h2 class="cbv2-cs-card__title"');
  });

  it('says who built it in words, not only in a colour', () => {
    expect(textOf(card(summary()))).toContain('Colaberry team');
  });

  it('omits the context line entirely when consent left nothing to show', () => {
    const anonymous = summary({ organizationLabel: null, industry: null, programLabel: null });
    expect(card(anonymous)).not.toContain('cbv2-cs-eyebrow');
  });
});
