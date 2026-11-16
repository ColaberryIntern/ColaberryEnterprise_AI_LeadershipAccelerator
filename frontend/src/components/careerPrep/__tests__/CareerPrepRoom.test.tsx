import React from 'react';
import fs from 'fs';
import path from 'path';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { CareerPrepRoom } from '../CareerPrepRoom';
import { anchorText } from '../AnchorPill';
import { careerPrepFloorNum } from '../careerPrepFloorNum';

let host: HTMLDivElement;
let root: Root;
const tabs = { progress: <p>progress body</p>, plan: <p>plan body</p>, session: <p>session body</p> };

function mount(el: React.ReactElement): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(el); });
}
afterEach(() => { act(() => root.unmount()); host.remove(); });
const key = (target: EventTarget, k = 'Escape') => act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });

describe('CareerPrepRoom (CP3.1)', () => {
  it('closes on Esc, but not on Esc typed inside the ask box', () => {
    const onClose = jest.fn();
    mount(<CareerPrepRoom anchor={null} onChangeAnchor={jest.fn()} onClose={onClose} cora={<textarea aria-label="Ask Cora" />} tabs={tabs} />);
    key(host.querySelector('textarea')!);
    expect(onClose).not.toHaveBeenCalled();
    key(window);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the back button, labeled with the real floor number', () => {
    const onClose = jest.fn();
    mount(<CareerPrepRoom anchor={null} onChangeAnchor={jest.fn()} onClose={onClose} cora={null} tabs={tabs} />);
    const back = host.querySelector('[data-testid="cp-back"]') as HTMLButtonElement;
    expect(back.textContent).toBe(`‹ Floor ${careerPrepFloorNum()}`);
    act(() => back.click());
    expect(onClose).toHaveBeenCalled();
  });

  it('moves focus to Cora on open and back to the door that opened it on close', () => {
    const door = document.createElement('a');
    door.href = '#';
    document.body.appendChild(door);
    door.focus();
    mount(<CareerPrepRoom anchor={null} onChangeAnchor={jest.fn()} onClose={jest.fn()} cora={<p>hi</p>} tabs={tabs} />);
    expect(document.activeElement?.getAttribute('data-testid')).toBe('cp-cora-col');
    act(() => root.unmount());
    expect(document.activeElement).toBe(door);
    root = createRoot(host);
    door.remove();
  });

  it('opens on Your progress and switches tabs', () => {
    mount(<CareerPrepRoom anchor={null} onChangeAnchor={jest.fn()} onClose={jest.fn()} cora={null} tabs={tabs} />);
    expect(host.querySelector('[data-testid="cp-panel-progress"]')?.textContent).toBe('progress body');
    const plan = Array.from(host.querySelectorAll('[role="tab"]')).find((b) => b.textContent === 'Your plan') as HTMLButtonElement;
    act(() => plan.click());
    expect(host.querySelector('[data-testid="cp-panel-plan"]')?.textContent).toBe('plan body');
  });

  it('shows the anchor with its source tag, or says none is chosen', () => {
    mount(<CareerPrepRoom anchor={null} onChangeAnchor={jest.fn()} onClose={jest.fn()} cora={null} tabs={tabs} />);
    expect(host.querySelector('[data-testid="cp-anchor"]')?.textContent).toBe('No interview chosen yet');
    expect(anchorText({ id: 'i', source: 'added', company: 'Acme', role: 'R', type: 'technical', startsAt: '2026-11-19T20:00:00Z', target: 75 }))
      .toBe('Acme · Thursday at 2:00 PM · Added by you');
    expect(anchorText({ id: 'i', source: 'practice', company: 'Practice', role: 'R', type: 'behavioral', target: 70 })).toBe('Practice · Practice · made by Cora');
  });

  it('hides the trail under 900px and ships no prototype note', () => {
    const dir = path.join(__dirname, '..');
    const css = fs.readFileSync(path.join(dir, 'careerPrepRoom.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width:899px\)\{[^}]*\.cp-trail\{display:none\}/);
    const code = fs.readdirSync(dir).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    expect(code).not.toMatch(/illustrative/i);
  });

  it('derives the floor number from the sidebar order', () => {
    expect(careerPrepFloorNum([{ section: 'a' }, { section: 'placement' }, { section: 'b' }])).toBe('3');
    expect(careerPrepFloorNum([{ section: 'a' }])).toBeNull();
  });
});
