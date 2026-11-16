import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CareerPrepRoomPage from '../CareerPrepRoomPage';
import { useCareerPrepFlag } from '../../../../components/careerPrep/careerPrepFlag';
import { fetchPrepDashboard, fetchPrepSummary, fetchRemindersApi } from '../../../../components/careerPrep/careerPrepApi';
import { resetCareerPrepSummaryCache } from '../../../../components/careerPrep/useCareerPrepSummary';

jest.mock('../../../../components/careerPrep/careerPrepFlag', () => ({ useCareerPrepFlag: jest.fn() }));
jest.mock('../../../../components/careerPrep/careerPrepApi', () => ({ fetchPrepSummary: jest.fn(), fetchPrepDashboard: jest.fn(), postInterview: jest.fn(), askCoraApi: jest.fn(), fetchRemindersApi: jest.fn() }));
const flag = useCareerPrepFlag as jest.Mock;
beforeEach(() => {
  (fetchPrepSummary as jest.Mock).mockResolvedValue({ stops: {}, interviews: [], today: '2026-11-16' });
  (fetchPrepDashboard as jest.Mock).mockResolvedValue({ interviews: [], skills: [], sources: { video: 0, phone_mock: 0, real_interview: 0, training: 0, project: 0 }, weeklyMinutes: [], streak: 0, thisWeek: 0 });
  (fetchRemindersApi as jest.Mock).mockResolvedValue([]);
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

  it('a reminder sent in the last 12 hours is Cora\'s line in the room (the in-app half of a reminder, CP4.5)', async () => {
    (fetchRemindersApi as jest.Mock).mockResolvedValue([{ id: 'r1', kind: 'tonight', sendAt: '2026-11-17T00:00:00.000Z', status: 'sent' }]);
    flag.mockReturnValue(true);
    await mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(host.textContent).toContain('Here is the reminder you asked for');
  });

  it('a pending reminder (not sent yet) says nothing, and a failed reminder read never breaks the room', async () => {
    (fetchRemindersApi as jest.Mock).mockResolvedValue([{ id: 'r1', kind: 'tomorrow', sendAt: '2026-11-17T18:00:00.000Z', status: 'pending' }]);
    flag.mockReturnValue(true);
    await mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(host.textContent).not.toContain('Here is the reminder');
    act(() => root.unmount()); host.remove();
    (fetchRemindersApi as jest.Mock).mockRejectedValue(new Error('offline'));
    await mount();
    expect(host.querySelector('[data-testid="cp-room"]')).not.toBeNull();
  });
});
