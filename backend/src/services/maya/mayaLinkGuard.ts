/**
 * Maya may only send links the portal can actually render.
 *
 * WHY THIS EXISTS. On 2026-11-08 a learner asked Maya "you provide tours?" and she answered
 * "Let me get that started for you. Here's the link to begin the tour:
 * [Start Campus Tour](/portal/campus/map)". She never called `start_campus_tour`. She wrote a
 * reply that IMITATES what the tool returns, and invented both the label and the path:
 * `/portal/campus/map` exists nowhere in the frontend.
 *
 * Three things then lined up, and the gap between them is what this module closes:
 *
 *   1. `withTourLink` (mayaReplyService) exists to repair exactly this, by appending the real
 *      link when she paraphrases it away. It is gated on `offered`, which is only true WHEN THE
 *      TOOL WAS CALLED. So the failure disarmed its own safety net.
 *   2. `DmMessageText` turns only two allowlisted paths into links, deliberately, so that no DM
 *      can render an arbitrary URL, script or markup. It correctly refused her invented path.
 *   3. The learner was therefore shown raw markdown, for a link that was dead anyway.
 *
 * Her prompt already tells her to call the tool and include its link "exactly as the tool
 * returns it", and already carries "Never claim an action you did not take or a result a tool
 * did not return". She broke that anyway, which is the point: an instruction is probabilistic,
 * and this is the deterministic backstop CLAUDE.md asks for in front of it.
 *
 * THE INVARIANT: a reply that leaves `guardLinks` contains no markdown link the renderer would
 * refuse. Either the link is one of the two the renderer knows, or the markdown is gone.
 *
 * The allowlist is the SAME two paths the renderer accepts, imported from the tool module
 * rather than restated here, so the two cannot drift apart.
 *
 * WHAT THIS DOES NOT DO: it does not make her call the tool. She will still sometimes answer
 * from her own words, and this will quietly repair the link. Making the tool call itself
 * reliable is a separate piece of work.
 */
import { BOOK_CALL_LINK, BOOK_CALL_PATH, TOUR_LINK, TOUR_PATH } from './mayaPortalTools';

/** `[label](target)`, with a label short enough to be a label and no newline inside it. */
const MD_LINK = /\[([^\]\n]{1,80})\]\(([^)\s]{1,300})\)/g;

export interface LinkGuardResult {
  reply: string;
  /** Every non-renderable target that was taken out, so the log can name them. */
  removed: string[];
  /** A fabricated link was repaired into the real tour link. */
  repairedTour: boolean;
  /** A fabricated link was repaired into the real booking link. */
  repairedBooking: boolean;
}

/**
 * Which real link, if any, a fabricated one was reaching for.
 *
 * Only paths that claim to be OUR product (they start with `/`) are ever repaired. An external
 * URL is stripped to its label instead: we have no standing to decide what somebody else's link
 * meant, and substituting a destination would be inventing one in the same way Maya just did.
 */
function repairFor(target: string, label: string): 'tour' | 'booking' | null {
  if (!target.startsWith('/')) return null;
  const hay = `${target} ${label}`.toLowerCase();
  if (hay.includes('tour')) return 'tour';
  if (hay.includes('book') || hay.includes('call')) return 'booking';
  return null;
}

export function guardLinks(reply: string): LinkGuardResult {
  const removed: string[] = [];
  let repairedTour = false;
  let repairedBooking = false;
  // Computed before the rewrite, so a real link already in the reply suppresses a repair rather
  // than being joined by a second button that does the same thing.
  let hasTour = reply.includes(TOUR_PATH);
  let hasBooking = reply.includes(BOOK_CALL_PATH);

  const guarded = reply.replace(MD_LINK, (whole: string, label: string, target: string): string => {
    if (target === TOUR_PATH || target === BOOK_CALL_PATH) return whole;

    removed.push(target);
    const repair = repairFor(target, label);

    if (repair === 'tour' && !hasTour) {
      hasTour = true;
      repairedTour = true;
      return TOUR_LINK;
    }
    if (repair === 'booking' && !hasBooking) {
      hasBooking = true;
      repairedBooking = true;
      return BOOK_CALL_LINK;
    }
    // Not repairable, or the real one is already present: keep the words, drop the markup, so
    // the learner reads a sentence instead of a broken link.
    return label;
  });

  return { reply: guarded, removed, repairedTour, repairedBooking };
}
