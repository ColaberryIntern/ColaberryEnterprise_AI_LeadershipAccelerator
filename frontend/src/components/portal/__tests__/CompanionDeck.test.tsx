import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import CompanionDeck from '../CompanionDeck';
import type { CompanionState, PulseState } from '../../../services/onboardingApi';

/**
 * L4.7 — the phone deck.
 *
 * The acceptance signal is one sentence: a viewer can follow, mark themselves Building or
 * Stuck, and answer a poll with one thumb. So the tests are about TAPS — that a tap registers
 * immediately, that it is not undone by the next refresh two and a half seconds later, and
 * that a tap which should not be possible is not offered.
 *
 * The optimistic-update case is the one that would be missed by hand: it only shows up if you
 * tap and then wait, which nobody does while developing.
 */

const QUESTION = {
  key: 'q1',
  kind: 'poll' as const,
  q: 'Which one ships first?',
  options: ['The schema', 'The UI', 'Neither'],
  answer: 0,
  revealed: false,
  my_choice: null,
  theater: undefined,
};

const baseState = (over: Partial<CompanionState> = {}): CompanionState => ({
  phase: 'status',
  title: 'Week 12',
  question: null,
  prompt: null,
  my_pulse: null,
  ...over,
});

let container: HTMLDivElement;
let root: Root;
let loadState: jest.Mock;
let sendPulse: jest.Mock;
let sendPoll: jest.Mock;

async function render(state: CompanionState | Error = baseState()) {
  loadState = jest.fn().mockImplementation(() => (
    state instanceof Error ? Promise.reject(state) : Promise.resolve(state)
  ));
  sendPulse = jest.fn().mockResolvedValue(undefined);
  sendPoll = jest.fn().mockResolvedValue(undefined);

  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <CompanionDeck sessionId="s1" loadState={loadState} sendPulse={sendPulse} sendPoll={sendPoll} />,
    );
  });
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
  jest.useRealTimers();
});

const find = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const tap = async (id: string) => { await act(async () => { find(id)!.click(); }); };
const text = () => container.textContent || '';

describe('one thumb, four states', () => {
  it('offers all four, including Following', async () => {
    // The check-in controller offers three. Without Following, every option a viewer who is
    // simply watching can press is a claim about building something.
    await render();

    (['here', 'building', 'stuck', 'finished'] as PulseState[]).forEach((s) => {
      expect(find(`companion-pulse-${s}`)).not.toBeNull();
    });
    expect(text()).toContain('Following');
  });

  it('registers a tap immediately and sends it', async () => {
    await render();
    await tap('companion-pulse-building');

    expect(find('companion-pulse-building')!.getAttribute('aria-pressed')).toBe('true');
    expect(sendPulse).toHaveBeenCalledWith('s1', 'building');
  });

  it('does NOT let the next refresh undo the tap', async () => {
    // The deck refreshes every 2.5s. If the server write is slower than the next read, a
    // viewer watches their own status silently revert, which reads as the app ignoring them.
    jest.useFakeTimers();
    await render(baseState({ my_pulse: null }));

    await tap('companion-pulse-stuck');
    await act(async () => { jest.advanceTimersByTime(2500); });

    expect(find('companion-pulse-stuck')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('CONTROL: before any tap, the server value is what shows', async () => {
    // Without this, the test above could pass because the refresh never applies anything.
    await render(baseState({ my_pulse: 'finished' }));

    expect(find('companion-pulse-finished')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the tap even when the write fails', async () => {
    await render();
    sendPulse.mockRejectedValue(new Error('offline'));
    await tap('companion-pulse-here');

    expect(find('companion-pulse-here')!.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('answering a poll', () => {
  it('answers with one tap', async () => {
    await render(baseState({ question: QUESTION }));
    await tap('companion-opt-1');

    expect(sendPoll).toHaveBeenCalledWith('s1', 'q1', 1);
    expect(find('companion-opt-1')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('cannot be answered twice', async () => {
    await render(baseState({ question: QUESTION }));
    await tap('companion-opt-1');
    await tap('companion-opt-2');

    expect(sendPoll).toHaveBeenCalledTimes(1);
  });

  it('does not accept a vote once the instructor has locked it', async () => {
    // Live Decision Theater: a vote after the lock is a claim about when the viewer answered.
    await render(baseState({ question: { ...QUESTION, theater: { state: 'locked' } } }));
    await tap('companion-opt-0');

    expect(sendPoll).not.toHaveBeenCalled();
    expect(find('companion-poll-closed')).not.toBeNull();
  });

  it('CONTROL: the same poll IS answerable while voting is open', async () => {
    await render(baseState({ question: { ...QUESTION, theater: { state: 'voting' } } }));
    await tap('companion-opt-0');

    expect(sendPoll).toHaveBeenCalledTimes(1);
  });

  it('marks the right answer once it is revealed', async () => {
    await render(baseState({ question: { ...QUESTION, revealed: true, my_choice: 2 } }));

    expect(find('companion-opt-0')!.className).toContain('is-correct');
    expect(find('companion-opt-2')!.className).toContain('is-mine');
  });
});

describe('a prompt drop', () => {
  it('shows the prompt and what to expect', async () => {
    await render(baseState({
      prompt: {
        label: 'Try this', prompt: 'build me a dashboard',
        expectedResult: 'a chart appears', stopCondition: 'it errors twice',
      },
    }));

    expect(find('companion-prompt')).not.toBeNull();
    expect(text()).toContain('build me a dashboard');
    expect(text()).toContain('a chart appears');
    expect(text()).toContain('it errors twice');
  });
});

describe('when the refresh fails', () => {
  it('keeps the deck on screen rather than blanking it', async () => {
    // A blank deck mid-class reads as "the class ended".
    jest.useFakeTimers();
    await render(baseState({ question: QUESTION }));
    expect(find('companion-poll')).not.toBeNull();

    loadState.mockRejectedValue(new Error('network'));
    await act(async () => { jest.advanceTimersByTime(2500); });

    expect(find('companion-poll')).not.toBeNull();
    expect(text()).toContain('Which one ships first?');
  });

  it('still renders the status buttons when the very first load fails', async () => {
    await render(new Error('network'));

    expect(find('companion-pulse-here')).not.toBeNull();
  });
});

describe('it looks like Colaberry', () => {
  it('uses semantic tokens rather than hardcoded colors, so dark mode holds', async () => {
    await render();
    const css = container.querySelector('style')?.textContent || '';

    expect(css).toContain('var(--surface-card)');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('gives every control a thumb-sized target', async () => {
    // 56px is the floor for a one-handed tap. A 32px row is a desktop control on a phone.
    await render(baseState({ question: QUESTION }));
    const css = container.querySelector('style')?.textContent || '';

    expect(css).toMatch(/\.cdeck-opt\{[^}]*min-height:56px/);
    expect(css).toMatch(/\.cdeck-pulse\{[^}]*min-height:56px/);
  });
});
