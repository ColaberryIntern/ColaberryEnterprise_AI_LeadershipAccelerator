import React from 'react';
import HirePersonFirstPreview, { NO_PERSON_COPY } from '../HirePersonFirstPreview';
import * as H from '../__fixtures__/domHarness';
import * as F from '../__fixtures__/caseStudyAdminFixtures';
import type { CaseStudyLinkedPerson } from '../../../services/caseStudyAdminTypes';

/**
 * The HIRE lens in the admin preview: person-first when the record resolves to someone,
 * and an unmissable refusal band when it resolves to nobody. Rendered through the same
 * harness the rest of the admin suites use.
 */

const person = (over: Partial<CaseStudyLinkedPerson> = {}): CaseStudyLinkedPerson => ({
  portfolioSlug: 'ann-lee', pageStatus: 'published', pageVisibility: 'public', listed: true,
  name: 'Ann Lee', avatarUrl: null, role: 'AI Systems Architect', cohort: 'July 2026',
  availability: { kind: 'open', label: 'Open to FDE roles' }, spotlight: false,
  proof: { publishedCaseStudies: 2, verifiedCommits: 7, capabilitiesProven: 3, filesCommitted: 412 },
  ...over,
});

function render(p: CaseStudyLinkedPerson | null): void {
  H.mount(
    <HirePersonFirstPreview person={p} projection={F.projectionFixture()} surface={F.surfaceViewFixture('hire')} />,
    '/',
  );
}

afterEach(() => H.unmount());

describe('HirePersonFirstPreview', () => {
  it('leads with the builder band and the proof ledger, above the record', () => {
    render(person());
    const band = H.el('cs-hire-person-band');
    expect(H.el('cs-hire-person-name').textContent).toBe('Ann Lee');
    expect(band.textContent).toContain('Case-study verified · 2 published');
    expect(band.textContent).toContain('Open to FDE roles');
    expect(H.el('cs-hire-proof-ledger').textContent).toContain('412');
    // The band precedes the article in document order: person first.
    const article = document.querySelector('article');
    expect(article).not.toBeNull();
    expect(band.compareDocumentPosition(article as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(H.query('cs-hire-refusal')).toBeNull();
  });

  it('keeps Request intro inert inside the preview frame', () => {
    render(person());
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Request intro');
    expect(button?.disabled).toBe(true);
  });

  it('says plainly when the record resolves to nobody, and still shows the record', () => {
    render(null);
    expect(H.el('cs-hire-refusal').textContent).toContain(NO_PERSON_COPY);
    expect(NO_PERSON_COPY).toBe('No person is linked. This record cannot be listed on Hire.');
    expect(H.query('cs-hire-person-band')).toBeNull();
    expect(document.querySelector('article')).not.toBeNull();
  });

  it('tells the admin whether the person is listed, unlisted, or not yet published', () => {
    render(person({ listed: false, pageVisibility: 'unlisted' }));
    expect(H.el('cs-hire-person-band').textContent).toContain('Reachable by direct link only (unlisted)');
    H.unmount();
    render(person({ listed: false, pageStatus: 'draft', pageVisibility: 'private' }));
    expect(H.el('cs-hire-person-band').textContent).toContain('Not listed yet');
  });

  it('omits a proof tile it has no number for, rather than printing a zero it never measured', () => {
    render(person({ proof: { publishedCaseStudies: 1, verifiedCommits: 0, capabilitiesProven: 0, filesCommitted: null } }));
    expect(H.el('cs-hire-proof-ledger').textContent).not.toContain('files committed');
  });
});
