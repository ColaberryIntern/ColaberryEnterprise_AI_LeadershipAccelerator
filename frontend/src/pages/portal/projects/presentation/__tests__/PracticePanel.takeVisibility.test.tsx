import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PracticePanel from '../PracticePanel';
import portalApi from '../../../../../utils/portalApi';

/**
 * EVERY TAKE GETS ITS OWN SWITCH, WIRED TO ITS OWN RECORDING.
 *
 * `VisibilitySwitch.test.tsx` proves the switch tells the truth about one take.
 * This file proves the panel hands each switch the RIGHT take — which is the half a
 * unit test of the switch cannot see, and the half that would have been wrong under
 * attempt-level keying: three cards, three switches, one shared state, and flipping
 * any of them flipping all three.
 *
 * It also pins the invariant that outlived the old label tests: every take says
 * something about who can see it. A take rendering no visibility control at all is
 * the same failure as one saying the wrong thing, and the per-state assertions
 * cannot see it because absence is what they check for.
 */

jest.mock('../../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
const api = portalApi as unknown as { get: jest.Mock; post: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

const REC_A = 'aaaaaaa1-1111-4111-8111-111111111111';
const REC_B = 'bbbbbbb2-2222-4222-8222-222222222222';

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

const take = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  partNo: 1,
  playbackUrl: `/api/portal/projects/p1/tasks/PREP-4/recordings/${id}/file?t=tkt`,
  shareState: 'private',
  showcaseId: null,
  viewCount: 0,
  viewLabel: 'No views yet',
  ...over,
});

const SESSION = (recordings: unknown[]) => ({
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
      recordings,
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

const q = (sel: string) => container.querySelector(sel);
const all = (sel: string) => Array.from(container.querySelectorAll(sel));

describe('one switch per take', () => {
  it('renders a switch for every take, keyed by recording', async () => {
    api.get.mockResolvedValue(SESSION([take(REC_A), take(REC_B)]));
    await mount();
    expect(q(`[data-testid="ps-visibility-${REC_A}"]`)).not.toBeNull();
    expect(q(`[data-testid="ps-visibility-${REC_B}"]`)).not.toBeNull();
    expect(all('[data-testid="ps-visibility-switch"]')).toHaveLength(2);
  });

  it('EACH TAKE CARRIES ITS OWN STATE — the whole reason for the re-keying', async () => {
    // Published take B, private take A. Under attempt-level keying both read as
    // published and a switch on one silently governed the other.
    api.get.mockResolvedValue(SESSION([
      take(REC_A),
      take(REC_B, { shareState: 'published', showcaseId: 's2', viewLabel: '4 people have watched this' }),
    ]));
    await mount();

    const a = q(`[data-testid="ps-visibility-${REC_A}"]`)!;
    const b = q(`[data-testid="ps-visibility-${REC_B}"]`)!;
    expect(a.querySelector('[data-testid="ps-visibility-switch"]')!.getAttribute('aria-checked')).toBe('false');
    expect(b.querySelector('[data-testid="ps-visibility-switch"]')!.getAttribute('aria-checked')).toBe('true');
    // And the count belongs to the published one only.
    expect(a.querySelector('[data-testid="ps-visibility-views"]')).toBeNull();
    expect(b.querySelector('[data-testid="ps-visibility-views"]')!.textContent)
      .toBe('4 people have watched this');
  });

  it('a mixed attempt shows all three states at once', async () => {
    api.get.mockResolvedValue(SESSION([
      take(REC_A, { shareState: 'pending', showcaseId: 's1' }),
      take(REC_B, { shareState: 'published', showcaseId: 's2' }),
      take('ccccccc3-3333-4333-8333-333333333333'),
    ]));
    await mount();
    const states = all('[data-testid="ps-visibility-switch"]').map((el) => el.getAttribute('data-state'));
    expect(states).toEqual(['pending', 'published', 'private']);
  });
});

describe('every take says who can see it', () => {
  it.each(['private', 'pending', 'published', undefined, 'something-new'])(
    'shows exactly one visibility control when shareState is %s',
    async (shareState) => {
      api.get.mockResolvedValue(SESSION([take(REC_A, { shareState, showcaseId: 's1' })]));
      await mount();
      const card = q('[data-testid="ps-practice-player-1"]')!;
      expect(card).not.toBeNull();
      expect(card.querySelectorAll('[data-testid="ps-visibility-switch"]')).toHaveLength(1);
      expect(card.querySelector('[data-testid="ps-visibility-label"]')!.textContent!.trim()).not.toBe('');
    },
  );

  it('defaults to private when the server omits the state entirely', async () => {
    api.get.mockResolvedValue(SESSION([{
      id: REC_A, partNo: 1, playbackUrl: `/x/${REC_A}`,
    }]));
    await mount();
    expect(q('[data-testid="ps-visibility-switch"]')!.getAttribute('aria-checked')).toBe('false');
  });
});
