import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

/**
 * domHarness — mount, drive and read an admin page in jsdom.
 *
 * This repo's frontend has NO `@testing-library` dependency, so the admin suites
 * drive React directly through `react-dom/client` and `act`, exactly as
 * `AdminBusinessAccounts.test.tsx` does. This file is that harness, extracted so
 * the Case Study suites stay about the Case Study rules.
 *
 * WHY IT LIVES IN `__fixtures__` AND NOT `__tests__`. CRA's jest `testMatch`
 * claims EVERY file under a `__tests__` directory as a suite and fails any that
 * contains no test ("Your test suite must contain at least one test" — see
 * `src/pages/portal/today/__tests__/testEnv/intersectionObserverMock.ts`, which
 * fails for that reason today). `__fixtures__` matches neither testMatch
 * pattern, so a shared helper can live here without becoming a broken suite.
 *
 * SETTING A CONTROLLED INPUT. React installs its own `value` setter on the input
 * prototypes and tracks the last value it wrote; assigning `input.value` and
 * firing an event is therefore ignored as a no-op change. The native setter has
 * to be called explicitly, which is what `setValue` does.
 */

/**
 * React 18 warns "the current testing environment is not configured to support
 * act(...)" on every state update unless this flag is set, and there is no
 * `setupTests.ts` in this app to set it globally. Without it a passing suite
 * still prints a hundred console.error lines, which is how a real warning gets
 * missed. Set here, once, for any suite that imports the harness.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** Confirm dialogs are answered YES by default; a test may override. */
export function stubConfirm(answer = true): void {
  window.confirm = () => answer;
}

export function mount(ui: React.ReactElement, path: string): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
  });
}

export function unmount(): void {
  if (root) act(() => root!.unmount());
  if (container && container.parentNode) document.body.removeChild(container);
  root = null;
  container = null;
}

/**
 * Flush the mounted tree's pending promises. Six turns rather than two: the
 * Case Study pages chain a fetch, a `Promise.allSettled` over per-record reads,
 * and a reload after every write, so a two-turn flush settles the first of those
 * and silently leaves the rest pending.
 */
export async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
  });
}

export const text = (): string => container?.textContent ?? '';

/**
 * EVERY element carrying an id, not the first.
 *
 * `query` resolves `.first()`, which makes a DUPLICATE `data-testid` invisible to
 * a suite: two elements answering to one id look exactly like one element that
 * works. `cs-analyze-repo` was claimed by both the Repository input and the
 * Analyze button for that reason, and no test could see it.
 */
export const queryAll = (testId: string): HTMLElement[] =>
  Array.from(container?.querySelectorAll(`[data-testid="${testId}"]`) ?? []) as HTMLElement[];

export const query = (testId: string): HTMLElement | null =>
  (container?.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null) ?? null;

/** The element, or a failure naming the id that is missing. */
export function el(testId: string): HTMLElement {
  const found = query(testId);
  if (!found) throw new Error(`No control with data-testid="${testId}" is rendered.`);
  return found;
}

export function click(testId: string): void {
  const node = el(testId);
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** Toggle a checkbox through a real click, so React's onChange runs. */
export function toggle(testId: string): void {
  const node = el(testId) as HTMLInputElement;
  act(() => { node.click(); });
}

function nativeSetter(node: HTMLElement): ((value: string) => void) | null {
  const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : node instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  const setter = descriptor?.set;
  return setter ? (value: string) => setter.call(node, value) : null;
}

export function setValue(testId: string, value: string): void {
  const node = el(testId);
  const setter = nativeSetter(node);
  act(() => {
    if (setter) setter(value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
