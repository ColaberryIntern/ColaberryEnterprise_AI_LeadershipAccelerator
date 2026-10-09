import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import SectionCard from '../SectionCard';

/**
 * SectionCard collapsible mode (2026-10-02) — long admin pages (the gov
 * Qualification workspace) grew too scroll-heavy, so SectionCard gained an
 * additive `collapsible`/`defaultOpen` pair: the header becomes a toggle and the
 * body is hidden via inline display:none (kept in the DOM so field state and
 * text content survive a collapse). Same react-dom/client + act convention as
 * StatCard.test.tsx — no @testing-library in this repo.
 */

let container: HTMLDivElement;
let root: Root;

async function render(node: React.ReactElement) {
  await act(async () => {
    root.render(node);
  });
}

function body() {
  return container.querySelector('.admin-section-card__body') as HTMLElement | null;
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

describe('SectionCard — existing (non-collapsible) behavior unchanged', () => {
  it('renders no toggle button and a fully visible body by default', async () => {
    await render(<SectionCard title="Source facts"><p>inner content</p></SectionCard>);

    expect(container.querySelector('.admin-section-card__toggle')).toBeNull();
    expect(container.textContent).toContain('inner content');
    expect(body()?.style.display).toBe(''); // no inline display:none
  });
});

describe('SectionCard — collapsible mode', () => {
  it('defaultOpen={false} hides the body (display:none) but keeps it in the DOM, and the title stays visible', async () => {
    await render(
      <SectionCard title="Discovery details" collapsible defaultOpen={false}>
        <p>collapsed content</p>
      </SectionCard>,
    );

    // Title is always visible so the reader knows what to click.
    expect(container.textContent).toContain('Discovery details');
    // Content is present in the DOM (textContent) but visually hidden.
    expect(container.textContent).toContain('collapsed content');
    expect(body()?.style.display).toBe('none');

    const toggle = container.querySelector('.admin-section-card__toggle');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking the toggle expands the body (clears display:none) and flips aria-expanded', async () => {
    await render(
      <SectionCard title="Discovery details" collapsible defaultOpen={false}>
        <p>collapsed content</p>
      </SectionCard>,
    );

    const toggle = container.querySelector('.admin-section-card__toggle') as HTMLButtonElement;
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(body()?.style.display).toBe('');
    expect(container.querySelector('.admin-section-card__toggle')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('defaultOpen (true) shows the body, and clicking collapses it', async () => {
    await render(
      <SectionCard title="Qualification actions" collapsible defaultOpen>
        <p>open content</p>
      </SectionCard>,
    );

    expect(body()?.style.display).toBe('');

    const toggle = container.querySelector('.admin-section-card__toggle') as HTMLButtonElement;
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(body()?.style.display).toBe('none');
  });

  it('collapsible with no title renders no toggle and leaves the body visible', async () => {
    await render(<SectionCard collapsible defaultOpen={false}><p>no-title content</p></SectionCard>);

    expect(container.querySelector('.admin-section-card__toggle')).toBeNull();
    expect(body()?.style.display).toBe('');
    expect(container.textContent).toContain('no-title content');
  });
});
