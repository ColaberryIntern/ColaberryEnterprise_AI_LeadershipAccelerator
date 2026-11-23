import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { renderMarkdown } from '../CheckinMarkdown';
import CheckinLiveController, { LiveClient } from '../CheckinLiveController';
import type { CompanionState } from '../../../services/onboardingApi';

// Run it here answers render as crisp Markdown, and the latest result follows the attendee onto
// vote slides (2026-11-23).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); localStorage.clear(); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const settle = async () => { await act(async () => { await Promise.resolve(); }); await act(async () => { await Promise.resolve(); }); };

const TABLE = '```markdown\n| Order ID | Amount |\n|----------|--------|\n| 1001 | $25 |\n| 1002 | -$60 |\n```';

describe('renderMarkdown', () => {
  it('unwraps a markdown fence and renders a real table with a header row', () => {
    act(() => { root.render(<div>{renderMarkdown(TABLE)}</div>); });
    expect(host.querySelectorAll('table th')).toHaveLength(2);
    expect(host.querySelectorAll('table tbody tr')).toHaveLength(2);
    expect(host.textContent).not.toContain('```');
    expect(host.textContent).not.toContain('---');
  });

  it('renders bold, lists and headings, and never raw HTML', () => {
    act(() => { root.render(<div>{renderMarkdown('## Result\n**STOP** now\n- one\n- two\n1. first\n<b>x</b>')}</div>); });
    expect(host.querySelector('.cbmd-h')!.textContent).toBe('Result');
    expect(host.querySelector('strong')!.textContent).toBe('STOP');
    expect(host.querySelectorAll('ul li')).toHaveLength(2);
    expect(host.querySelectorAll('ol li')).toHaveLength(1);
    expect(host.querySelector('b')).toBeNull();
    expect(host.textContent).toContain('<b>x</b>');
  });
});

function client(state: CompanionState, run?: jest.Mock): LiveClient {
  return {
    getState: jest.fn().mockResolvedValue(state),
    pulse: jest.fn().mockResolvedValue(undefined), ask: jest.fn().mockResolvedValue(undefined), vote: jest.fn().mockResolvedValue(undefined),
    ...(run ? { run } : {}),
  };
}
const QUESTION: CompanionState = {
  phase: 'question', title: 'Class', prompt: null, my_pulse: null,
  question: { key: 'q', kind: 'prediction', q: 'How many mistakes can you spot?', options: ['0', '1'], answer: null, revealed: false, my_choice: null },
};
const PROMPT: CompanionState = { phase: 'prompt', title: 'Class', question: null, my_pulse: null, prompt: { label: 'Hands-on 2: practice data', prompt: 'Make a table' } };

async function mount(c: LiveClient) {
  await act(async () => {
    root.render(<CheckinLiveController historyKey="h1" title="Class" meta="m" eyebrow="in" signedOut={{ body: 'x', action: 'y', onAction: () => undefined }} client={c} />);
  });
  await settle();
}

describe('your result follows you', () => {
  it('saves the answer from a prompt slide on this device', async () => {
    await mount(client(PROMPT, jest.fn().mockResolvedValue(TABLE)));
    await act(async () => { (host.querySelector('[data-testid="run-start"]') as HTMLElement).click(); });
    await settle();
    expect(host.querySelectorAll('.cbrun-md table')).toHaveLength(1);
    const saved = JSON.parse(localStorage.getItem('h1') || '{}');
    expect(saved['Make a table'].label).toBe('Hands-on 2: practice data');
  });

  it('shows that result, formatted, on the next vote slide', async () => {
    localStorage.setItem('h1', JSON.stringify({ 'Make a table': { label: 'Hands-on 2: practice data', at: 1, turns: [{ role: 'user', content: 'Make a table' }, { role: 'assistant', content: TABLE }] } }));
    await mount(client(QUESTION));
    const last = host.querySelector('[data-testid="last-result"]')!;
    expect(last.textContent).toContain('Your result from Hands-on 2: practice data');
    expect(last.querySelectorAll('table tbody tr')).toHaveLength(2);
  });

  it('shows nothing when they have not run anything yet', async () => {
    await mount(client(QUESTION));
    expect(host.querySelector('[data-testid="last-result"]')).toBeNull();
  });
});
