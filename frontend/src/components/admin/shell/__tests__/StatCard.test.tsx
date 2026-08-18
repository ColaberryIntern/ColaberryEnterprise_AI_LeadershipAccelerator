import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import StatCard from '../StatCard';

/**
 * Ticket Board UX fixes (2026-08-17) — StatCard gained an additive
 * onClick/active pair so the ticket board's 4 KPI cards can drive in-page
 * filter state. No @testing-library/react in this repo (confirmed) — same
 * react-dom/client + act convention as AdminTicketBoardPage.smoke.test.tsx.
 */

let container: HTMLDivElement;
let root: Root;

async function render(node: React.ReactElement) {
  await act(async () => {
    root.render(<MemoryRouter>{node}</MemoryRouter>);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('StatCard — existing behavior unchanged', () => {
  it('with no onClick/to, renders the bare div markup (no button, no link)', async () => {
    await render(<StatCard label="Total" value={42} />);

    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('.admin-stat-card')).not.toBeNull();
    expect(container.textContent).toContain('42');
  });

  it('with `to`, still renders a <Link> (unchanged from before this task) even if onClick is also passed', async () => {
    const onClick = jest.fn();
    await render(<StatCard label="Agents" value={6} to="/admin/agents" onClick={onClick} />);

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/admin/agents');
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('StatCard — new onClick/active mode (Ticket Board UX fixes)', () => {
  it('with onClick, renders a real <button> and fires the handler on click', async () => {
    const onClick = jest.fn();
    await render(<StatCard label="Critical" value={3} onClick={onClick} />);

    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('type')).toBe('button');

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('active=true adds the admin-stat-card--active class and aria-pressed=true', async () => {
    await render(<StatCard label="Done" value={12} onClick={jest.fn()} active />);

    const card = container.querySelector('.admin-stat-card');
    expect(card?.classList.contains('admin-stat-card--active')).toBe(true);
    expect(container.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('active=false (default) never adds the active class', async () => {
    await render(<StatCard label="Open" value={5} onClick={jest.fn()} />);

    const card = container.querySelector('.admin-stat-card');
    expect(card?.classList.contains('admin-stat-card--active')).toBe(false);
  });
});
