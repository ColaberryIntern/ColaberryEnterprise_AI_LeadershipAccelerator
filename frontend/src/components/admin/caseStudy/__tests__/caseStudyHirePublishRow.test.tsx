import React from 'react';
import { CaseStudySurfacePublishRows } from '../CaseStudySurfacePublishRows';
import * as H from '../../../../pages/admin/__fixtures__/domHarness';
import type { CaseStudyHirePerson } from '../../../../services/caseStudyAdminTypes';

/**
 * The HIRE publish row names WHO goes live. Hire lists people, so the operator sees the
 * person (and where their portfolio lives) before clicking Publish, or the gate's remedy
 * when the record resolves to nobody.
 */

const noop = (): void => undefined;
function render(hirePerson?: CaseStudyHirePerson | null): void {
  H.mount(
    <CaseStudySurfacePublishRows publications={[]} hirePerson={hirePerson} busy={false} onPublish={noop} onUnpublish={noop} />,
    '/',
  );
}

afterEach(() => H.unmount());

describe('the HIRE publish row', () => {
  it('offers Hire as a site, with its live address', () => {
    render(undefined);
    expect(H.query('cs-surface-row-hire')).not.toBeNull();
    expect(H.el('cs-surface-row-hire').textContent).toContain('hire.refactored.ai');
  });

  it('names the person and links their hire portfolio', () => {
    render({ name: 'Ann Lee', portfolioSlug: 'ann-lee', listed: true });
    const line = H.el('cs-surface-hire-person');
    expect(line.textContent).toContain('Lists Ann Lee');
    expect(line.textContent).toContain('appears in the directory once published');
    expect(line.querySelector('a')?.getAttribute('href')).toBe('https://hire.refactored.ai/talent/ann-lee/');
  });

  it('warns when the person exists but will not appear in the directory yet', () => {
    render({ name: 'Ann Lee', portfolioSlug: 'ann-lee', listed: false });
    expect(H.el('cs-surface-hire-person').textContent).toContain('will not appear in the directory yet');
  });

  it('gives the gate\'s remedy, before the click, when the record resolves to nobody', () => {
    render(null);
    const line = H.el('cs-surface-hire-person');
    expect(line.textContent).toContain('No person is linked');
    expect(line.textContent).toContain('github_connections');
  });

  it('says nothing about a person on any other row, and nothing when the payload did not report one', () => {
    render(undefined);
    expect(H.query('cs-surface-hire-person')).toBeNull();
    render({ name: 'Ann Lee', portfolioSlug: 'ann-lee', listed: true });
    expect(H.el('cs-surface-row-enterprise').textContent).not.toContain('Ann Lee');
  });
});
