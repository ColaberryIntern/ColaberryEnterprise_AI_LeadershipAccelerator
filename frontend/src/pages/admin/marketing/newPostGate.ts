/**
 * newPostGate - whether a brand can start a post at all.
 *
 * WHY. Ali, 2026-10-08, on a brand with no accounts: "I should not have the ability to create new
 * post if I don't have an account connected to that brand." The Overview offered "+ New post"
 * twice while the tile beside it read "0 Channels that can publish".
 *
 * It is not merely untidy. `channelChoices` disables every network a brand has no CONNECTED
 * account for, so the post could be named, written and saved, and then meet a channel step where
 * nothing at all can be ticked. The work is lost at the point it was supposed to pay off.
 *
 * "POSTED BY HAND" IS NOT AN EXCEPTION. The Accounts panel says every network is posted by hand
 * until something is connected, which reads like a workflow this would block - it is not.
 * `connectedProviders()` counts only accounts that are live AND chosen, and handoff MODE means
 * the platform prepares copy for one of those because its network has no publishing API. With no
 * account at all there is nothing to prepare copy as, and no queue row to put it in.
 *
 * UNKNOWN IS NOT ZERO. When the overview has not loaded, or failed, the count is null and the
 * gate stays OPEN. Blocking the main action of the page because a request failed would turn an
 * outage into a product that refuses to work, and "0 channels" would be a claim nothing checked.
 */

export interface NewPostGate {
  allowed: boolean;
  /** Why not, as a sentence. Null when allowed. */
  reason: string | null;
}

export interface NewPostGateInput {
  /** False when the brand bar is on "All brands" - no one brand's channels to judge. */
  brandChosen: boolean;
  /** Channels this brand could publish through, or null when that is not known yet. */
  publishableChannels: number | null;
}

export function newPostGate({ brandChosen, publishableChannels }: NewPostGateInput): NewPostGate {
  // Not knowable yet, or not about one brand: let the operator through and let the composer ask.
  if (publishableChannels === null) return { allowed: true, reason: null };
  if (!brandChosen) return { allowed: true, reason: null };

  if (publishableChannels === 0) {
    return {
      allowed: false,
      reason: 'This brand has no connected channel, so a post written here would have nowhere to '
        + 'go. Connect one under Brands & channels first.',
    };
  }

  return { allowed: true, reason: null };
}
