import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ShareTakeControl from '../ShareTakeControl';
import portalApi from '../../../../../utils/portalApi';

/**
 * THE BUTTON THAT DID NOT EXIST.
 *
 * `POST .../showcase` shipped tested, with the whole approval model behind it, and
 * nothing in the frontend ever called it — a learner could record a demo and had no
 * way at all to share it. Production carried zero published showcases, platform
 * wide, which is what that looks like from the outside.
 *
 * The tests below are mostly about HONESTY OF COPY, because this control sits at the
 * moment a student decides to show their face to thirty people. Asking is not
 * publishing, and a button that implies otherwise is the failure that matters here.
 */

jest.mock('../../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
const api = portalApi as unknown as { get: jest.Mock; post: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;
let onRequested: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  onRequested = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

async function mount() {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(
      <ShareTakeControl projectId="p1" storyId="PREP-4" attemptId="a1" onRequested={onRequested} />,
    );
  });
}

const text = () => container.textContent || '';
const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const click = async (el: HTMLElement) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const type = async (value: string) => {
  const ta = q('[data-testid="ps-share-summary"]') as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const open = async () => { await click(q('[data-testid="ps-share-open"]')!); };

describe('the copy never claims this publishes anything', () => {
  it('asks staff rather than announcing a publish', async () => {
    await mount();
    expect(q('[data-testid="ps-share-open"]')!.textContent).toContain('Ask staff to share');
    expect(text()).not.toMatch(/\bpublish now\b|\bgo live\b/i);
  });

  it('says plainly that nobody can see it until approved', async () => {
    await mount();
    await open();
    expect(text()).toContain('Nobody can see this until a staff member approves it');
  });

  it('promises the take-down up front, at the moment consent is given', async () => {
    await mount();
    await open();
    expect(text()).toContain('take it down again at any time');
  });
});

describe('sending the request', () => {
  it('POSTs the attempt and the summary', async () => {
    api.post.mockResolvedValue({ data: { showcase_id: 's1', created: true } });
    await mount();
    await open();
    await type('A courier routing demo.');
    await click(q('[data-testid="ps-share-submit"]')!);

    expect(api.post).toHaveBeenCalledWith(
      '/api/portal/projects/p1/tasks/PREP-4/showcase',
      { attempt_id: 'a1', summary: 'A courier routing demo.' },
    );
  });

  it('tells the panel to re-read, so the label becomes "waiting"', async () => {
    api.post.mockResolvedValue({ data: { showcase_id: 's1', created: true } });
    await mount();
    await open();
    await type('A courier routing demo.');
    await click(q('[data-testid="ps-share-submit"]')!);
    expect(onRequested).toHaveBeenCalled();
  });

  it('refuses to send an empty summary', async () => {
    // A demo in a feed with no words is a thumbnail nobody clicks.
    await mount();
    await open();
    expect((q('[data-testid="ps-share-submit"]') as HTMLButtonElement).disabled).toBe(true);
    await type('   ');
    expect((q('[data-testid="ps-share-submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('trims before sending, so whitespace is not a summary', async () => {
    api.post.mockResolvedValue({ data: { showcase_id: 's1', created: true } });
    await mount();
    await open();
    await type('  A courier routing demo.  ');
    await click(q('[data-testid="ps-share-submit"]')!);
    expect(api.post.mock.calls[0][1].summary).toBe('A courier routing demo.');
  });
});

describe('when the server refuses the summary', () => {
  const rejected = {
    response: {
      status: 422,
      data: { error: 'That summary needs fixing.', notices: ['Your project has no latency measurement.'] },
    },
  };

  it('shows the notices verbatim, because they are the actionable part', async () => {
    api.post.mockRejectedValue(rejected);
    await mount();
    await open();
    await type('It cut latency by 90%.');
    await click(q('[data-testid="ps-share-submit"]')!);

    expect(text()).toContain('Your project has no latency measurement.');
  });

  it('keeps the form open with the text intact, so it can be fixed', async () => {
    // Clearing the box on rejection makes the learner retype from memory the thing
    // they were told to correct.
    api.post.mockRejectedValue(rejected);
    await mount();
    await open();
    await type('It cut latency by 90%.');
    await click(q('[data-testid="ps-share-submit"]')!);

    expect(q('[data-testid="ps-share-form"]')).not.toBeNull();
    expect((q('[data-testid="ps-share-summary"]') as HTMLTextAreaElement).value)
      .toBe('It cut latency by 90%.');
  });

  it('does NOT tell the panel anything was requested', async () => {
    api.post.mockRejectedValue(rejected);
    await mount();
    await open();
    await type('It cut latency by 90%.');
    await click(q('[data-testid="ps-share-submit"]')!);
    expect(onRequested).not.toHaveBeenCalled();
  });

  it('reports an ordinary failure without pretending it was the summary', async () => {
    api.post.mockRejectedValue({ response: { status: 500, data: {} } });
    await mount();
    await open();
    await type('A courier routing demo.');
    await click(q('[data-testid="ps-share-submit"]')!);

    expect(text()).toContain('We could not send that just now.');
    expect(q('[data-testid="ps-share-notices"]')).toBeNull();
  });
});

describe('cancelling', () => {
  it('closes without sending anything', async () => {
    await mount();
    await open();
    await type('A courier routing demo.');
    await click(q('[data-testid="ps-share-cancel"]')!);

    expect(api.post).not.toHaveBeenCalled();
    expect(q('[data-testid="ps-share-open"]')).not.toBeNull();
  });
});
