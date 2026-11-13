/**
 * openTabForJoin — open a join link in a new tab in a way a phone will allow, and SAY SO when the
 * phone refuses.
 *
 * ## The report this came from
 *
 * Kalkidan Bezabeh, 2 Nov 2026: *"I can access the meeting room, but the join button is hidden and
 * unclickable."* Four layout explanations were measured at her phone's width against the real
 * stylesheets and all four were wrong: the Join button is 79px and tappable, the condensed header
 * is deliberately hidden below 820px, the title row fits, and the tap still carries user
 * activation. What survived is this: **a blocked tab is completely invisible to the application.**
 *
 * ## The two separate faults, because they need separate fixes
 *
 * **1. The tab is opened too late.** `window.open` is allowed when it happens in the same task as
 * the tap. Both join paths awaited a network round trip first and opened afterwards, which is the
 * shape a popup blocker exists to stop. `openSessionRecording` in `services/roomsApi.ts` already
 * gets this right and says why in its own header: *"The tab is opened synchronously, before any
 * await, so it is still inside the click gesture and does not trip the popup blocker."* The join
 * paths did not follow it. This is the third place needing the behaviour, which is the point at
 * which this repo's rules say to lift it rather than copy it a third time.
 *
 * **2. A blocked tab cannot be detected, which is the worse half.** The old calls passed
 * `'noopener'`, and `window.open` with `noopener` returns `null` BY SPECIFICATION — not because
 * anything failed. So `null` carried no information, nothing branched on it, and the application
 * carried on believing the call had opened. The person gets a dead button and no message, which is
 * exactly what was reported, whatever the root cause turns out to be on any given phone.
 *
 * Here the tab is opened WITHOUT `noopener` so the handle comes back, and `opener` is nulled on the
 * next line. That keeps the security property `noopener` was there for (the opened page cannot
 * reach back into this one through `window.opener`) while making the difference between "opened"
 * and "refused" observable.
 *
 * ## Why it returns an outcome instead of showing a message itself
 *
 * A util that calls `window.alert` cannot be tested and cannot be reused by a surface that wants
 * an inline banner instead. The caller decides what the person sees; this decides only what
 * happened.
 */

export type JoinOutcome =
  /** The tab is open and pointed at the link. */
  | { status: 'opened' }
  /** The browser refused the tab. The caller MUST tell the person; nothing else will. */
  | { status: 'blocked'; url: string }
  /** The request succeeded but there is no link yet, e.g. the host has not posted one. */
  | { status: 'no_url' }
  /** The request itself failed. `error` is the original, so the caller can match on it. */
  | { status: 'failed'; error: unknown };

/**
 * What to tell the person when a join request failed. The server's own explanation wins
 * when it sent one (a read-only "view as" session, not entitled, room gone); otherwise
 * a generic line. Found 2026-11-13: an admin in view-as mode saw "Could not join the
 * video room." for a 403 that said exactly why, and took it for a broken room mid-class.
 */
export function joinFailureMessage(error: unknown, fallback = 'Could not join the video room. Please try again.'): string {
  const apiMsg = (error as { response?: { data?: { error?: unknown } } } | null)?.response?.data?.error;
  return typeof apiMsg === 'string' && apiMsg.trim() ? apiMsg.trim() : fallback;
}

/**
 * Reserve a tab NOW, resolve the link, then point the tab at it.
 *
 * @param resolveUrl runs after the tab is reserved. Returns the join link, or null/'' when there
 *   is not one yet.
 */
export async function openTabForJoin(
  resolveUrl: () => Promise<string | null | undefined>,
): Promise<JoinOutcome> {
  // SYNCHRONOUS, before any await: this line is the whole reason the function exists.
  const tab = openBlankTab();

  let url: string | null | undefined;
  try {
    url = await resolveUrl();
  } catch (error) {
    tab?.close();
    return { status: 'failed', error };
  }

  const trimmed = (url || '').trim();
  if (!trimmed) {
    // Nothing to show, so do not leave an empty tab sitting there.
    tab?.close();
    return { status: 'no_url' };
  }

  if (!tab) return { status: 'blocked', url: trimmed };

  // `replace` rather than an assignment to `href`, so the blank page this tab started on does not
  // become a back-button stop for the person.
  try {
    tab.location.replace(trimmed);
  } catch {
    // Some browsers revoke the handle between opening and navigating. Treat that as blocked rather
    // than as success, because from the person's side it is the same thing.
    return { status: 'blocked', url: trimmed };
  }
  return { status: 'opened' };
}

/**
 * Open a blank tab and immediately drop its link back to this page.
 *
 * Separated so a test can drive the blocked branch, and because the `opener` null is the line that
 * must never be deleted: without it this is strictly less safe than the `noopener` it replaced.
 */
function openBlankTab(): Window | null {
  let tab: Window | null = null;
  try {
    tab = window.open('', '_blank');
  } catch {
    return null;
  }
  if (tab) {
    try {
      tab.opener = null;
    } catch {
      // Cross-origin or a hardened browser may refuse the write. The tab is still ours and still
      // about:blank at this point, so carry on rather than abandoning a tab the person can see.
    }
  }
  return tab;
}
