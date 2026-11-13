import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import SessionHandoff from '../SessionHandoff';

/**
 * D12 — the videographer handoff panel.
 *
 * EVERY TEST HERE IS ABOUT THE THIRD STATE. A checklist has two by habit, done and not done,
 * and this one needs three because the third is most of the list:
 *
 *   - `missing`   - the system produces this and it is not here yet. Go and do it.
 *   - `not_built` - nothing produces this. Waiting will not help; it needs a ticket.
 *
 * DOC 07 records that nothing in this system produces a transcript, chapter markers, a
 * retention disposition or title and thumbnail drafts. Rendered as unticked boxes, those read
 * as things a colleague forgot, and a videographer waits on work nobody is doing.
 */

let container: HTMLDivElement;
let root: Root;

const item = (over: Partial<Record<string, unknown>> = {}) => ({
  key: 'recording', label: 'The recording, bound to this airing', state: 'ready',
  detail: 'Bound.', ...over,
});

const aired = (over: Partial<Record<string, unknown>> = {}) => ({
  aired: true,
  occurrence_id: 'occ-1',
  editorial_state: 'replay_ready',
  post_show: [item({ key: 'recording_bound', label: 'The recording is bound' })],
  package: [item()],
  notice: { warn: false, missing: 0, notBuilt: 0, text: 'All here.' },
  post_show_notice: { warn: false, missing: 0, notBuilt: 0, text: 'All here.' },
  ...over,
});

async function render(result: unknown = aired(), reject = false) {
  const load = reject
    ? jest.fn().mockRejectedValue(new Error('nope'))
    : jest.fn().mockResolvedValue(result);
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<SessionHandoff sessionId="11111111-2222" load={load} />);
  });
  return load;
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
});

const find = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = () => container.textContent || '';

describe('when there is nothing to hand over', () => {
  it('renders NOTHING for a class that never aired', async () => {
    await render({ aired: false, post_show: [], package: [], notice: null });

    expect(container.textContent).toBe('');
  });

  it('says so quietly when the read fails, rather than vanishing', async () => {
    // A panel that disappears is indistinguishable from a class that never aired, and those
    // call for completely different next actions.
    await render(undefined, true);

    expect(text()).toMatch(/could not load the handoff/i);
  });
});

describe('the three states are visibly different', () => {
  const mixed = () => aired({
    package: [
      item({ key: 'recording', state: 'ready' }),
      item({ key: 'decisions', state: 'missing', label: 'Somebody has been through the list' }),
      item({ key: 'transcript', state: 'not_built', label: 'Transcript and chapter markers' }),
    ],
    notice: {
      warn: true, missing: 1, notBuilt: 1,
      text: '1 item is missing and can still be fixed; 1 is not built at all, so waiting will not produce it.',
    },
  });

  it('marks a NOT BUILT item differently from a MISSING one', async () => {
    await render(mixed());

    expect(find('handoff-mark-transcript')!.getAttribute('data-state')).toBe('not_built');
    expect(find('handoff-mark-decisions')!.getAttribute('data-state')).toBe('missing');
    // Not the same glyph: an empty box is a promise that filling it is possible.
    expect(find('handoff-mark-transcript')!.textContent)
      .not.toBe(find('handoff-mark-decisions')!.textContent);
  });

  it('labels each mark for a screen reader, so the difference is not colour alone', async () => {
    await render(mixed());

    expect(find('handoff-mark-transcript')!.getAttribute('aria-label')).toMatch(/not built/i);
    expect(find('handoff-mark-decisions')!.getAttribute('aria-label')).toMatch(/missing/i);
    expect(find('handoff-mark-recording')!.getAttribute('aria-label')).toMatch(/ready/i);
  });

  it('carries the sentence that says waiting will not help', async () => {
    await render(mixed());

    expect(find('handoff-notice')).not.toBeNull();
    expect(text()).toMatch(/waiting will not produce/i);
  });

  it('shows each item its detail, not just its label', async () => {
    // The detail is where the ticket number and the reason live. A bare label would leave
    // somebody knowing a thing is absent and not what to do about it.
    await render(aired({
      package: [item({ key: 'retention', state: 'not_built', detail: 'L8.1 is the ticket and it is open.' })],
    }));

    expect(text()).toContain('L8.1 is the ticket');
  });
});

describe('the post-show check', () => {
  it('leads with a warning while anything is outstanding', async () => {
    await render(aired({
      post_show_notice: { warn: true, missing: 1, notBuilt: 0, text: '1 item is missing and can still be fixed.' },
    }));

    expect(find('handoff-post-show-notice')).not.toBeNull();
    expect(text()).toMatch(/before anyone goes home/i);
  });

  it('shows no warning when the airing is clean', async () => {
    await render();

    expect(find('handoff-post-show-notice')).toBeNull();
  });

  it('keeps the two lists apart', async () => {
    // The post-show check is a thing to do in the room; the package is the thing to hand over.
    // One list would make the urgent items and the scope gaps read as one pile of work.
    await render();

    expect(find('handoff-post-show')).not.toBeNull();
    expect(find('handoff-package')).not.toBeNull();
  });
});
