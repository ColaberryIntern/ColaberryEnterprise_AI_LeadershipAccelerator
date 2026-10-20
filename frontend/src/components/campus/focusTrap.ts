import type React from 'react';

/**
 * Keep Tab inside a modal campus layer (C11, WCAG 2.4.3). The map and list layers are aria-modal dialogs over the
 * page; without this, Tab walked out of them into the page underneath, which a screen reader had been told was inert.
 * A keydown handler rather than `inert` on the app root: the layers render beside the router, and inerting the root
 * would also inert the DM dock and toast that must stay reachable.
 *
 * Wraps from the last tabbable element to the first (and Shift+Tab the other way), and pulls focus back in when it is
 * on the dialog itself. Tab order is DOM order here: nothing in the campus uses a positive tabIndex.
 */
const TABBABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function tabbablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE))
    .filter((el) => !el.closest('[aria-hidden="true"]') && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true');
}

export function trapTab(e: React.KeyboardEvent<HTMLElement>): void {
  if (e.key !== 'Tab') return;
  const root = e.currentTarget;
  const items = tabbablesIn(root);
  if (!items.length) { e.preventDefault(); root.focus(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus(); return; }
  if (!e.shiftKey && (active === last || active === root || !root.contains(active))) { e.preventDefault(); first.focus(); }
}
