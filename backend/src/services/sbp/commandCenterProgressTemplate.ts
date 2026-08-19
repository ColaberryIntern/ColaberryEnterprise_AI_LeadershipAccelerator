/**
 * The `.colaberry/progress.json` template a student is handed in STORY-000's
 * prompt — the starting state, not a finished build.
 *
 * A LEAF, in its own file rather than inline in `commandCenterStory.ts`.
 * That module is 1,100+ lines against CLAUDE.md's 500-line hard ceiling and is
 * grandfathered only until the next change touches it, at which point the rule
 * requires a split before new code goes in. This is that split, taken one piece
 * at a time — the same move `commandCenterTaskColumns.ts` made.
 *
 * Takes the story id and criteria as ARGUMENTS rather than importing them, so
 * the dependency runs one way only and there is no cycle back into
 * `commandCenterStory`.
 *
 * PURE and deterministic: same inputs, byte-identical output.
 */

/**
 * What a tick MEANS, stated inside the file itself.
 *
 * ── WHY THE FILE HAS TO SAY THIS ────────────────────────────────────────────
 *
 * The platform shipped two contradictory templates. The prompt's example seeded
 * `"passed": true` on every line; the remedial template emailed on 2026-08-18
 * seeded every line `false`. Both were wrong, in opposite directions, and the
 * second is the more interesting failure: a bare `false` does not distinguish
 * "I checked this and it is not done" from "nobody has looked at this yet". A
 * student read it the second way and set about earning criteria his repo
 * already satisfied.
 *
 * So agreeing on `false` is only half the fix. `false` has to be given a meaning
 * where the reader will actually see it — in the file, not in an email and not
 * three screens up the prompt. On a repo the platform cannot push to, this block
 * is the ONLY copy of the contract that ever reaches the student: no managed
 * block in their CLAUDE.md, no seeded progress file, nothing.
 *
 * A `_`-PREFIXED KEY IS SAFE. `progressFileSchema` is a plain (non-strict) Zod
 * object, so an unknown top-level key is ignored rather than rejected, and
 * `commandCenterStory.progressTemplate.test.ts` pushes this whole block back
 * through `parseProgressFile` to prove it. It never round-trips into a repo
 * either: `renderProgressFile` builds the seeded file from the schema, so this
 * note lives only in the copy a human reads.
 */
export const PROGRESS_TEMPLATE_HOW_TO_USE =
  'Start with every criterion false — that is the correct starting state, not an unfinished one. '
  + 'false means "not claimed": either not done, or done but not yet checked. Set one to true only '
  + 'after you have read the code and confirmed it is genuinely true today. Nothing is lost by '
  + 'leaving a line false; a story sitting at 3 of 5 reports honestly and the portal shows you '
  + 'which two are left. Do not retype the criterion text — flip the boolean beside it.';

/**
 * The exact `.colaberry/progress.json` a student should START from.
 *
 * ── IT SHIPS ALL-FALSE, AND THAT IS THE POINT ───────────────────────────────
 *
 * This block used to seed `passed: true` on every criterion, with a caption
 * underneath explaining that it depicted a finished build. Students copy the
 * block, not the caption. Across all 15 verified stories in the system there was
 * not one partial tick — every criterion everywhere was `true` — and a
 * pre-ticked template handed out by the platform is the strongest nudge in the
 * whole pipeline. It now matches the file `renderProgressFile` actually seeds,
 * so the two templates that reach a student cannot disagree.
 *
 * ── schema_version IS NOT DECORATION ────────────────────────────────────────
 *
 * `progressFileSchema` REQUIRES it, as a number. This example once omitted it,
 * which made the block a file the platform's own reader refuses:
 * `schema_version: Invalid input: expected number, received undefined` — the
 * whole file rejected at the schema gate before a single criterion was compared.
 * Confirmed live in production on 2026-08-17. Passed in from the constant rather
 * than written as a literal, so a schema bump carries here on its own.
 *
 * The criterion text is rendered via `JSON.stringify` from the caller's array,
 * never hand-written, so it stays byte-identical to what the matcher normalises
 * against. A drifted example is worse than none: the student follows it exactly
 * and their claims still land in `rejected_claims`.
 */
export function progressFileTemplate(
  schemaVersion: number,
  storyId: string,
  criteria: readonly string[],
): string {
  return JSON.stringify(
    {
      schema_version: schemaVersion,
      _how_to_use: PROGRESS_TEMPLATE_HOW_TO_USE,
      stories: [
        {
          id: storyId,
          criteria: criteria.map((text) => ({ text, passed: false })),
        },
      ],
    },
    null,
    2,
  );
}
