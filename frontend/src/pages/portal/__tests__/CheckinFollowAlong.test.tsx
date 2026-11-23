import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CheckinLiveController, { LiveClient } from '../CheckinLiveController';
import { claudePromptUrl } from '../CheckinFollowAlong';
import type { CompanionState } from '../../../services/onboardingApi';

// The follow-along added to the class check-in page on 2026-11-23: the slide's plain-words
// card, the prefilled Open in Claude link on prompt slides, and the Get Claude helper.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function clientWith(state: Partial<CompanionState>): LiveClient {
  const full: CompanionState = { phase: 'status', title: 'Class', question: null, my_pulse: null, ...state };
  return {
    getState: jest.fn().mockResolvedValue(full),
    pulse: jest.fn().mockResolvedValue(undefined),
    ask: jest.fn().mockResolvedValue(undefined),
    vote: jest.fn().mockResolvedValue(undefined),
  };
}

const signedOut = { body: 'x', action: 'y', onAction: () => undefined };
let host: HTMLDivElement;
let root: Root;

beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

async function mount(client: LiveClient): Promise<void> {
  await act(async () => {
    root.render(<CheckinLiveController title="Class" meta="m" eyebrow="in" signedOut={signedOut} client={client} />);
  });
  // let the first getState() resolve and render
  await act(async () => { await Promise.resolve(); });
}

const q = (id: string) => host.querySelector(`[data-testid="${id}"]`);

describe('class check-in follow-along', () => {
  it('shows the slide card and a prefilled Open in Claude link on a prompt slide', async () => {
    const prompt = 'Make me a practice table & check it?';
    await mount(clientWith({
      phase: 'prompt',
      prompt: { label: 'Hands-on 1', prompt },
      follow: { step: 'Hands-on 1 of 5', heading: 'Make practice data', bullets: ['Tap Copy', 'Paste in Claude'] },
    }));
    expect(q('follow-card')?.textContent).toContain('Make practice data');
    expect(q('follow-card')?.textContent).toContain('Hands-on 1 of 5');
    expect(q('follow-card')?.textContent).toContain('Paste in Claude');
    const link = q('open-in-claude') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(claudePromptUrl(prompt));
    expect(link.getAttribute('href')).toContain(encodeURIComponent('&'));
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('opens the Get Claude helper only when the slide asks for it', async () => {
    await mount(clientWith({ follow: { heading: 'Get Claude open', install: true } }));
    expect(q('get-claude')?.textContent).toContain('On your phone');
    act(() => root.unmount());
    root = createRoot(host);
    await mount(clientWith({ follow: { heading: 'Listen' } }));
    expect(q('follow-card')?.textContent).toContain('Listen');
    expect(q('get-claude')?.textContent).not.toContain('On your phone');
    expect(q('get-claude')?.textContent).toContain('New to Claude? Get it in one minute');
  });

  it('renders no card for an older backend that sends no follow field', async () => {
    const client = clientWith({});
    await mount(client);
    expect(client.getState).toHaveBeenCalled();
    expect(q('follow-card')).toBeNull();
    expect(q('open-in-claude')).toBeNull();
  });
});
