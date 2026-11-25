/**
 * What a pending request RELEASES: the capability ladder behind it, step by step.
 *
 * ## Why an approver needs this
 *
 * A request's title says what is being asked for. It does not say what is stuck behind it, and
 * that is the fact that decides whether something waits another day. Measured on 25 Nov 2026:
 * `af260168` reads as one tool grant, and granting it releases step 3 AND step 4, because step 4
 * cannot start until the tool exists. Two stories, one click, and nothing on the approval screen
 * said so.
 *
 * It also distinguishes "waiting on you" from "waiting on something else". `L0-CHOOSE` on that
 * same capability is not credited either, but no decision of Ali's frees it: it is blocked on the
 * candidate list having no screen. An approver who cannot tell those apart either approves things
 * that change nothing or assumes every gap is theirs to close.
 *
 * ## The id mapping is checked, not assumed
 *
 * A tool request detail carries `capability_id` as `<domain>.<capability>`, while the board's
 * stories are `<domain>.CAP.<capability>[.<STEP>]`. The `.CAP.` segment is the join, and it was
 * verified against production rather than inferred from one example: 518 of the agent-domain
 * stories carry it, and all four capability ids on live tool requests resolve through it.
 *
 * ## A missing ladder is reported as missing
 *
 * `executive.weekly_performance_report_email` resolves to exactly ONE story: the capability row,
 * with no rungs under it. That capability has no ladder, and the honest render is nothing at all.
 * Drawing seven empty steps would tell an approver that seven things are waiting when none are.
 * `buildLadder` returns `null` below `MIN_RUNGS`, and the caller shows nothing.
 */

/** The rungs, in the order a builder climbs them. Suffix is the story id's last segment. */
export const LADDER_STEPS: ReadonlyArray<{ suffix: string; step: string; label: string }> = Object.freeze([
  { suffix: 'L0-CHOOSE', step: '0.1', label: 'Pick one from the list' },
  { suffix: 'L0-SCOPE-SHEET', step: '0.2', label: 'Write the scope sheet' },
  { suffix: 'L0-ASK-FOR-A-SCREEN', step: '0.3', label: 'Ask for a screen' },
  { suffix: 'L1-BY-HAND', step: '1', label: 'Do it by hand' },
  { suffix: 'L2-IN-THE-APP', step: '2', label: 'Do it in the app' },
  { suffix: 'L3-TOOL-REQUEST', step: '3', label: 'Request the tool' },
  { suffix: 'L4-AGENT-WATCHED', step: '4', label: 'Agent does it, watched' },
]);

/**
 * Below this, there is no ladder to speak of and the caller renders nothing. Two rather than one
 * because a single rung is a capability somebody started to describe, not a climb with a position
 * on it, and an approver reading "1 of 1 credited" learns nothing they did not have from the title.
 */
export const MIN_RUNGS = 2;

/** Which rungs a grant of this request would free. A tool grant frees step 3, and step 4 behind it. */
const RELEASED_BY_TOOL_GRANT: ReadonlySet<string> = new Set(['3', '4']);

export type LadderState = 'credited' | 'waiting_on_you' | 'blocked_elsewhere' | 'not_started';

export interface LadderRung {
  step: string;
  label: string;
  story_id: string;
  state: LadderState;
  /** True when deciding THIS request is what frees the rung. Drives "Releases:" on the row. */
  released_by_this: boolean;
}

export interface StoryRow {
  story_id: string;
  verified_at: string | Date | null;
}

/**
 * `<domain>.<capability>` to the story id prefix `<domain>.CAP.<capability>`.
 *
 * Only the FIRST dot is replaced. A capability whose own name contains a dot would otherwise have
 * its name mangled instead of its domain qualified, which is the kind of bug that produces an
 * empty ladder and no error.
 */
export function storyPrefixForCapability(capabilityId: string): string | null {
  const id = String(capabilityId || '').trim();
  const dot = id.indexOf('.');
  if (dot <= 0 || dot === id.length - 1) return null;
  return `${id.slice(0, dot)}.CAP.${id.slice(dot + 1)}`;
}

/** The rung a story id names, or null when it is the capability row itself or an unknown suffix. */
export function rungOf(storyId: string, prefix: string): typeof LADDER_STEPS[number] | null {
  if (!storyId.startsWith(`${prefix}.`)) return null;
  const suffix = storyId.slice(prefix.length + 1);
  return LADDER_STEPS.find((s) => s.suffix === suffix) ?? null;
}

/**
 * PURE. Turn the capability's stories into an ordered ladder.
 *
 * `kind` decides which uncredited rungs count as waiting on the APPROVER rather than on something
 * else. A tool grant releases steps 3 and 4; a change request releases nothing on the ladder by
 * itself, because access and new capabilities are not rungs. Everything uncredited that this
 * request does not free is reported as `blocked_elsewhere`, which is a true statement about the
 * approver's power over it rather than a guess about what is blocking it.
 */
export function buildLadder(
  capabilityId: string,
  stories: ReadonlyArray<StoryRow>,
  kind: 'tool' | 'change',
): LadderRung[] | null {
  const prefix = storyPrefixForCapability(capabilityId);
  if (!prefix) return null;

  const byStep = new Map<string, StoryRow>();
  for (const s of stories) {
    const rung = rungOf(String(s.story_id || ''), prefix);
    if (rung) byStep.set(rung.step, s);
  }
  if (byStep.size < MIN_RUNGS) return null;

  return LADDER_STEPS.filter((s) => byStep.has(s.step)).map((s) => {
    const row = byStep.get(s.step) as StoryRow;
    const credited = Boolean(row.verified_at);
    const releases = kind === 'tool' && RELEASED_BY_TOOL_GRANT.has(s.step);
    let state: LadderState = 'credited';
    if (!credited) state = releases ? 'waiting_on_you' : 'blocked_elsewhere';
    return {
      step: s.step,
      label: s.label,
      story_id: String(row.story_id),
      state,
      released_by_this: releases && !credited,
    };
  });
}

/**
 * One plain sentence for the top of an expanded row, written from the ladder rather than from the
 * request's own words. "Releases steps 3 and 4" is a fact about the board; the requester's
 * description is an argument, and an approver should be able to tell those apart at a glance.
 */
export function releasesSentence(rungs: ReadonlyArray<LadderRung> | null): string | null {
  if (!rungs) return null;
  const freed = rungs.filter((r) => r.released_by_this);
  if (!freed.length) return null;
  const steps = freed.map((r) => `step ${r.step}`);
  const list = steps.length === 1 ? steps[0] : `${steps.slice(0, -1).join(', ')} and ${steps[steps.length - 1]}`;
  const tail = freed.length > 1
    ? ', and the later step cannot start until the earlier one is granted'
    : '';
  return `Releases ${list}${tail}.`;
}
