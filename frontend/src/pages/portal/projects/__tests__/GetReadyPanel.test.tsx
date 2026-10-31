import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import GetReadyPanel from '../presentation/GetReadyPanel';

jest.mock('../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const portalApi = require('../../../../utils/portalApi').default as { post: jest.Mock };

const LAUNCH_OK = {
  data: {
    join_url: 'https://zoom.us/j/999',
    attempt_id: 'at1',
    brief: { whoCanSee: 'Only you.', recordingAutomatic: true, recordingPolicy: 'always' },
  },
};

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;
let openSpy: jest.SpyInstance;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  portalApi.post.mockReset();
  portalApi.post.mockResolvedValue(LAUNCH_OK);
  openSpy = jest.spyOn(window, 'open').mockReturnValue({} as Window);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  openSpy.mockRestore();
});

function mount(over: Record<string, unknown> = {}) {
  act(() => {
    const r = createRoot(container);
    root = r;
    r.render(
      <GetReadyPanel
        projectId="p1"
        storyId="PREP-4"
        attemptId="at1"
        mode="practice_solo"
        recordingPolicy="always"
        {...over as any}
      />,
    );
  });
}

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);
const click = async (el: Element | null) => {
  await act(async () => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
};
const tick = async () => {
  const box = q('ps-getready-ack') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')!.set!;
  await act(async () => {
    setter.call(box, true);
    box.dispatchEvent(new Event('click', { bubbles: true }));
  });
};

describe('informed consent before a recorded call', () => {
  it('will not let a student in until they acknowledge', async () => {
    mount();
    expect((q('ps-getready-join') as HTMLButtonElement).disabled).toBe(true);
    await tick();
    expect((q('ps-getready-join') as HTMLButtonElement).disabled).toBe(false);
  });

  it('describes a solo rehearsal as private and automatically recorded', async () => {
    mount();
    expect(q('ps-getready-who')?.textContent).toMatch(/only you/i);
    expect(q('ps-getready-recording')?.textContent).toMatch(/records automatically/i);
  });

  it('does NOT say "only you" about a cohort session', async () => {
    // A consent screen that misstates the audience is worse than no consent screen.
    mount({ mode: 'cohort_live' });
    expect(q('ps-getready-who')?.textContent).toMatch(/cohort/i);
    expect(q('ps-getready-who')?.textContent).not.toMatch(/only you/i);
  });

  it('does NOT promise a recording when the room will not make one', async () => {
    mount({ recordingPolicy: 'never' });
    expect(q('ps-getready-recording')?.textContent).toMatch(/does not record/i);
  });

  it('tells the student to share their screen before they speak', async () => {
    // Every student working-system demo recorded before this line existed came back
    // as `active_speaker` — the learner talking, the system nowhere in frame.
    mount();
    expect(q('ps-getready-screen')?.textContent).toMatch(/share your screen/i);
    expect(q('ps-getready-screen')?.textContent).toMatch(/before you start speaking/i);
  });

  it('says what happens if they do not, not just that they should', async () => {
    // "Share your screen" on its own reads as optional. The consequence is the part
    // that makes someone do it at the right moment, so it is pinned separately.
    mount();
    expect(q('ps-getready-screen')?.textContent).toMatch(/nothing to look at/i);
  });

  it('shows the screen instruction whatever the room is', async () => {
    // It is not derived from mode or policy, unlike the two consent facts. A cohort
    // session and a room that never records both still need a screen shared.
    for (const over of [{ mode: 'cohort_live' }, { mode: 'practice_peer' }, { recordingPolicy: 'never' }]) {
      mount(over);
      expect(q('ps-getready-screen')?.textContent).toMatch(/share your screen/i);
      act(() => root?.unmount());
      root = null;
    }
  });

  it('makes the acknowledgement cover the screen, so ticking it is a commitment', async () => {
    mount();
    const label = container.querySelector('.ps-check label')?.textContent || '';
    expect(label).toMatch(/three points/i);
    expect(label).toMatch(/share my screen/i);
    // The gate still works: reading three facts instead of two must not unlock Join early.
    expect((q('ps-getready-join') as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks the server for the link only when the student actually goes in', async () => {
    mount();
    expect(portalApi.post).not.toHaveBeenCalled();
    await tick();
    await click(q('ps-getready-join'));
    expect(portalApi.post).toHaveBeenCalledTimes(1);
    expect(portalApi.post.mock.calls[0][1]).toEqual({ attempt_id: 'at1' });
  });
});

describe('a blocked popup is a normal case, not a dead end', () => {
  it('offers the same link to click when the browser blocks the tab', async () => {
    openSpy.mockReturnValue(null); // what a popup blocker actually does
    mount();
    await tick();
    await click(q('ps-getready-join'));

    expect(q('ps-getready-blocked')).not.toBeNull();
    const link = q('ps-getready-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://zoom.us/j/999');
  });

  it('does not re-request the launch — one intent stays one join event', async () => {
    openSpy.mockReturnValue(null);
    mount();
    await tick();
    await click(q('ps-getready-join'));
    expect(portalApi.post).toHaveBeenCalledTimes(1);
  });

  it('opens with noopener so the meeting tab cannot reach back into the portal', async () => {
    mount();
    await tick();
    await click(q('ps-getready-join'));
    expect(openSpy.mock.calls[0][2]).toContain('noopener');
    const link = q('ps-getready-link') as HTMLAnchorElement;
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});

describe('when the room is not usable yet', () => {
  it('passes the server\'s truthful "still being created" through to the student', async () => {
    portalApi.post.mockRejectedValue({
      response: { status: 409, data: { error: 'The room is still being created. Try again in a few seconds.' } },
    });
    mount();
    await tick();
    await click(q('ps-getready-join'));

    expect(q('ps-getready-problem')?.textContent).toMatch(/still being created/i);
    // Still on the consent screen, so trying again costs nothing.
    expect(q('ps-getready-join')).not.toBeNull();
  });

  it('reports an authorization refusal without pretending it is a glitch', async () => {
    portalApi.post.mockRejectedValue({
      response: { status: 403, data: { error: 'You are not authorized to join this session.' } },
    });
    mount();
    await tick();
    await click(q('ps-getready-join'));
    expect(q('ps-getready-problem')?.textContent).toMatch(/not authorized/i);
  });
});

describe('explorer/demo mode', () => {
  it('never calls the API', async () => {
    mount({ demo: true });
    await flush();
    expect(portalApi.post).not.toHaveBeenCalled();
    expect(q('ps-getready-demo')).not.toBeNull();
  });
});
