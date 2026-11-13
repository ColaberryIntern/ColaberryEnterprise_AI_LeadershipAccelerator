/**
 * C138 Showcase room. The page renders what the SERVER decided (own cohort only); it narrows only by kind, skill and search.
 * Four states for shared work, a New this week card only when the server names one, the presentation demos kept with their
 * WIP / external labels, and a read-only piece page that says the same neutral thing for every 404.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { Route, Routes } from 'react-router-dom';
import * as H from '../../../admin/__fixtures__/domHarness';

const mockGet = jest.fn();
jest.mock('../../../../utils/portalApi', () => ({ __esModule: true, default: { get: (...a: unknown[]) => mockGet(...a) } }));
jest.mock('../../today/PortalShell', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

/* eslint-disable import/first */
import ShowcaseGalleryPage from '../ShowcaseGalleryPage';
import ShowcasePiecePage from '../ShowcasePiecePage';

const A = '11111111-2222-4333-8444-000000000001';
const B = '11111111-2222-4333-8444-000000000002';
const card = (over: Record<string, unknown> = {}) => ({ id: A, group: 'written', title: 'Evaluation case study', from: 'Week 2', createdAt: '2026-08-25T15:00:00Z',
  week: 2, project: null, skills: ['critical_thinking'], author: 'Dana Learner', sharedAt: '2026-11-10T15:00:00Z', mine: false, ...over });
const demo = (over: Record<string, unknown> = {}) => ({ id: 'd1', title: 'Courier routing', summary: 'Routes couriers.', authorName: 'Sam', audience: 'cohort', ...over });

type Reply = { data?: unknown; status?: number };
function routes(map: Record<string, Reply>) {
  mockGet.mockImplementation((url: string) => {
    const r = map[url];
    if (!r) return Promise.reject({ response: { status: 404 } });
    return r.status ? Promise.reject({ response: { status: r.status } }) : Promise.resolve({ data: r.data });
  });
}
const SC = '/api/portal/career/showcase';
const DEMOS = '/api/portal/showcases';
const text = () => H.text();
const open = async (path = '/portal/showcase') => {
  H.mount(<Routes><Route path="/portal/showcase" element={<ShowcaseGalleryPage />} /><Route path="/portal/showcase/work/:id" element={<ShowcasePiecePage />} /></Routes>, path);
  await H.settle();
};

beforeEach(() => mockGet.mockReset());
afterEach(() => H.unmount());

describe('shared work: what the server returned, in work cards', () => {
  it('lists the cohort\'s shared pieces with who shared them, each linking to the read-only page', async () => {
    routes({ [SC]: { data: { items: [card(), card({ id: B, title: 'My guide', group: 'guide', mine: true })], newThisWeek: null } }, [DEMOS]: { data: { items: [] } } });
    await open();
    expect(mockGet).toHaveBeenCalledWith(SC);
    expect(text()).toContain('Work your classmates chose to share with your cohort.');
    expect(document.querySelectorAll('[data-testid="sc-grid"] li')).toHaveLength(2);
    expect(text()).toContain('Shared by Dana Learner');
    expect(text()).toContain('Shared by You');
    expect(document.querySelector(`a[href="/portal/showcase/work/${A}"]`)).not.toBeNull();
    expect(document.querySelector('a[href^="/portal/portfolio/work/"]')).toBeNull();
    expect(document.querySelector('[data-testid="sc-new-week"]')).toBeNull();
    expect(document.querySelector('[data-testid="sc-demos"]')).toBeNull();
  });

  it('shows New this week only when the server names one', async () => {
    routes({ [SC]: { data: { items: [card()], newThisWeek: card() } }, [DEMOS]: { data: { items: [] } } });
    await open();
    const hero = document.querySelector('[data-testid="sc-new-week"]');
    expect(hero?.textContent).toContain('New this week');
    expect(hero?.getAttribute('href')).toBe(`/portal/showcase/work/${A}`);
  });

  it('narrows by kind chip, by skill and by search, and says when nothing matches', async () => {
    routes({ [SC]: { data: { items: [card(), card({ id: B, title: 'Pipeline sheet', group: 'sheet', skills: ['data_analysis'], author: 'Lee' })], newThisWeek: null } }, [DEMOS]: { data: { items: [] } } });
    await open();
    const chips = Array.from(document.querySelectorAll('.mw-chips button')).map((b) => b.textContent);
    expect(chips).toEqual(['All2', 'Written work1', 'Spreadsheets1']);
    act(() => { (Array.from(document.querySelectorAll('.mw-chips button')).find((b) => b.textContent?.startsWith('Spreadsheets')) as HTMLButtonElement).click(); });
    await H.settle();
    expect(document.querySelectorAll('[data-testid="sc-grid"] li')).toHaveLength(1);
    expect(text()).toContain('Pipeline sheet');
    act(() => { (Array.from(document.querySelectorAll('.mw-chips button'))[0] as HTMLButtonElement).click(); });
    await H.settle();
    const sel = document.querySelector('[data-testid="sc-skill"]') as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(['Every skill', 'Critical thinking', 'Data analysis']);
    H.setValue('sc-skill', 'critical thinking');
    await H.settle();
    expect(document.querySelectorAll('[data-testid="sc-grid"] li')).toHaveLength(1);
    expect(text()).toContain('Evaluation case study');
    H.setValue('sc-search', 'zzz');
    await H.settle();
    expect(text()).toContain('No shared pieces match.');
  });

  it('empty: says how to share, and links to My work', async () => {
    routes({ [SC]: { data: { items: [], newThisWeek: null } }, [DEMOS]: { data: { items: [] } } });
    await open();
    expect(document.querySelector('[data-testid="sc-empty"]')?.textContent).toContain('Share with my cohort');
    expect(document.querySelector('a[href="/portal/portfolio/work"]')).not.toBeNull();
  });

  it('error: never shown as empty, with Try again that reads again', async () => {
    routes({ [SC]: { status: 500 }, [DEMOS]: { data: { items: [] } } });
    await open();
    expect(document.querySelector('[data-testid="sc-error"]')?.textContent).toContain('does not mean it is empty');
    expect(document.querySelector('[data-testid="sc-empty"]')).toBeNull();
    routes({ [SC]: { data: { items: [card()], newThisWeek: null } }, [DEMOS]: { data: { items: [] } } });
    act(() => { (document.querySelector('[data-testid="sc-error"] button') as HTMLButtonElement).click(); });
    await H.settle();
    expect(document.querySelectorAll('[data-testid="sc-grid"] li')).toHaveLength(1);
  });

  it('loading: says so before the answer arrives', async () => {
    mockGet.mockImplementation(() => new Promise(() => undefined));
    H.mount(<ShowcaseGalleryPage />, '/portal/showcase');
    expect(document.querySelector('[data-testid="sc-loading"]')).not.toBeNull();
  });

  it('a learner without the portfolio entitlement gets the paywall, and the demos still load', async () => {
    routes({ [SC]: { status: 402 }, [DEMOS]: { data: { items: [demo()] } } });
    await open();
    expect(document.querySelector('[data-testid="sc-grid"]')).toBeNull();
    expect(document.querySelector('[data-testid="sc-demos"]')).not.toBeNull();
  });
});

describe('presentation demos, kept', () => {
  it('render what the server returned, with work in progress and external work labeled on the card', async () => {
    routes({ [SC]: { data: { items: [], newThisWeek: null } }, [DEMOS]: { data: { items: [demo({ workInProgress: true }), demo({ id: 'd2', external: { url: 'https://x', badge: 'Built elsewhere', note: 'not built here' } })] } } });
    await open();
    expect(mockGet).toHaveBeenCalledWith(DEMOS);
    expect(document.querySelectorAll('[data-testid^="sc-card-"]')).toHaveLength(2);
    expect(document.querySelector('[data-testid="sc-wip-d1"]')?.textContent).toBe('Work in progress');
    expect(document.querySelector('[data-testid="sc-external-d2"]')?.textContent).toContain('Built elsewhere');
  });

  it('a failed read says so, never that there are none', async () => {
    routes({ [SC]: { data: { items: [], newThisWeek: null } }, [DEMOS]: { status: 500 } });
    await open();
    expect(document.querySelector('[data-testid="sc-demos-error"]')?.textContent).toContain('This does not mean there are none.');
  });
});

describe('the read-only piece page', () => {
  const piece = (over: Record<string, unknown> = {}) => ({ ...card(), html: null, externalUrl: 'https://claude.ai/a', file: null, written: null, recording: null,
    link: { url: 'https://claude.ai/a', reflection: 'Built it twice.', stages: [], aiDisclosure: null, projectProofUrl: null }, group: 'link', ...over });

  it('shows who shared it and words the piece about them, with no link into their My work', async () => {
    routes({ [`${SC}/${A}`]: { data: { piece: piece() } } });
    await open(`/portal/showcase/work/${A}`);
    expect(mockGet).toHaveBeenCalledWith(`${SC}/${A}`);
    expect(document.querySelector('[data-testid="sc-piece-author"]')?.textContent).toBe('Dana Learner');
    expect(text()).toContain('What they said about it');
    expect(text()).not.toContain('What you said');
    expect(document.querySelector('a[href^="/portal/portfolio/work/"]')).toBeNull();
    expect(text()).toContain('Only your cohort can see it.');
  });

  it('the owner gets a way back to their own copy', async () => {
    routes({ [`${SC}/${A}`]: { data: { piece: piece({ mine: true }) } } });
    await open(`/portal/showcase/work/${A}`);
    expect(document.querySelector('[data-testid="sc-piece-author"]')?.textContent).toBe('You');
    expect(document.querySelector(`a[href="/portal/portfolio/work/${A}"]`)).not.toBeNull();
  });

  it('every 404 says the same neutral thing', async () => {
    routes({});
    await open(`/portal/showcase/work/${A}`);
    expect(document.querySelector('[data-testid="sc-piece-missing"]')?.textContent).toContain('This piece is not shared with you');
  });
});
