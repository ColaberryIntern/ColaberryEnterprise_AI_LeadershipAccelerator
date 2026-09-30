import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvidenceBadge } from '../../publicV2/Claim';
import CaseStudyVerificationBadge from '../CaseStudyVerificationBadge';
import { VERIFICATION_METHOD_LABELS } from '../../../config/caseStudySurfaces';
import type {
  CaseStudyVerificationMethod,
  PublicVerificationClass,
} from '../../../services/caseStudyPublicTypes';

/**
 * The badge is where two surfaces are kept from drifting apart.
 *
 * `/proof` explains the evidence classes and `/stories` labels records with
 * them. If either page owned its own copy of the words, one of them would
 * eventually be edited alone, and the site would be saying "Anonymized" in one
 * place and "Anonymised" or "Client-confirmed" in another for the same state -
 * a difference a reader can only read as two different meanings.
 *
 * So the class half of this badge is not styled to look like `EvidenceBadge`; it
 * IS `EvidenceBadge`. The first test proves that by output identity rather than
 * by checking the import line, because an import can be present and unused.
 *
 * The second test reads `Claim.tsx` as text and pins the four labels. If someone
 * reworded one there, this suite names the file and the word, which is the only
 * way a shared vocabulary stays shared.
 */

const CLAIM_SOURCE = path.join(__dirname, '..', '..', 'publicV2', 'Claim.tsx');

const html = (
  verificationClass: PublicVerificationClass,
  verificationMethod: CaseStudyVerificationMethod,
): string =>
  renderToStaticMarkup(
    <CaseStudyVerificationBadge
      verificationClass={verificationClass}
      verificationMethod={verificationMethod}
    />,
  );

const textOf = (markup: string): string =>
  markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const PUBLIC_CLASSES: readonly PublicVerificationClass[] = ['verified', 'anonymized', 'illustrative'];
const METHODS: readonly CaseStudyVerificationMethod[] = [
  'client', 'repo', 'platform', 'internal', 'self', 'manual',
];

describe('the class half is the shared EvidenceBadge, not a copy of it', () => {
  it.each(PUBLIC_CLASSES)('renders %s through EvidenceBadge verbatim', (evidence) => {
    const shared = renderToStaticMarkup(<EvidenceBadge evidence={evidence} />);
    expect(html(evidence, 'repo')).toContain(shared);
  });

  it('carries the assertable data attributes the proof tests already use', () => {
    expect(html('verified', 'repo')).toContain('data-evidence="verified"');
    expect(html('verified', 'repo')).toContain('cbv2-evidence--verified');
  });
});

describe('the four evidence labels are pinned to Claim.tsx', () => {
  const source = fs.readFileSync(CLAIM_SOURCE, 'utf8');

  it('still declares the four-member union', () => {
    expect(source).toContain(
      "export type EvidenceClass = 'verified' | 'anonymized' | 'illustrative' | 'pending';",
    );
  });

  it.each([
    ['verified', 'Verified'],
    ['anonymized', 'Anonymized'],
    ['illustrative', 'Illustrative demo'],
    ['pending', 'Pending approval'],
  ])('still labels %s as "%s"', (key, label) => {
    expect(source).toMatch(new RegExp(`${key}:\\s*'${label}'`));
  });

  it('renders the pinned label for every class this surface can receive', () => {
    const labels: Record<PublicVerificationClass, string> = {
      verified: 'Verified',
      anonymized: 'Anonymized',
      illustrative: 'Illustrative demo',
    };
    for (const evidence of PUBLIC_CLASSES) {
      expect(textOf(html(evidence, 'repo'))).toContain(labels[evidence]);
    }
  });
});

describe('class and method are rendered as two axes, never collapsed into one', () => {
  it('shows the method beside the class', () => {
    const text = textOf(html('verified', 'repo'));
    expect(text).toContain('Verified');
    expect(text).toContain('Repository');
  });

  it.each(METHODS)('renders a distinct word for method %s', (method) => {
    const text = textOf(html('verified', method));
    expect(text).toContain(VERIFICATION_METHOD_LABELS[method]);
  });

  it('gives every method a label, and never the same word twice', () => {
    const labels = METHODS.map((m) => VERIFICATION_METHOD_LABELS[m]);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(METHODS.length);
  });

  it('exposes both axes as data attributes so a page test can assert the pair', () => {
    const markup = html('anonymized', 'client');
    expect(markup).toContain('data-verification-class="anonymized"');
    expect(markup).toContain('data-verification-method="client"');
  });

  it('labels a self-reported figure as self-reported rather than as verification', () => {
    // The publish gate lets a self-attested number ship only at a class that
    // makes no third-party claim. That bargain only holds if the surface says
    // which method produced the class.
    expect(textOf(html('illustrative', 'self'))).toContain('Self-reported');
  });

  it('says nothing in colour alone', () => {
    // Every state is a word; the only glyphs are aria-hidden decoration.
    const markup = html('verified', 'repo');
    expect(markup).toContain('aria-hidden="true"');
    expect(textOf(markup).length).toBeGreaterThan('Verified'.length);
  });
});
