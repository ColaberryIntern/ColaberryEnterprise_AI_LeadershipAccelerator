import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CareerPrepRoomPage from '../CareerPrepRoomPage';
import { useCareerPrepFlag } from '../../../../components/careerPrep/careerPrepFlag';
import { fetchPrepDashboard, fetchPrepSummary } from '../../../../components/careerPrep/careerPrepApi';
import { resetCareerPrepSummaryCache } from '../../../../components/careerPrep/useCareerPrepSummary';

jest.mock('../../../../components/careerPrep/careerPrepFlag', () => ({ useCareerPrepFlag: jest.fn() }));
jest.mock('../../../../components/careerPrep/careerPrepApi', () => ({ fetchPrepSummary: jest.fn(), fetchPrepDashboard: jest.fn(), postInterview: jest.fn(), askCoraApi: jest.fn() }));
const flag = useCareerPrepFlag as jest.Mock;
beforeEach(() => {
  (fetchPrepSummary as jest.Mock).mockResolvedValue({ stops: {}, interviews: [], today: '2026-11-16' });
  (fetchPrepDashboard as jest.Mock).mockResolvedValue({ interviews: [], skills: [], sources: { video: 0, phone_mock: 0, real_interview: 0, training: 0, project: 0 }, weeklyMinutes: [], streak: 0, thisWeek: 0 });
  resetCareerPrepSummaryCache();
});

let host: HTMLDivElement;
let root: Root;
async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter><CareerPrepRoomPage /></MemoryRouter>); });
}
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('/portal/career/room', () => {
  it('does not exist for a student Career Prep is not open for', async () => {
    flag.mockReturnValue(false);
    await mount();
    expect(host.querySelector('[data-testid="cp-not-found"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="cp-room"]')).toBeNull();
  });

  it('shows nothing of the room while the flag is loading', async () => {
    flag.mockReturnValue(null);
    await mount();
    expect(host.querySelector('[data-testid="cp-room"]')).toBeNull();
  });

  it('opens the room over the Career Prep floor when it is on', async () => {
    flag.mockReturnValue(true);
    await mount();
    expect(host.querySelector('[data-testid="cp-room"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="cp-floor"]')).not.toBeNull();
  });
});
