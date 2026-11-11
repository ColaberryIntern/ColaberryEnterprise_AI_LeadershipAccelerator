/**
 * C130 featured work, frontend: the Feature card says only what is true in each of its three states and flips the switch; the
 * public work page renders a piece worded about its owner with no portal links, and says the same neutral thing for every 404;
 * the Featured work section links where it is told to; a one-day range reads "on Oct 29".
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { Route, Routes } from 'react-router-dom';
import * as H from '../../../../admin/__fixtures__/domHarness';

const mockSet = jest.fn();
jest.mock('../../../../../services/myWorkApi', () => ({
  setMyWorkFeatured: (...a: unknown[]) => mockSet(...a),
  myWorkSource: { file: jest.fn(), preview: jest.fn(), xlsx: jest.fn() },
}));
const mockGet = jest.fn();
jest.mock('../../../../../utils/portalApi', () => ({ __esModule: true, default: { get: (...a: unknown[]) => mockGet(...a) } }));

/* eslint-disable import/first */
import FeatureCard from '../FeatureCard';
import PublicWorkPage from '../../../../PublicWorkPage';
import FeaturedWorkSection from '../../../../../components/portfolio/FeaturedWorkSection';
import { rangePhrase } from '../workSummary';

const ID = '11111111-2222-4333-8444-000000000001';
const text = () => H.text();
beforeEach(() => { mockSet.mockReset(); mockGet.mockReset(); });
afterEach(() => H.unmount());

describe('FeatureCard', () => {
  it('not featured: only you; Feature flips it and the card says Preview now, public after review', async () => {
    mockSet.mockResolvedValue({ featured: true, count: 1, onPublicPage: false });
    H.mount(<FeatureCard id={ID} initial={{ featured: false, onPublicPage: false }} />, '/portal/portfolio/work/x');
    expect(text()).toContain('Only you.');
    const btn = document.querySelector('[data-testid="mw-feature"] button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    act(() => { btn.click(); });
    await H.settle();
    expect(mockSet).toHaveBeenCalledWith(ID, true);
    expect(text()).toContain('on your public page after your next review');
    expect(text()).not.toContain('anyone with your page');
  });

  it('featured and approved: says strangers with the link can open it; unfeaturing calls false', async () => {
    mockSet.mockResolvedValue({ featured: false, count: 0, onPublicPage: false });
    H.mount(<FeatureCard id={ID} initial={{ featured: true, onPublicPage: true }} />, '/portal/portfolio/work/x');
    expect(text()).toContain("anyone with your page's link can open it");
    act(() => { (document.querySelector('[data-testid="mw-feature"] button') as HTMLButtonElement).click(); });
    await H.settle();
    expect(mockSet).toHaveBeenCalledWith(ID, false);
    expect(text()).toContain('Only you.');
  });

  it('the cap and a failure are said plainly, and the state does not change', async () => {
    mockSet.mockRejectedValue({ response: { status: 409, data: { error: 'You can feature up to 12 pieces. Unfeature one first.' } } });
    H.mount(<FeatureCard id={ID} initial={{ featured: false, onPublicPage: false }} />, '/portal/portfolio/work/x');
    act(() => { (document.querySelector('[data-testid="mw-feature"] button') as HTMLButtonElement).click(); });
    await H.settle();
    expect(text()).toContain('You can feature up to 12 pieces');
    expect(text()).toContain('Only you.');
  });
});

describe('PublicWorkPage', () => {
  const open = async () => {
    H.mount(<Routes><Route path="/portfolio/:slug/work/:id" element={<PublicWorkPage />} /></Routes>, `/portfolio/ali-m/work/${ID}`);
    await H.settle();
  };

  it('renders a featured piece worded about its owner, with no portal links', async () => {
    mockGet.mockResolvedValue({ data: { piece: { id: ID, group: 'link', title: 'Capstone Studio', from: 'Claude Studio', createdAt: '2026-09-18T15:00:00Z',
      week: 12, project: null, skills: [], html: null, externalUrl: 'https://claude.ai/a', file: null, written: null, recording: null,
      link: { url: 'https://claude.ai/a', reflection: 'Built it twice.', stages: [], aiDisclosure: null, projectProofUrl: null } } } });
    await open();
    expect(mockGet).toHaveBeenCalledWith(`/api/public/portfolios/ali-m/work/${ID}`);
    expect(text()).toContain('What they said about it');
    expect(text()).not.toContain('What you said');
    const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.startsWith('/portal'))).toBe(false);
    expect(hrefs).toContain('/portfolio/ali-m');
  });

  it('a 404 says the same neutral thing, never private or not featured', async () => {
    mockGet.mockRejectedValue({ response: { status: 404 } });
    await open();
    expect(text()).toContain('This address does not lead to a piece of work.');
    expect(text()).not.toMatch(/private|featured|review/i);
  });
});

describe('FeaturedWorkSection', () => {
  const items = [{ id: ID, group: 'written' as const, title: 'Case study', from: 'Case study', created_at: '2026-08-25T15:00:00Z' }];
  it('links each card where it is told to; no items, no section', () => {
    H.mount(<FeaturedWorkSection items={items} hrefFor={(id) => `/portfolio/ali-m/work/${id}`} />, '/');
    expect(document.querySelector('a.pf-fw-card')?.getAttribute('href')).toBe(`/portfolio/ali-m/work/${ID}`);
    expect(text()).toContain('Featured work');
    H.unmount();
    H.mount(<FeaturedWorkSection items={[]} hrefFor={(id) => id} />, '/');
    expect(document.querySelector('#featured-work')).toBeNull();
  });
});

it('a one-day range reads "on Oct 29"; a span reads from and to (Central time)', () => {
  expect(rangePhrase('2026-10-29T15:00:00Z', '2026-10-29T20:00:00Z')).toBe('on Oct 29');
  expect(rangePhrase('2026-08-25T15:00:00Z', '2026-09-18T15:00:00Z')).toBe('from Aug 25 to Sep 18');
});
