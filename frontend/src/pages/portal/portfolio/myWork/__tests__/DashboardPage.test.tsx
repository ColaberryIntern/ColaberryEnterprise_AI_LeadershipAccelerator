/**
 * C129: the Dashboard shows the learner's real counts, every bar opens My work filtered, the newest pieces open their own pages;
 * nothing yet is an honest empty state. And the Gallery board: total, range, a bar per kind, the two doors.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import * as H from '../../../../admin/__fixtures__/domHarness';

jest.mock('../../../today/PortalShell', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock('../../../../../components/paywall/PageGate', () => ({ PaywallScreen: () => <div>paywall</div> }));
const mockList = jest.fn();
jest.mock('../../../../../services/myWorkApi', () => ({ fetchMyWork: () => mockList() }));

/* eslint-disable import/first */
import DashboardPage from '../DashboardPage';
import WorkGlanceBoard from '../../../../../components/campus/gallery/WorkGlanceBoard';

const ITEMS = [
  { id: 'a1', kind: 'claude_studio', group: 'link', title: 'Capstone Defense and Launch Studio', from: 'Claude Studio', createdAt: '2026-09-18T15:00:00Z', week: 12, project: null, skills: ['communication'], state: 's' },
  { id: 'b2', kind: 'build_artifact', group: 'sheet', title: 'inventory.csv', from: 'Expo', createdAt: '2026-08-27T15:00:00Z', week: 11, project: 'GoalKick', skills: ['architecture'], state: 's' },
  { id: 'c3', kind: 'case_study', group: 'written', title: 'Capstone Case Study', from: 'Case study', createdAt: '2026-08-25T15:00:00Z', week: 11, project: null, skills: ['architecture'], state: 's' },
];
const hrefs = () => Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));

beforeEach(() => mockList.mockReset());
afterEach(() => H.unmount());

it('real counts and range, bars open My work filtered, newest open their own pages', async () => {
  mockList.mockResolvedValue(ITEMS);
  H.mount(<DashboardPage />, '/portal/portfolio/dashboard');
  await H.settle();
  expect(H.text()).toContain('3 pieces of work from Aug 25 to Sep 18.');
  expect(H.text()).toContain('1project in your work');
  expect(hrefs()).toEqual(expect.arrayContaining([
    '/portal/portfolio/work?kind=link', '/portal/portfolio/work?kind=sheet', '/portal/portfolio/work?kind=written',
    '/portal/portfolio/work?by=skill&q=Architecture', '/portal/portfolio/work/a1', '/portal/portfolio/preview',
  ]));
  const bar = Array.from(document.querySelectorAll('a')).find((a) => a.getAttribute('href') === '/portal/portfolio/work?by=skill&q=Architecture');
  expect(bar?.getAttribute('aria-label')).toBe('Architecture: 2');
});

it('nothing yet: an honest empty state, no invented numbers', async () => {
  mockList.mockResolvedValue([]);
  H.mount(<DashboardPage />, '/portal/portfolio/dashboard');
  await H.settle();
  expect(H.text()).toContain('Nothing here yet');
  expect(document.querySelectorAll('.db-kpis').length).toBe(0);
});

it('a failed read offers a retry', async () => {
  mockList.mockRejectedValue({ response: { status: 500 } });
  H.mount(<DashboardPage />, '/portal/portfolio/dashboard');
  await H.settle();
  expect(Array.from(document.querySelectorAll('button')).some((b) => b.textContent === 'Try again')).toBe(true);
});

describe('Gallery board: Your work at a glance', () => {
  it('total, range, one bar per kind, and the two doors', () => {
    const onOpen = jest.fn();
    H.mount(<div className="cm-r3-screen"><WorkGlanceBoard items={ITEMS as never} onOpen={onOpen} /></div>, '/portal/campus');
    expect(H.text()).toContain('Your work at a glance');
    expect(document.querySelector('[data-testid="cm-wg-total"]')?.textContent).toBe('3pieces of work · from Aug 25 to Sep 18');
    expect(document.querySelectorAll('.cm-wg-row').length).toBe(3);
    act(() => { (document.querySelector('[data-testid="cm-board-primary"]') as HTMLElement).click(); });
    act(() => { (document.querySelector('[data-testid="cm-board-section"]') as HTMLElement).click(); });
    expect(onOpen.mock.calls).toEqual([['/portal/portfolio/dashboard'], ['/portal/portfolio/work']]);
  });

  it('no pieces, and a failed read: the empty line and the same doors, never a number', () => {
    H.mount(<WorkGlanceBoard items={[]} onOpen={jest.fn()} />, '/portal/campus');
    expect(document.querySelector('[data-testid="cm-wg-empty"]')?.textContent).toMatch(/No work yet/);
    expect(document.querySelector('[data-testid="cm-wg-total"]')).toBeNull();
    H.unmount();
    H.mount(<WorkGlanceBoard items={null} onOpen={jest.fn()} />, '/portal/campus');
    expect(document.querySelector('[data-testid="cm-wg-empty"]')?.textContent).toBe('Your work shows here.');
    expect(document.querySelector('[data-testid="cm-board-primary"]')).not.toBeNull();
  });
});
