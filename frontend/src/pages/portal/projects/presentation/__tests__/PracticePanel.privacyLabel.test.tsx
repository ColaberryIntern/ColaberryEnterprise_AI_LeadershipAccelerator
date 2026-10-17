import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PracticePanel from '../PracticePanel';
import portalApi from '../../../../../utils/portalApi';

/**
 * THE ONE LABEL ON THIS PAGE THAT CAN DO HARM BY BEING WRONG.
 *
 * "Private — only you can see this" is not a status line, it is an assurance. A
 * student reads it while looking at a recording of their own face and decides what
 * they are comfortable having recorded. If it stays on screen after they publish the
 * take in Step 5, the page is actively telling them their cohort cannot watch
 * something their cohort is watching.
 *
 * The first version of this panel hardcoded the private label on every take, which
 * was true for exactly as long as the publish flow did not exist. These tests are
 * about the label FOLLOWING the fact rather than describing the common case.
 */

jest.mock('../../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
const api = portalApi as unknown as { get: jest.Mock; post: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

const TAKE = {
  id: 'r1',
  partNo: 1,
  playbackUrl: '/api/portal/projects/p1/tasks/PREP-4/recordings/r1/file?t=tkt',
  published: false,
};

const SESSION = (over: Record<string, unknown> = {}) => ({
  data: {
    session: {
      attemptId: 'a1',
      attemptNo: 1,
      mode: 'practice_solo',
      attemptState: 'draft',
      recordingState: 'available',
      bookingId: 'b1',
      roomId: 'room1',
      title: 'Rehearsal',
      startAt: '2026-10-16T15:00:00Z',
      endAt: '2026-10-16T15:30:00Z',
      timezone: 'America/Chicago',
      bookingState: 'booked',
      meetingReady: false,
      recordingPolicy: 'cloud',
      recordings: [TAKE],
      ...over,
    },
  },
});

async function mount() {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(<PracticePanel projectId="p1" storyId="PREP-4" />);
  });
}

const text = () => container.textContent || '';
const q = (sel: string) => container.querySelector(sel);

describe('an unpublished take', () => {
  it('is called private', async () => {
    api.get.mockResolvedValue(SESSION());
    await mount();
    expect(q('[data-testid="ps-practice-private"]')).not.toBeNull();
    expect(text()).toContain('only you can see this');
  });

  it('is treated as private when the server says nothing about it', async () => {
    // An older payload, or one built by a caller that did not look the showcase up.
    // Defaulting to "private" understates reach; defaulting the other way would make
    // the page claim an audience that does not exist. Only one of those is safe.
    api.get.mockResolvedValue(SESSION({ recordings: [{ id: 'r1', partNo: 1, playbackUrl: TAKE.playbackUrl }] }));
    await mount();
    expect(q('[data-testid="ps-practice-private"]')).not.toBeNull();
  });
});

describe('a PUBLISHED take', () => {
  it('is NOT called private', async () => {
    // The whole point of the file. A lock icon here is a false assurance, not a
    // stale label.
    api.get.mockResolvedValue(SESSION({ recordings: [{ ...TAKE, published: true }] }));
    await mount();
    expect(q('[data-testid="ps-practice-private"]')).toBeNull();
    expect(text()).not.toContain('only you can see this');
  });

  it('says the cohort can watch it', async () => {
    api.get.mockResolvedValue(SESSION({ recordings: [{ ...TAKE, published: true }] }));
    await mount();
    expect(q('[data-testid="ps-practice-published"]')!.textContent)
      .toContain('your cohort can watch this');
  });

  it('points at where to take it down, rather than leaving them stuck', async () => {
    // Telling someone their video is public without saying how to stop that is worse
    // than not telling them.
    api.get.mockResolvedValue(SESSION({ recordings: [{ ...TAKE, published: true }] }));
    await mount();
    expect(text()).toContain('Take it down in Present');
  });

  it('still plays — the label changed, nothing else did', async () => {
    api.get.mockResolvedValue(SESSION({ recordings: [{ ...TAKE, published: true }] }));
    await mount();
    expect(container.querySelector('video')!.getAttribute('src')).toBe(TAKE.playbackUrl);
  });
});

describe('a mix of takes', () => {
  it('labels each take by its own state, not the first one it saw', async () => {
    api.get.mockResolvedValue(SESSION({
      recordings: [
        { ...TAKE, id: 'r1', published: true },
        { ...TAKE, id: 'r2', partNo: 2, published: false },
      ],
    }));
    await mount();
    expect(q('[data-testid="ps-practice-published"]')).not.toBeNull();
    expect(q('[data-testid="ps-practice-private"]')).not.toBeNull();
  });
});
