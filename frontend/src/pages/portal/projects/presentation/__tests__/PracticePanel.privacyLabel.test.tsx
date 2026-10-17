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
  shareState: 'private' as const,
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

  it('offers the share control, because a private take is the only shareable one', async () => {
    api.get.mockResolvedValue(SESSION());
    await mount();
    expect(q('[data-testid="ps-share-open"]')).not.toBeNull();
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
    api.get.mockResolvedValue(SESSION({ recordings: [{ ...TAKE, shareState: 'published' }] }));
    await mount();
    expect(q('[data-testid="ps-practice-private"]')).toBeNull();
    expect(text()).not.toContain('only you can see this');
  });

  it('says the cohort can watch it', async () => {
    api.get.mockResolvedValue(SESSION({ recordings: [{ ...TAKE, shareState: 'published' }] }));
    await mount();
    expect(q('[data-testid="ps-practice-published"]')!.textContent)
      .toContain('your cohort can watch this');
  });

  it('points at where to take it down, rather than leaving them stuck', async () => {
    // Telling someone their video is public without saying how to stop that is worse
    // than not telling them.
    api.get.mockResolvedValue(SESSION({ recordings: [{ ...TAKE, shareState: 'published' }] }));
    await mount();
    expect(text()).toContain('Take it down in Present');
  });

  it('still plays — the label changed, nothing else did', async () => {
    api.get.mockResolvedValue(SESSION({ recordings: [{ ...TAKE, shareState: 'published' }] }));
    await mount();
    expect(container.querySelector('video')!.getAttribute('src')).toBe(TAKE.playbackUrl);
  });
});

describe('a mix of takes', () => {
  it('labels each take by its own state, not the first one it saw', async () => {
    api.get.mockResolvedValue(SESSION({
      recordings: [
        { ...TAKE, id: 'r1', shareState: 'published' },
        { ...TAKE, id: 'r2', partNo: 2, shareState: 'private' },
      ],
    }));
    await mount();
    expect(q('[data-testid="ps-practice-published"]')).not.toBeNull();
    expect(q('[data-testid="ps-practice-private"]')).not.toBeNull();
  });
});

describe('a take WAITING for approval', () => {
  const pending = () => SESSION({ recordings: [{ ...TAKE, shareState: 'pending' }] });

  it('is not called private, because the learner has already asked', async () => {
    api.get.mockResolvedValue(pending());
    await mount();
    expect(q('[data-testid="ps-practice-private"]')).toBeNull();
  });

  it('is not called published either, because nobody can watch it yet', async () => {
    // The dangerous half of this state. A learner told "published" while staff have
    // not approved believes their cohort is watching something nobody can see.
    api.get.mockResolvedValue(pending());
    await mount();
    expect(q('[data-testid="ps-practice-published"]')).toBeNull();
    expect(text()).not.toContain('your cohort can watch this');
  });

  it('says it is waiting, and still private meanwhile', async () => {
    api.get.mockResolvedValue(pending());
    await mount();
    const el = q('[data-testid="ps-practice-awaiting-approval"]')!;
    expect(el.textContent).toContain('Waiting for staff approval');
    expect(el.textContent).toContain('still private');
  });

  it('does NOT offer the share control again', async () => {
    // Idempotent server-side, but offering the button would make a learner think
    // the first request had not landed.
    api.get.mockResolvedValue(pending());
    await mount();
    expect(q('[data-testid="ps-share-open"]')).toBeNull();
  });
});

describe('the share control is never offered on a published take', () => {
  it('has no ask button once it is already public', async () => {
    api.get.mockResolvedValue(SESSION({ recordings: [{ ...TAKE, shareState: 'published' }] }));
    await mount();
    expect(q('[data-testid="ps-share-open"]')).toBeNull();
  });
});

describe('EVERY take says something about who can see it', () => {
  /**
   * The invariant the per-state tests miss.
   *
   * Each state is checked by asserting the other two labels are ABSENT, and absence
   * is also what you get when a take renders no label at all. Deleting the pending
   * branch during a mutation run left a pending take with no visibility label
   * whatsoever, and twelve of thirteen tests stayed green — a take silently saying
   * nothing about its audience is the same failure as saying the wrong thing, and
   * nothing was watching for it.
   *
   * So: exactly one label, for every state, including one the server has not been
   * taught yet.
   */
  const LABELS = [
    '[data-testid="ps-practice-private"]',
    '[data-testid="ps-practice-awaiting-approval"]',
    '[data-testid="ps-practice-published"]',
  ].join(',');

  it.each(['private', 'pending', 'published', undefined, 'something-new'])(
    'shows exactly one visibility label when shareState is %s',
    async (shareState) => {
      api.get.mockResolvedValue(SESSION({ recordings: [{ ...TAKE, shareState }] }));
      await mount();
      // Scoped to the take card, so the room-creation chip elsewhere on the panel
      // cannot stand in for a visibility label — it once did, under a testid this
      // label had duplicated.
      const card = q('[data-testid="ps-practice-player-1"]')!;
      expect(card).not.toBeNull();
      expect(card.querySelectorAll(LABELS)).toHaveLength(1);
    },
  );

  it('an unknown state falls back to PRIVATE, never to nothing', async () => {
    // The safe direction. A state this build has not been taught must understate
    // reach rather than imply an audience that may not exist.
    api.get.mockResolvedValue(SESSION({ recordings: [{ ...TAKE, shareState: 'something-new' }] }));
    await mount();
    expect(q('[data-testid="ps-practice-private"]')).not.toBeNull();
  });
});
