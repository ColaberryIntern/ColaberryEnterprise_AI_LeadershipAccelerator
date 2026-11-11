/**
 * C128: the My work page and the work page render the learner's real pieces, link each card to its own page, filter by kind,
 * pick the right viewer, and say "not found" (never someone else's piece) for a 404. Driven through the repo's domHarness
 * (no @testing-library in this app).
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { Route, Routes } from 'react-router-dom';
import * as H from '../../../../admin/__fixtures__/domHarness';

jest.mock('../../../today/PortalShell', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock('../../../../../components/paywall/PageGate', () => ({ PaywallScreen: () => <div>paywall</div> }));
const mockList = jest.fn();
const mockPiece = jest.fn();
jest.mock('../../../../../services/myWorkApi', () => ({
  fetchMyWork: () => mockList(),
  fetchMyWorkPiece: (id: string) => mockPiece(id),
  myWorkSource: { file: jest.fn(), preview: jest.fn(), xlsx: jest.fn() },
}));

/* eslint-disable import/first */
import MyWorkPage from '../MyWorkPage';
import WorkPiecePage from '../WorkPiecePage';

const A = '11111111-2222-4333-8444-000000000001';
const B = '11111111-2222-4333-8444-000000000002';
const ITEMS = [
  { id: A, kind: 'case_study', group: 'written', title: 'Capstone Evaluation Case Study', from: 'Case study', createdAt: '2026-08-25T15:00:00Z', week: 11, project: null, skills: ['architecture'], state: 'Written by the platform from your completed lesson' },
  { id: B, kind: 'build_artifact', group: 'sheet', title: 'hitl-escalation-path.csv', from: 'Implementation Task: Governance Engine', createdAt: '2026-08-21T15:00:00Z', week: 10, project: 'GoalKick', skills: ['governance'], state: 'Submitted, not reviewed yet' },
];
const BASE = { html: null, externalUrl: null, file: null, data: {}, written: null, link: null, recording: null };

const open = async (path: string) => {
  H.mount(
    <Routes>
      <Route path="/portal/portfolio/work" element={<MyWorkPage />} />
      <Route path="/portal/portfolio/work/:id" element={<WorkPiecePage />} />
    </Routes>, path,
  );
  await H.settle();
};
const links = (): HTMLAnchorElement[] => Array.from(document.querySelectorAll('a'));
const linkTo = (re: RegExp) => links().find((a) => re.test(a.textContent ?? ''));
const buttons = (): HTMLButtonElement[] => Array.from(document.querySelectorAll('button'));

beforeEach(() => { mockList.mockReset(); mockPiece.mockReset(); sessionStorage.clear(); });
afterEach(() => H.unmount());

it('My work: real count, a chip per kind present, each card links to its own page, a chip filters', async () => {
  mockList.mockResolvedValue(ITEMS);
  await open('/portal/portfolio/work');
  expect(H.text()).toContain('2 pieces of work from the program. Open any of them.');
  const chipText = buttons().map((b) => b.textContent);
  expect(chipText).toEqual(expect.arrayContaining(['All2', 'Written work1', 'Spreadsheets1']));
  expect(chipText.some((t) => /PDFs/.test(t ?? ''))).toBe(false);
  expect(linkTo(/Capstone Evaluation Case Study/)?.getAttribute('href')).toBe(`/portal/portfolio/work/${A}`);
  const sheets = buttons().find((b) => b.textContent === 'Spreadsheets1')!;
  act(() => { sheets.click(); });
  await H.settle();
  expect(linkTo(/Capstone Evaluation/)).toBeUndefined();
  expect(linkTo(/hitl-escalation-path\.csv/)).toBeDefined();
});

it('My work: none yet is an honest empty state', async () => {
  mockList.mockResolvedValue([]);
  await open('/portal/portfolio/work');
  expect(H.text()).toContain('Nothing here yet');
});

it('My work: a failed load offers a retry, not a blank page', async () => {
  mockList.mockRejectedValue({ response: { status: 500 } });
  await open('/portal/portfolio/work');
  expect(buttons().some((b) => b.textContent === 'Try again')).toBe(true);
});

it('work page: written work opens in the reader, with Next to the following piece', async () => {
  mockList.mockResolvedValue(ITEMS);
  mockPiece.mockResolvedValue({ ...ITEMS[0], ...BASE, written: { form: 'sections', sections: [{ heading: 'Evaluation Overview', body: 'First paragraph.\n\nSecond paragraph.' }] } });
  await open(`/portal/portfolio/work/${A}`);
  expect(mockPiece).toHaveBeenCalledWith(A);
  const h3 = Array.from(document.querySelectorAll('h3')).map((h) => h.textContent);
  expect(h3).toContain('Evaluation Overview');
  expect(Array.from(document.querySelectorAll('.mw-reader p')).map((p) => p.textContent)).toEqual(['First paragraph.', 'Second paragraph.']);
  expect(linkTo(/^Next/)?.getAttribute('href')).toBe(`/portal/portfolio/work/${B}`);
  expect(H.text()).toContain('Written by the platform from your completed lesson');
});

it('work page: a claude.ai piece is a link card that opens in a new tab, never an embed', async () => {
  mockList.mockResolvedValue([]);
  mockPiece.mockResolvedValue({ ...ITEMS[0], ...BASE, group: 'link', kind: 'claude_studio', externalUrl: 'https://claude.ai/artifact/U',
    link: { url: 'https://claude.ai/artifact/U', reflection: 'I built the pattern twice.', stages: ['explore'], aiDisclosure: null, projectProofUrl: null } });
  await open(`/portal/portfolio/work/${A}`);
  const a = linkTo(/Open on claude\.ai/)!;
  expect(a.getAttribute('target')).toBe('_blank');
  expect(a.getAttribute('rel')).toContain('noopener');
  expect(H.text()).toContain('I built the pattern twice.');
  expect(document.querySelector('iframe')).toBeNull();
});

it('work page: a field guide renders in a sandbox WITHOUT allow-same-origin', async () => {
  mockList.mockResolvedValue([]);
  mockPiece.mockResolvedValue({ ...ITEMS[0], ...BASE, group: 'guide', kind: 'field_guide', html: '<p>guide</p>' });
  await open(`/portal/portfolio/work/${A}`);
  const frame = document.querySelector('iframe');
  expect(frame).not.toBeNull();
  expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-popups');
});

it('work page: a 404 (not yours, or gone) says not found and links back', async () => {
  mockList.mockResolvedValue([]);
  mockPiece.mockRejectedValue({ response: { status: 404 } });
  await open(`/portal/portfolio/work/${A}`);
  expect(H.text()).toContain('We could not find this piece');
  expect(linkTo(/Back to My work/)?.getAttribute('href')).toBe('/portal/portfolio/work');
});
