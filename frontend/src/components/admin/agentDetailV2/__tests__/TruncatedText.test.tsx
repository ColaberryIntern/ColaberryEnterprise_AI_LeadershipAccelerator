import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import TruncatedText from '../TruncatedText';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('TruncatedText', () => {
  it('renders short text in full, with no toggle shown', async () => {
    await act(async () => { root.render(<TruncatedText text="A short sentence." />); });
    expect(container.textContent).toBe('A short sentence.');
    expect(container.querySelector('.adv2-truncate-toggle')).toBeNull();
  });

  it('truncates long text to the threshold and shows a working expand/collapse toggle', async () => {
    const long = 'x'.repeat(200);
    await act(async () => { root.render(<TruncatedText text={long} />); });

    expect(container.textContent).toContain('x'.repeat(140) + '…');
    expect(container.textContent).not.toContain('x'.repeat(141));
    const toggle = container.querySelector('.adv2-truncate-toggle') as HTMLElement;
    expect(toggle.textContent).toBe('Show more');

    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain(long);
    const collapseToggle = container.querySelector('.adv2-truncate-toggle') as HTMLElement;
    expect(collapseToggle.textContent).toBe('Show less');

    await act(async () => { collapseToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).not.toContain(long);
  });

  it('respects a custom threshold', async () => {
    const text = 'y'.repeat(50);
    await act(async () => { root.render(<TruncatedText text={text} threshold={20} />); });
    expect(container.textContent).toContain('y'.repeat(20) + '…');
  });

  it('respects custom expand/collapse labels', async () => {
    const long = 'z'.repeat(200);
    await act(async () => { root.render(<TruncatedText text={long} expandLabel="Read more" collapseLabel="Collapse" />); });
    const toggle = container.querySelector('.adv2-truncate-toggle') as HTMLElement;
    expect(toggle.textContent).toBe('Read more');
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect((container.querySelector('.adv2-truncate-toggle') as HTMLElement).textContent).toBe('Collapse');
  });
});
