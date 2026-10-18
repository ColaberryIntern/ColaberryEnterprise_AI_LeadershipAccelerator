import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import VisibilitySwitch from '../VisibilitySwitch';
import portalApi from '../../../../../utils/portalApi';

/**
 * THE CONTROL THAT DECIDES WHO SEES A STUDENT'S FACE.
 *
 * It replaced a one-way "Ask staff to share" button and a "Take this down" that
 * lived on a different tab — two halves of one decision, shown in two places, with
 * the learner expected to hold the state in their head.
 *
 * Almost every test here is about the control telling the truth about its own
 * state, because this is the one place in the product where being wrong has a cost
 * measured in somebody's privacy rather than in a retry.
 */

jest.mock('../../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
const api = portalApi as unknown as { get: jest.Mock; post: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;
let onChanged: jest.Mock;

const REC = 'aaaaaaa1-1111-4111-8111-111111111111';
const SHOWCASE = 'bbbbbbb2-2222-4222-8222-222222222222';

beforeEach(() => {
  jest.clearAllMocks();
  onChanged = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

async function mount(over: Record<string, unknown> = {}) {
  const props = {
    projectId: 'p1',
    storyId: 'PREP-4',
    attemptId: 'a1',
    recordingId: REC,
    showcaseId: null as string | null,
    shareState: 'private' as any,
    viewLabel: 'No views yet',
    onChanged,
    ...over,
  };
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(<VisibilitySwitch {...(props as any)} />);
  });
}

const text = () => container.textContent || '';
const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const sw = () => q('[data-testid="ps-visibility-switch"]') as HTMLButtonElement;
const click = async (el: HTMLElement) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const type = async (value: string) => {
  const ta = q('[data-testid="ps-visibility-summary"]') as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('the switch says which state it is in', () => {
  it('private: off, and says only you can see it', async () => {
    await mount();
    expect(sw().getAttribute('aria-checked')).toBe('false');
    expect(text()).toContain('Private — only you can see this');
  });

  it('public: on, and says the cohort can watch', async () => {
    await mount({ shareState: 'published', showcaseId: SHOWCASE });
    expect(sw().getAttribute('aria-checked')).toBe('true');
    expect(text()).toContain('Public — your cohort can watch this');
  });

  it('pending: OFF, because nobody can watch it yet', async () => {
    // The dangerous one. A switch that reads "on" while staff have not approved
    // tells a learner their cohort is watching something nobody can see.
    await mount({ shareState: 'pending', showcaseId: SHOWCASE });
    expect(sw().getAttribute('aria-checked')).toBe('false');
    expect(text()).toContain('Waiting for staff approval');
    expect(text()).toContain('still private');
  });

  it('an unknown state falls back to PRIVATE, never to public', async () => {
    // Understating reach is the only safe direction to be wrong in here.
    await mount({ shareState: 'something-new' });
    expect(sw().getAttribute('aria-checked')).toBe('false');
    expect(text()).toContain('Private — only you can see this');
  });

  it('is a real switch to a screen reader', async () => {
    await mount();
    expect(sw().getAttribute('role')).toBe('switch');
    expect(sw().getAttribute('aria-label')).toBeTruthy();
  });
});

describe('the view count', () => {
  it('appears only when public', async () => {
    await mount({ shareState: 'published', showcaseId: SHOWCASE, viewLabel: '3 people have watched this' });
    expect(q('[data-testid="ps-visibility-views"]')!.textContent).toBe('3 people have watched this');
  });

  it('is HIDDEN while private — a private video has no audience to count', async () => {
    // "No views yet" under a private take implies an audience that cannot exist,
    // and invites a learner to read silence as rejection.
    await mount({ shareState: 'private' });
    expect(q('[data-testid="ps-visibility-views"]')).toBeNull();
  });

  it('is hidden while pending too', async () => {
    await mount({ shareState: 'pending', showcaseId: SHOWCASE });
    expect(q('[data-testid="ps-visibility-views"]')).toBeNull();
  });
});

describe('turning it on', () => {
  it('asks for words first, rather than publishing on a single click', async () => {
    await mount();
    await click(sw());
    expect(q('[data-testid="ps-visibility-form"]')).not.toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('POSTs the RECORDING, not just the attempt', async () => {
    // The whole point of the re-keying. Sending only the attempt would publish
    // every take recorded in that room.
    api.post.mockResolvedValue({ data: { showcase_id: SHOWCASE, created: true } });
    await mount();
    await click(sw());
    await type('A courier routing demo.');
    await click(q('[data-testid="ps-visibility-submit"]')!);

    expect(api.post).toHaveBeenCalledWith(
      '/api/portal/projects/p1/tasks/PREP-4/showcase',
      { attempt_id: 'a1', recording_id: REC, summary: 'A courier routing demo.' },
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('will not send an empty summary', async () => {
    await mount();
    await click(sw());
    expect((q('[data-testid="ps-visibility-submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the grounding notices verbatim when the server refuses', async () => {
    api.post.mockRejectedValue({
      response: { status: 422, data: { error: 'Needs fixing.', notices: ['No latency measurement in this project.'] } },
    });
    await mount();
    await click(sw());
    await type('It cut latency by 90%.');
    await click(q('[data-testid="ps-visibility-submit"]')!);

    expect(text()).toContain('No latency measurement in this project.');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('promises the way back at the moment consent is given', async () => {
    await mount();
    await click(sw());
    expect(text()).toContain('switch it back to private at any time');
  });
});

describe('turning it off', () => {
  it('withdraws immediately, with no summary and no second step', async () => {
    // Publishing needed staff sign-off; unpublishing does not. Consent is
    // withdrawable by the person who gave it.
    api.post.mockResolvedValue({ data: { withdrawn: true } });
    await mount({ shareState: 'published', showcaseId: SHOWCASE });
    await click(sw());

    expect(api.post).toHaveBeenCalledWith(
      `/api/portal/projects/p1/tasks/PREP-4/published/${SHOWCASE}/withdraw`,
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('never asks for approval to stop sharing', async () => {
    await mount({ shareState: 'published', showcaseId: SHOWCASE });
    expect(text()).not.toMatch(/approval|approve/i);
  });

  it('reports a failed take-down instead of pretending it worked', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Nope.' } } });
    await mount({ shareState: 'published', showcaseId: SHOWCASE });
    await click(sw());
    expect(text()).toContain('Nope.');
    // Still reads as public, because it still is.
    expect(sw().getAttribute('aria-checked')).toBe('true');
  });
});

describe('a pending request can be called off', () => {
  it('offers a cancel that withdraws the request', async () => {
    api.post.mockResolvedValue({ data: { withdrawn: true } });
    await mount({ shareState: 'pending', showcaseId: SHOWCASE });
    await click(q('[data-testid="ps-visibility-cancel-request"]')!);

    expect(api.post).toHaveBeenCalledWith(
      `/api/portal/projects/p1/tasks/PREP-4/published/${SHOWCASE}/withdraw`,
    );
  });

  it('does not let the switch itself be flipped while pending', async () => {
    // Clicking it would be ambiguous: cancel the request, or hurry it along?
    await mount({ shareState: 'pending', showcaseId: SHOWCASE });
    expect(sw().disabled).toBe(true);
  });
});
