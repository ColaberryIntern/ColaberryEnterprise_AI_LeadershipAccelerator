import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { CoraChat, liveCardsId, SUGGESTIONS, type ChatItem } from '../CoraChat';
import type { OptionCard } from '../OptionCards';

const card = (id: string): OptionCard => ({ id, icon: 'flag-line', title: `Title ${id}`, line: `Line ${id}` });
const log = (): ChatItem[] => [
  { id: 'c1', kind: 'cora', text: 'What are you preparing for?' },
  { id: 's1', kind: 'cards', label: 'Your interviews', cards: [card('a'), card('b')] },
  { id: 'c2', kind: 'cora', text: 'Or pick a plan.' },
  { id: 's2', kind: 'cards', label: 'Plans', cards: [card('p1'), card('p2'), card('p3')] },
];

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function mount(el: React.ReactElement): void {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const r = createRoot(h);
  host = h;
  root = r;
  act(() => { r.render(el); });
}
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; });
const btn = (id: string) => (host as HTMLDivElement).querySelector(`[data-testid="cp-card-${id}"]`) as HTMLButtonElement;

describe('liveCardsId', () => {
  it('is the newest card set, and none once it is answered', () => {
    expect(liveCardsId(log())).toBe('s2');
    const l = log();
    (l[3] as Extract<ChatItem, { kind: 'cards' }>).answered = true;
    expect(liveCardsId(l)).toBeNull();
  });
});

describe('CoraChat (CP3.2)', () => {
  it('only the newest unanswered set is clickable; older sets are quiet', () => {
    const onPick = jest.fn();
    mount(<CoraChat log={log()} onPick={onPick} onAsk={jest.fn()} />);
    act(() => btn('a').click());
    expect(onPick).not.toHaveBeenCalled();
    expect(btn('a').getAttribute('aria-disabled')).toBe('true');
    act(() => btn('p2').click());
    expect(onPick).toHaveBeenCalledWith('s2', expect.objectContaining({ id: 'p2' }));
  });

  it('nothing is clickable while Cora is answering', () => {
    const onPick = jest.fn();
    mount(<CoraChat log={log()} busy onPick={onPick} onAsk={jest.fn()} />);
    act(() => btn('p1').click());
    expect(onPick).not.toHaveBeenCalled();
    expect((host as HTMLDivElement).textContent).toContain('Cora is thinking...');
  });

  it('moves between cards with the arrow keys, wrapping around', () => {
    mount(<CoraChat log={log()} onPick={jest.fn()} onAsk={jest.fn()} />);
    btn('p1').focus();
    act(() => { btn('p1').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(document.activeElement).toBe(btn('p2'));
    act(() => { btn('p2').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); });
    act(() => { btn('p1').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); });
    expect(document.activeElement).toBe(btn('p3'));
    expect((host as HTMLDivElement).querySelector('[data-testid="cp-cards"]')?.getAttribute('role')).toBe('list');
  });

  it('shows a picked answer as the student\'s own bubble (the caller adds it to the log)', () => {
    const l: ChatItem[] = [...log().slice(0, 2), { id: 'm1', kind: 'me', text: 'Title a' }];
    (l[1] as Extract<ChatItem, { kind: 'cards' }>).answered = true;
    mount(<CoraChat log={l} onPick={jest.fn()} onAsk={jest.fn()} />);
    expect((host as HTMLDivElement).querySelector('.cp-msg.me')?.textContent).toBe('Title a');
  });

  it('sends a suggestion chip and the ask box, and never an empty message', () => {
    const onAsk = jest.fn();
    mount(<CoraChat log={log()} onPick={jest.fn()} onAsk={onAsk} />);
    const chip = Array.from((host as HTMLDivElement).querySelectorAll('.cp-chip')).find((b) => b.textContent === SUGGESTIONS[2]) as HTMLButtonElement;
    act(() => chip.click());
    expect(onAsk).toHaveBeenCalledWith('I have 10 minutes');
    const send = (host as HTMLDivElement).querySelector('.cp-send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect((host as HTMLDivElement).querySelectorAll('.cp-chip')).toHaveLength(4);
  });

  it('focuses Cora\'s latest message', () => {
    mount(<CoraChat log={log()} onPick={jest.fn()} onAsk={jest.fn()} />);
    expect(document.activeElement?.textContent).toBe('Or pick a plan.');
  });
});
