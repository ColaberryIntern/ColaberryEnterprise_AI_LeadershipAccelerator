import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CareerPrepFloorPage from '../CareerPrepFloorPage';
import CareerPrepRoomPage from '../CareerPrepRoomPage';
import { useCareerPrepFlag } from '../../../../components/careerPrep/careerPrepFlag';
import { fetchPrepDashboard, fetchPrepSummary, fetchRemindersApi } from '../../../../components/careerPrep/careerPrepApi';
import { fetchHireInterviews } from '../../../../services/hireStudioApi';
import { resetCareerPrepSummaryCache } from '../../../../components/careerPrep/useCareerPrepSummary';

/**
 * Career Prep v27 (CP5.2): the deep links. /portal/career lands on the Career Prep floor (trail step 2),
 * /portal/career/room in the room, ?anchor=<id> preselects that interview, and closing the room (‹ Floor n or Esc)
 * lands back on the floor with focus on its door. Nobody Career Prep is not open for can reach either page.
 */
jest.mock('../../../../components/careerPrep/careerPrepFlag', () => ({ useCareerPrepFlag: jest.fn() }));
jest.mock('../../../../services/hireStudioApi', () => ({ fetchHireInterviews: jest.fn() }));
jest.mock('../../../../components/careerPrep/careerPrepApi', () => ({ fetchPrepSummary: jest.fn(), fetchPrepDashboard: jest.fn(), postInterview: jest.fn(), askCoraApi: jest.fn(), fetchRemindersApi: jest.fn(), fetchActivePlan: jest.fn() }));
const acme = { id: 'i1', source: 'real', company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: '2026-11-19T20:00:00Z', target: 75 };
beforeEach(() => {
  (useCareerPrepFlag as jest.Mock).mockReturnValue(true);
  (fetchPrepSummary as jest.Mock).mockResolvedValue({ stops: {}, interviews: [], interviewCount: 0, today: '2026-11-16' });
  (fetchPrepDashboard as jest.Mock).mockResolvedValue({ interviews: [acme], skills: [], sources: { video: 0, phone_mock: 0, real_interview: 0, training: 0, project: 0 }, weeklyMinutes: [], streak: 0, thisWeek: 0 });
  (fetchRemindersApi as jest.Mock).mockResolvedValue([]);
  (fetchHireInterviews as jest.Mock).mockResolvedValue([]);
  resetCareerPrepSummaryCache();
});

let host: HTMLDivElement;
let root: Root;
function Where(): React.ReactElement { const l = useLocation(); return <span data-testid="where" hidden>{l.pathname + l.search}</span>; }
async function mount(url: string): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[url]}><Routes>
      <Route path="/portal/career" element={<CareerPrepFloorPage />} />
      <Route path="/portal/career/room" element={<CareerPrepRoomPage />} />
      <Route path="/portal" element={<p data-testid="campus">campus</p>} />
    </Routes><Where /></MemoryRouter>);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
afterEach(() => { act(() => root.unmount()); host.remove(); });
const where = () => host.querySelector('[data-testid="where"]')?.textContent;

describe('Career Prep deep links (CP5.2)', () => {
  it('/portal/career lands on the Career Prep floor, at step 2 of the trail', async () => {
    await mount('/portal/career');
    expect(host.querySelector('[data-testid="cp-floor"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="cp-room"]')).toBeNull();
    expect(host.querySelector('[data-testid="cp-trail"]')?.getAttribute('data-step')).toBe('2');
    expect(host.querySelector('[data-testid="cp-door"]')?.getAttribute('href')).toBe('/portal/career/room');
  });

  it('/portal/career/room lands in the room, and ?anchor=<id> preselects that interview', async () => {
    await mount('/portal/career/room?anchor=i1');
    expect(host.querySelector('[data-testid="cp-room"]')).not.toBeNull();
    expect(fetchPrepDashboard).toHaveBeenLastCalledWith('i1');
    expect(host.querySelector('[data-testid="cp-trail"]')?.getAttribute('data-step')).toBe('3');
  });

  it.each([
    ['‹ Floor n', async () => { await act(async () => { (host.querySelector('[data-testid="cp-back"]') as HTMLButtonElement).click(); }); }],
    ['Esc', async () => { await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); }],
  ])('closing the room with %s lands on the Career Prep floor with focus on its door', async (_how, close) => {
    await mount('/portal/career/room');
    await close();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(where()).toBe('/portal/career');
    expect(host.querySelector('[data-testid="cp-room"]')).toBeNull();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('cp-door');
  });

  it("the floor's Elevator and Lobby buttons go back to the campus", async () => {
    await mount('/portal/career');
    await act(async () => { (host.querySelector('[data-testid="cm-hq-to-cab"]') as HTMLButtonElement).click(); });
    expect(where()).toBe('/portal');
  });

  it('neither page exists for a student Career Prep is not open for', async () => {
    (useCareerPrepFlag as jest.Mock).mockReturnValue(false);
    await mount('/portal/career');
    expect(host.querySelector('[data-testid="cp-not-found"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="cp-floor"]')).toBeNull();
  });
});
