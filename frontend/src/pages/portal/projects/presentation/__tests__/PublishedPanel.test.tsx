import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PublishedPanel from '../PublishedPanel';
import portalApi from '../../../../../utils/portalApi';

/**
 * THE PAGE THAT TELLS A STUDENT WHO CAN SEE THEIR FACE.
 *
 * Step 4 and Step 5 show the same recordings, and the only difference between them
 * is the audience. A learner who misreads which panel they are on believes a private
 * rehearsal is public, or — far worse — believes a published demo is private. So the
 * tests below are mostly about the WORDS on screen: that the audience is stated, that
 * "nothing published" never gets confused with "we could not load this", and that the
 * take-down control is real rather than a request submitted for approval.
 *
 * The view count matters for the same reason. "No views yet" is the honest sentence;
 * a blank where a number belongs reads as a bug, and an invented number is a lie
 * about their own work.
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

async function mount(demo = false) {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(<PublishedPanel projectId="p1" storyId="PREP-4" demo={demo} />);
  });
}

const text = () => container.textContent || '';
const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const click = async (el: HTMLElement) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

const DEMO = {
  showcaseId: 's1',
  recordingId: 'r1',
  audience: 'cohort',
  publishedAt: '2026-10-15T12:00:00Z',
  summary: 'A courier routing demo.',
  durationSeconds: 185,
  viewCount: 3,
  viewLabel: '3 people have watched this',
  playbackUrl: '/api/portal/projects/p1/tasks/PREP-4/recordings/r1/file?t=tkt',
};
const one = (over: Record<string, unknown> = {}) => ({ data: { published: [{ ...DEMO, ...over }] } });

describe('a published demo says who can watch it', () => {
  it('names the audience ON the video, not elsewhere on the page', async () => {
    api.get.mockResolvedValue(one());
    await mount();
    expect(q('[data-testid="ps-published-audience"]')!.textContent)
      .toContain('Public to your cohort');
  });

  it('never calls a published demo private', async () => {
    // The exact confusion this panel exists to prevent. Step 4 carries the word
    // "Private"; if it ever appears here, the two panels have blurred.
    api.get.mockResolvedValue(one());
    await mount();
    expect(text()).not.toMatch(/only you can see this/i);
  });

  it('distinguishes a cohort audience from the open internet', async () => {
    api.get.mockResolvedValue(one({ audience: 'public' }));
    await mount();
    expect(text()).toContain('Public on the open internet');
    expect(text()).not.toContain('your cohort');
  });

  it('plays from the SIGNED url the server handed back, untouched', async () => {
    // A <video> sends no Authorization header, so the ticket in the query string is
    // the only authority the request carries. Rebuilding this url here would drop it.
    api.get.mockResolvedValue(one());
    await mount();
    expect(q('video')!.getAttribute('src')).toBe(DEMO.playbackUrl);
  });
});

describe('the view count', () => {
  it('shows the sentence the server composed', async () => {
    api.get.mockResolvedValue(one());
    await mount();
    expect(q('[data-testid="ps-published-views"]')!.textContent).toBe('3 people have watched this');
  });

  it('shows "no views yet" rather than a blank', async () => {
    api.get.mockResolvedValue(one({ viewCount: 0, viewLabel: 'No views yet' }));
    await mount();
    expect(q('[data-testid="ps-published-views"]')!.textContent).toBe('No views yet');
  });
});

describe('taking it down', () => {
  it('POSTS the withdraw and re-reads the list', async () => {
    api.get.mockResolvedValueOnce(one());
    await mount();
    api.post.mockResolvedValue({ data: { withdrawn: true } });
    api.get.mockResolvedValue({ data: { published: [] } });

    await click(q('[data-testid="ps-published-withdraw-r1"]')!);

    expect(api.post).toHaveBeenCalledWith('/api/portal/projects/p1/tasks/PREP-4/published/s1/withdraw');
    // Gone from the page, not just from the server. A list that still shows a demo
    // the student just removed is the thing they asked to stop.
    expect(q('[data-testid="ps-published-r1"]')).toBeNull();
  });

  it('asks nobody for permission — no approval wording anywhere', async () => {
    // Publishing needed staff sign-off; unpublishing does not. Copy implying a
    // review would make a student think their face is still up pending someone.
    api.get.mockResolvedValue(one());
    await mount();
    expect(text()).not.toMatch(/approv|review|request/i);
  });

  it('says so when the take-down fails, and keeps the demo on screen', async () => {
    api.get.mockResolvedValue(one());
    await mount();
    api.post.mockRejectedValue({ response: { data: { error: 'Nope.' } } });

    await click(q('[data-testid="ps-published-withdraw-r1"]')!);

    expect(text()).toContain('Nope.');
    // Still listed: pretending it went down when it did not is the dangerous
    // direction of this error.
    expect(q('[data-testid="ps-published-r1"]')).not.toBeNull();
  });
});

describe('nothing published is not the same as nothing loaded', () => {
  it('says plainly that nothing is visible to anyone', async () => {
    api.get.mockResolvedValue({ data: { published: [] } });
    await mount();
    expect(text()).toContain('Nothing here is visible to anyone else');
  });

  it('a FAILED load does not render as an empty list', async () => {
    // Showing "you have published nothing" after a 500 would tell a student their
    // demo came down when it is still up.
    api.get.mockRejectedValue(new Error('network'));
    await mount();
    expect(text()).not.toContain('Nothing here is visible to anyone else');
    expect(text()).toContain('It does not mean you have published nothing');
  });

  it('offers a retry that actually re-fetches', async () => {
    api.get.mockRejectedValueOnce(new Error('network'));
    await mount();
    api.get.mockResolvedValue(one());
    await click(q('[data-testid="ps-published-error"] button')!);
    expect(q('[data-testid="ps-published-r1"]')).not.toBeNull();
  });
});

describe('the preview account', () => {
  it('fetches nothing, because a demo account owns no published work', async () => {
    await mount(true);
    expect(api.get).not.toHaveBeenCalled();
    expect(text()).toContain('preview account');
  });
});
