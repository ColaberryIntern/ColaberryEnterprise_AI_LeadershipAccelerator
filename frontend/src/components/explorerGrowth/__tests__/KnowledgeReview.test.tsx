import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { confidenceBadge, QuotableNote } from '../KnowledgeDocumentReview';

/**
 * `drafted-verify` is the trap, and these assertions exist to keep the UI out of it.
 *
 * The name reads like a softer approval — "drafted, pending verification" — and it behaves
 * like a refusal: `decideKnowledgeQuote` blocks it with exactly the same force as
 * `unstated`. So a reviewer shown a green-ish badge, or a "partially approved" phrasing,
 * would reasonably believe their document was live. It would not be, and the symptom
 * arrives much later as someone wondering why the composer never mentions their policy.
 *
 * The same distinguishability failure this subtree has shipped before: an outage and an
 * empty result rendered identically, and the calm reading was the one that stuck.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('the badge never implies a document is approved when it is not', () => {
  it('gives only `grounded` the approved tone', () => {
    expect(confidenceBadge('grounded', null)).toEqual({ tone: 'bg-success', label: 'Approved' });
  });

  it('does NOT give drafted-verify a success tone', () => {
    const badge = confidenceBadge('drafted-verify', null);

    // The gate refuses it as hard as `unstated`. Any shade of the approved green here is a
    // claim the system does not honour.
    expect(badge.tone).not.toContain('success');
    expect(badge.label).toBe('Needs checking');
  });

  it('does not label drafted-verify with anything that reads as approval', () => {
    expect(confidenceBadge('drafted-verify', null).label.toLowerCase()).not.toContain('approv');
  });

  it('marks an unreviewed document as unreviewed, not as pending-something', () => {
    expect(confidenceBadge('unstated', null)).toEqual({
      tone: 'bg-secondary',
      label: 'Unreviewed',
    });
  });

  it('lets RETIRED win over any confidence, including grounded', () => {
    // A retired document is not quotable whatever its confidence column says. A badge that
    // read "Approved" on withdrawn text would be the most misleading state in the surface.
    expect(confidenceBadge('grounded', '2026-10-30T00:00:00.000Z')).toEqual({
      tone: 'bg-dark',
      label: 'Retired',
    });
  });
});

describe('the in-use line is stated in both directions', () => {
  it('says plainly that an approved document is live', () => {
    const markup = html(<QuotableNote quotable />);

    expect(markup).toContain('In use');
    expect(markup).toContain('can quote this document now');
  });

  it('says plainly that an unapproved document is not', () => {
    const markup = html(<QuotableNote quotable={false} />);

    // Never left implied. "Not approved yet" and "approved but switched off" look the same
    // to a reader who is only told what the document is NOT.
    expect(markup).toContain('Not in use');
    // The whole clause, not a fragment: "can be quoted yet" on its own would also match a
    // sentence saying the opposite, and the negation is the entire point of this line.
    expect(markup).toContain('nothing in this document can be quoted yet');
  });

  it('renders a different message for each state rather than one hedged line', () => {
    expect(html(<QuotableNote quotable />)).not.toBe(html(<QuotableNote quotable={false} />));
  });
});
