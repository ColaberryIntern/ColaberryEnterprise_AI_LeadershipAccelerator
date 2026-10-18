/**
 * Is something on this page listening for `te-open-dm` (Colaberry Campus C5)?
 *
 * PortalShell is the single DM entry point: it listens for the `te-open-dm` window event and opens a chat dock. Pages
 * that do not render PortalShell (the legacy PortalLayout pages, Showcase) have no listener, so dispatching the event
 * there would silently do nothing. useShellDms registers while its listener is attached; campus buttons ask
 * hasDmHost() and, without one, offer "Message from Today" instead of a dead button.
 *
 * A counter, not a boolean, so two shells mounted during a route transition cannot unregister each other.
 */
let hosts = 0;

export function registerDmHost(): () => void {
  hosts += 1;
  let done = false;
  return () => { if (!done) { done = true; hosts = Math.max(0, hosts - 1); } };
}

export function hasDmHost(): boolean {
  return hosts > 0;
}

/** The single DM entry point, as a function (PortalShell's listener does the rest). */
export function openDmThroughShell(enrollmentId: string, name: string): void {
  window.dispatchEvent(new CustomEvent('te-open-dm', { detail: { enrollmentId, name } }));
}
