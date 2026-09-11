/**
 * The notices around a build, and in particular the handoff into Story 000
 * on delivery. The generic "your plan is ready" line told a student the plan
 * existed and nothing about where to begin; this pins what replaced it.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../../../../services/sbpApi', () => ({
  describeFailure: () => ({ title: 'We could not reach the build service.', body: 'It was unreachable.', action: 'Try again in a few minutes.' }),
}));

import { PipelineBanner, Story000Handoff, CallBanner } from '../ProjectBanners';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

async function mount(ui: React.ReactElement) {
  await act(async () => {
    root = createRoot(container);
    root.render(ui);
  });
}

const PROJECT = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';

describe('the handoff on delivery', () => {
  it('names Story 000, says what it does, and opens it', async () => {
    const onOpen = jest.fn();
    await mount(<PipelineBanner pipeline={{ state: 'delivered', projectId: PROJECT }} handoff={null} onOpenStory000={onOpen} />);

    const text = container.textContent || '';
    expect(text).toContain('Your plan is ready. Start with Story 000.');
    expect(text).toContain('connects your repo so the platform can see your pushes');
    expect(text).toContain('visible from day one rather than found in week six');
    // No counts were available, so none are quoted: nothing invented.
    expect(container.querySelector('[data-testid="handoff-counts"]')).toBeNull();

    const btn = Array.from(container.querySelectorAll('button')).find((b) => /Open Story 000/.test(b.textContent || ''))!;
    expect(btn).toBeTruthy();
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('quotes the counts when it has them, in plain words', async () => {
    await mount(<Story000Handoff counts={{ told: 4, inferred: 0, unanswered: 3 }} onOpen={null} />);
    const text = container.querySelector('[data-testid="handoff-counts"]')!.textContent || '';
    expect(text).toContain('4 things you told us');
    expect(text).not.toContain('worked out');
    expect(text).toContain('3 questions still unanswered');
  });

  it('handles the singulars and the empty case without reading as an error', async () => {
    await mount(<Story000Handoff counts={{ told: 1, inferred: 1, unanswered: 0 }} onOpen={null} />);
    const text = container.querySelector('[data-testid="handoff-counts"]')!.textContent || '';
    expect(text).toContain('one thing you told us');
    expect(text).toContain('one thing we worked out');
    expect(text).toContain('nothing still unanswered');
  });

  it('renders no button when there is nothing to open yet', async () => {
    await mount(<Story000Handoff counts={null} onOpen={null} />);
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('the other states are unchanged', () => {
  it('idle renders nothing', async () => {
    await mount(<PipelineBanner pipeline={{ state: 'idle' }} />);
    expect(container.innerHTML).toBe('');
  });

  it('generating says so and never mentions Story 000', async () => {
    await mount(<PipelineBanner pipeline={{ state: 'generating', projectId: PROJECT }} />);
    expect(container.textContent).toContain('Designing your system');
    expect(container.textContent).not.toContain('Story 000');
  });

  it('gate_failed lists the blocking reasons', async () => {
    await mount(<PipelineBanner pipeline={{ state: 'gate_failed', projectId: PROJECT, reasons: ['REQ-003 has no story'] }} />);
    expect(container.textContent).toContain('REQ-003 has no story');
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('local fallback uses the classified failure copy', async () => {
    await mount(<PipelineBanner pipeline={{ state: 'local', error: { status: null, kind: 'network', message: 'x' } as any }} />);
    expect(container.textContent).toContain('We could not reach the build service.');
    expect(container.textContent).toContain('no Command Center');
  });

  it('the call banner says a call is coming only in the ok tone', async () => {
    await mount(<CallBanner notice={{ tone: 'warn', text: 'We could not place the call.' }} />);
    expect(container.textContent).toContain('We could not set up the call');
    expect(container.textContent).toContain('We could not place the call.');
  });
});
