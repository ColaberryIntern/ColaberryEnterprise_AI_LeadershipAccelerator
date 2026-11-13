/**
 * C138 share switch: "Who can see it" says only what is true in all four combinations of shared x featured, each switch calls
 * only its own endpoint (sharing never features, featuring never shares), and a failed share is said plainly without changing
 * the state. The My work card marks a shared piece.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import * as H from '../../../../admin/__fixtures__/domHarness';

const mockFeature = jest.fn();
const mockShare = jest.fn();
jest.mock('../../../../../services/myWorkApi', () => ({
  setMyWorkFeatured: (...a: unknown[]) => mockFeature(...a),
  setMyWorkShared: (...a: unknown[]) => mockShare(...a),
  myWorkSource: { file: jest.fn(), preview: jest.fn(), xlsx: jest.fn() },
}));

/* eslint-disable import/first */
import FeatureCard from '../FeatureCard';
import { WorkCard } from '../MyWorkPage';

const ID = '11111111-2222-4333-8444-000000000001';
const text = () => H.text();
const shareBtn = () => document.querySelector('[data-testid="sw-share-toggle"]') as HTMLButtonElement;
const featureBtn = () => document.querySelector('[data-testid="mw-feature-toggle"]') as HTMLButtonElement;
const mount = (featured: boolean, onPublicPage: boolean, shared: boolean) =>
  H.mount(<FeatureCard id={ID} initial={{ featured, onPublicPage }} initialShare={{ shared }} />, '/portal/portfolio/work/x');

beforeEach(() => { mockFeature.mockReset(); mockShare.mockReset(); });
afterEach(() => H.unmount());

describe('the four combinations', () => {
  it('neither: only you, not in the Showcase, not on a public page', () => {
    mount(false, false, false);
    expect(text()).toContain('Only you.');
    expect(text()).toContain('Not in the Showcase: your cohort cannot see it.');
    expect(text()).toContain('Not on a public page.');
    expect(shareBtn().getAttribute('aria-pressed')).toBe('false');
  });

  it('shared only: your cohort can open it in the Showcase, never the public; not on a public page', () => {
    mount(false, false, true);
    expect(text()).not.toContain('Only you.');
    expect(text()).toContain('Shared. Your cohort can open it in the Showcase.');
    expect(text()).toContain('the Showcase is never public');
    expect(text()).toContain('Not on a public page.');
    expect(document.querySelector('a[href="/portal/showcase"]')).not.toBeNull();
    expect(shareBtn().getAttribute('aria-pressed')).toBe('true');
  });

  it('featured only (approved): strangers with the link can open it; not in the Showcase', () => {
    mount(true, true, false);
    expect(text()).not.toContain('Only you.');
    expect(text()).toContain("anyone with your page's link can open it");
    expect(text()).toContain('Not in the Showcase: your cohort cannot see it.');
  });

  it('both: each audience has its own sentence', () => {
    mount(true, false, true);
    expect(text()).toContain('Shared. Your cohort can open it in the Showcase.');
    expect(text()).toContain('on your public page after your next review');
    expect(text()).not.toContain('Only you.');
    expect(text()).not.toContain('Not on a public page.');
  });
});

describe('the switches are independent', () => {
  it('Share calls only the share endpoint, and the card then says it is shared', async () => {
    mockShare.mockResolvedValue({ shared: true, count: 1 });
    mount(false, false, false);
    act(() => { shareBtn().click(); });
    await H.settle();
    expect(mockShare).toHaveBeenCalledWith(ID, true);
    expect(mockFeature).not.toHaveBeenCalled();
    expect(text()).toContain('Shared. Your cohort can open it in the Showcase.');
    expect(text()).toContain('Not on a public page.');
  });

  it('Stop sharing calls false', async () => {
    mockShare.mockResolvedValue({ shared: false, count: 0 });
    mount(false, false, true);
    act(() => { shareBtn().click(); });
    await H.settle();
    expect(mockShare).toHaveBeenCalledWith(ID, false);
    expect(text()).toContain('Only you.');
  });

  it('Feature calls only the feature endpoint and leaves sharing as it was', async () => {
    mockFeature.mockResolvedValue({ featured: true, count: 1, onPublicPage: false });
    mount(false, false, false);
    act(() => { featureBtn().click(); });
    await H.settle();
    expect(mockFeature).toHaveBeenCalledWith(ID, true);
    expect(mockShare).not.toHaveBeenCalled();
    expect(text()).toContain('Not in the Showcase: your cohort cannot see it.');
  });

  it('a failed share is said plainly and the state does not change', async () => {
    mockShare.mockRejectedValue({ response: { status: 500 } });
    mount(false, false, false);
    act(() => { shareBtn().click(); });
    await H.settle();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not change who can see this piece');
    expect(text()).toContain('Not in the Showcase: your cohort cannot see it.');
    expect(shareBtn().getAttribute('aria-pressed')).toBe('false');
  });
});

describe('the My work card', () => {
  const item = { id: ID, kind: 'case_study', group: 'written' as const, title: 'Case study', from: 'Week 2', createdAt: '2026-08-25T15:00:00Z',
    week: 2, project: null, skills: [], state: 'Submitted, not reviewed yet' };
  it('marks a shared piece, and only a shared one', () => {
    H.mount(<ul><WorkCard it={{ ...item, shared: true }} /></ul>, '/portal/portfolio/work');
    expect(text()).toContain('Shared with cohort');
    H.unmount();
    H.mount(<ul><WorkCard it={{ ...item, featured: true }} /></ul>, '/portal/portfolio/work');
    expect(text()).not.toContain('Shared with cohort');
  });
});
