/**
 * The order My work was showing, kept for Previous / Next on the work page (design: "walk the list in the
 * order My work was showing it"). sessionStorage, per tab, a convenience only: when it is missing, blocked
 * or stale the work page falls back to the newest-first list, so nothing depends on it.
 */
const KEY = 'myWork.order.v1';

export function saveOrder(ids: string[]): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* storage blocked: the fallback order applies */ }
}

export function loadOrder(): string[] | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null;
  } catch {
    return null;
  }
}
