/**
 * ProofV2.test.tsx
 *
 * The load-bearing assertions, in order of what would actually damage us:
 *   1. Withdrawing a claim must not reprint it. Listing "what we took down" is
 *      the most dangerous section on the site to get wrong, because the natural
 *      way to write it puts every suppressed claim back on the page.
 *   2. The two counts must come from the registry, not from a literal, so they
 *      cannot drift from the mechanism they describe.
 *   3. The unbuilt per-record surface must be described in future tense and
 *      never depicted.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import ProofV2 from '../ProofV2';
import { EVIDENCE_CLASSES, WITHDRAWN, GATES } from '../../../config/v2Proof';
import { blockedClaims, CLAIMS } from '../../../config/claimsRegistry';

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/v2/proof']}>
      <ProofV2 />
    </MemoryRouter>,
  );

const textOf = (h: string): string => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('ProofV2 — withdrawing a claim must not reprint it', () => {
  it('renders no blocked claim wording, even while listing what was withdrawn', () => {
    const text = textOf(html());
    blockedClaims().forEach((c) => {
      expect(text).not.toContain(c.publicWording);
    });
  });

  it('names no unearned designation or untraceable figure', () => {
    const text = textOf(html());
    [
      'Anthropic',
      'Certified Anthropic AI Systems Architect',
      'Official',
      'Select Partner',
      'Preferred Partner',
      '5,000+',
      '10,000+',
      '$100M',
      '477%',
      'Since 2012',
      'Vistage',
      'EOS',
      'ActionCOACH',
      'C12',
      'Scaling Up',
      'Pinnacle',
    ].forEach((banned) => expect(text).not.toContain(banned));
  });

  it('describes every withdrawal by category and reason', () => {
    const text = textOf(html());
    WITHDRAWN.forEach((w) => {
      expect(text).toContain(w.category);
      expect(text).toContain(w.reason);
    });
  });

  it('explains why the withdrawals are worded generically', () => {
    expect(textOf(html())).toContain('would put it back in front of you');
  });
});

describe('ProofV2 — the counts are derived, not typed', () => {
  it('shows the registry-derived count of claims withheld for lack of evidence', () => {
    const expected = blockedClaims().filter(
      (c) => c.verification !== 'VERIFIED' && c.verification !== 'ILLUSTRATIVE',
    ).length;
    expect(expected).toBeGreaterThan(0);
    expect(textOf(html())).toContain(`${expected} claims withheld because the evidence was not there`);
  });

  it('shows the registry-derived count of surfaces withheld as unbuilt', () => {
    const expected = blockedClaims().filter((c) => c.capability === 'unbuilt').length;
    expect(expected).toBeGreaterThan(0);
    expect(textOf(html())).toContain(`${expected} surfaces not shown because they are not built yet`);
  });

  it('reports the two reasons separately rather than one combined total', () => {
    // The registry blocks a claim for either reason, so a single total would hide
    // the very distinction this page exists to draw. Assert two distinct figures
    // are presented, each with its own reason.
    const h = html();
    const text = textOf(h);
    expect((h.match(/data-metric="true"/g) || []).length).toBe(2);
    expect(text).toContain('because the evidence was not there');
    expect(text).toContain('because they are not built yet');
    expect(text).not.toContain('claims blocked');
  });

  it('tracks the registry: a claim added to CLAIMS would move the count', () => {
    // Guards against someone replacing the derived value with a literal later.
    const rendered = textOf(html());
    const truth = blockedClaims().filter(
      (c) => c.verification !== 'VERIFIED' && c.verification !== 'ILLUSTRATIVE',
    ).length;
    expect(CLAIMS.length).toBeGreaterThan(truth);
    expect(rendered).toContain(String(truth));
  });
});

describe('ProofV2 — the unbuilt surface is described, never depicted', () => {
  it('states plainly that per-record proof is in development', () => {
    expect(textOf(html())).toMatch(/In development/i);
  });

  it('describes the planned surface in future tense', () => {
    const text = textOf(html());
    expect(text).toContain('will carry its evidence class');
  });

  it('depicts no proof records', () => {
    const text = textOf(html());
    expect(text).not.toContain('Reviewed by');
    expect(text).not.toContain('Evidence ID');
  });
});

describe('ProofV2 — the evidence standard', () => {
  it('documents all four evidence classes with the real badge component', () => {
    const h = html();
    EVIDENCE_CLASSES.forEach((c) => {
      expect(h).toContain(`data-evidence="${c.key}"`);
      expect(textOf(h)).toContain(c.meaning);
      expect(textOf(h)).toContain(c.rule);
    });
  });

  it('states both gates', () => {
    const text = textOf(html());
    GATES.forEach((g) => expect(text).toContain(g.title));
  });

  it('gives every metric an evidence class', () => {
    const h = html();
    const metrics = (h.match(/data-metric="true"/g) || []).length;
    expect(metrics).toBe(2);
    const labelled = (h.match(/data-evidence="/g) || []).length;
    expect(labelled).toBeGreaterThanOrEqual(metrics);
  });
});

describe('ProofV2 — structure', () => {
  it('has exactly one h1', () => {
    expect((html().match(/<h1/g) || []).length).toBe(1);
  });

  it('exposes no admin route', () => {
    expect(html()).not.toMatch(/\/admin\b/);
  });

  it('renders no price', () => {
    expect(textOf(html())).not.toMatch(/\$\s?[\d,]/);
  });
});
