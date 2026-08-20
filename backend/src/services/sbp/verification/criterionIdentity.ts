/**
 * Criterion identity — deciding when two sentences are the SAME acceptance
 * criterion.
 *
 * Split out of `progressContract.ts`, which had reached 547 lines against
 * CLAUDE.md's 500-line hard ceiling. Two things live here, and they answer the
 * same question from opposite ends:
 *
 *   1. `normaliseCriterion` — forgiving about how a sentence was TYPED.
 *   2. `SUPERSEDED_CRITERIA` / `resolveCriterionKey` — forgiving about a
 *      sentence WE ourselves rewrote, and only that sentence.
 *
 * A LEAF. It imports nothing from this package, so `progressContract` and
 * `verifyDecision` can both depend on it without a cycle. PURE: no I/O, no
 * clock, no randomness.
 */

// ── how a sentence was typed ────────────────────────────────────────────────

/**
 * Dash-like codepoints, unified to ASCII `-`. Em, en, figure, horizontal bar,
 * non-breaking hyphen, the true hyphen, the minus SIGN (which is not the same
 * character as the hyphen a keyboard produces), and the small/fullwidth forms
 * an IME emits. `--` and `---` are runs of the ASCII form and collapse too.
 */
const DASH_RUN = /\s*[-‐‑‒–—―−﹘﹣－]+\s*/g;

/**
 * Apostrophe-like codepoints, unified to ASCII `'`. This is the set an editor
 * or keyboard substitutes FOR the straight apostrophe: Word's curly pair, the
 * prime, the modifier letter, and the acute-accent dead key people hit by
 * mistake. The BACKTICK is deliberately absent — see the note below.
 */
const APOSTROPHE = /[‘’‛′ʼ´]/g;

/** Double-quote-like codepoints, unified to ASCII `"`. Same rule as above. */
const DOUBLE_QUOTE = /[“”„‟″]/g;

/**
 * Characters with no glyph at all: BOM, zero-width space, soft hyphen, word
 * joiner, and the bidi marks. They ride along on copy-paste out of a browser
 * or a PDF and are invisible in every diff, which is exactly what makes them
 * worth removing — nobody can SEE why the match failed.
 *
 * ZWNJ/ZWJ (U+200C/U+200D) are NOT here: inside an emoji sequence the joiner
 * is load-bearing, and stripping it would fuse distinct sequences.
 */
const INVISIBLE = /[­​‎‏⁠﻿]/g;

/**
 * Criterion identity — forgiving about how a sentence was TYPED, never about
 * what it SAYS.
 *
 * WHY THIS EXISTS AT ALL. STORY-000's trust acceptance line is `Trust — no tab
 * shows a number...` with a real U+2014 em dash, and STORY-000 is the story
 * every student in the cohort builds. Before this, a student whose editor,
 * agent or copy-paste turned that dash into `-`, `--` or an en dash had their
 * claim land in `rejected_claims`: story stuck at `submitted`, no points, and
 * the message "does not match any acceptance criterion" — accurate and
 * useless. Confirmed live in production on 2026-08-15.
 *
 * THE LINE THIS HOLDS. Every step below is a transformation an EDITOR or a
 * KEYBOARD performs on text that means the same thing. None of them changes
 * meaning, and none can fuse two criteria a plan genuinely distinguishes:
 *
 *   - NFC only, never NFKC. NFC is canonical equivalence — `é` typed as one
 *     codepoint and `é` typed as `e` + combining acute ARE the same character
 *     by Unicode's own definition. NFKC is COMPATIBILITY equivalence and would
 *     fold `x²` onto `x2`, `½` onto `1/2`, `Ⅻ` onto `XII`. Those are different
 *     claims about a system, so NFKC is refused.
 *   - Dashes are UNIFIED, never deleted. `read-only` normalises to
 *     `read-only`, not to `readonly` and not to `read only` — so it stays
 *     distinct from the criterion that says `read only`.
 *   - Quotes are UNIFIED, never deleted. `the label is "sample"` stays
 *     distinct from `the label is sample`.
 *   - ONE trailing period is dropped, because a list rendered with terminal
 *     punctuation and one without are the same sentence. `?` and `!` are NOT
 *     dropped: "the API returns 200" and "the API returns 200?" are a claim
 *     and a question, and the difference is the point. A run of periods is
 *     left alone so an ellipsis survives.
 *
 * DELIBERATELY NOT NORMALISED, each because it would forgive CONTENT:
 *   - Backticks. No keyboard or editor substitutes `` ` `` for `'`; a markdown
 *     code span is an authoring choice, not a typo.
 *   - Guillemets « ». A different quoting convention, not a keyboard variant.
 *   - Commas, colons, semicolons, slashes, parentheses. Each separates clauses
 *     whose arrangement carries meaning (`10:00` vs `1000`).
 *   - Stop words, plurals, stemming, or any similarity score. A REWORDED
 *     criterion must keep failing — that is the whole gating model, and the
 *     ONE exception is the explicit, hand-audited table below.
 *   - A leading `- ` list bullet. Out of scope, and refusing it is the safe
 *     direction: it can only withhold a match, never invent one.
 *
 * Callers MUST run both sides of any comparison through this function.
 * Normalising only the claim would leave the mirror-image bug in place.
 * Idempotent: normalise(normalise(x)) === normalise(x).
 */
export function normaliseCriterion(text: string): string {
  return text
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(APOSTROPHE, "'")
    .replace(DOUBLE_QUOTE, '"')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')       // NBSP and friends are already \s in JS
    .replace(DASH_RUN, '-')     // after the space collapse, so ` — ` folds too
    .trim()
    .toLowerCase()
    .replace(/(?<!\.)\.$/, '')  // one terminal period, never an ellipsis
    .trim();
}

// ── a sentence WE rewrote ───────────────────────────────────────────────────

/**
 * One criterion whose wording the platform changed, and the wording it became.
 *
 * `was` must be the sentence EXACTLY as it shipped, because that is the string
 * sitting in students' committed files. `now` must be a sentence that is really
 * in the current acceptance set — enforced by test, since an entry pointing at
 * nothing is a silent no-op.
 */
export interface SupersededWording {
  /** The wording as it shipped, byte-for-byte. Never edit an existing entry. */
  was: string;
  /** The criterion it is now. Must appear verbatim in the current acceptance set. */
  now: string;
  /** ISO date the rewording shipped. */
  superseded_on: string;
  /** Why it was reworded. Read by whoever has to decide whether to add the next one. */
  why: string;
}

/**
 * ── THE SUPERSESSION TABLE ──────────────────────────────────────────────────
 *
 * `COMMAND_CENTER_ACCEPTANCE` is a hardcoded constant shared by the whole
 * cohort, and every student's `.colaberry/progress.json` carries the criterion
 * text as it read the day their agent wrote it. Editing that constant in place
 * breaks them two ways at once:
 *
 *   1. `decideStory` matches a claim to the plan by normalised text; an
 *      unmatched tick becomes a `rejected_claim` and stops counting. Stories
 *      already sitting at `verified` would fall back to `submitted`.
 *   2. `mergeProgressFile` carries the student's `passed` flag across a
 *      republish by that same normalised text; unmatched means the flag is not
 *      carried and the next sync writes `false` over their real work.
 *
 * This table closes both, because both go through `resolveCriterionKey`.
 *
 * WHY IT IS PERMANENT AND NOT A MIGRATION WINDOW. The tempting version of this
 * is "accept both texts for a month, then rewrite everyone's file and drop the
 * old one". We cannot rewrite their files. They live in repos where
 * `platform_can_push` is false or was never recorded, and on a pull-only repo
 * no sync we ever run will change that sentence. So an entry is only ever
 * ADDED here. Nothing is removed, and nothing is edited.
 *
 * WHY NOT A VERSIONED ACCEPTANCE SET. A version number would tell us which
 * wording a file was written against — but only for files written after we
 * started stamping it. The nine files that already exist carry no such marker,
 * so the text path is needed regardless and the version buys nothing for the
 * case that actually hurts.
 *
 * WHY NOT A STABLE CRITERION ID. `progress.json` criteria are `{text, passed,
 * evidence}` with no id, by design — the text IS the anchor. Adding an id helps
 * files written from tomorrow and does nothing for the ones already committed,
 * so it would still need this table underneath it.
 *
 * SAFETY. An alias can only ever resolve onto a criterion the PLAN already
 * asks for (`resolveCriterionKey` checks membership before returning). It can
 * never invent a criterion, never satisfy a story that was not asked for it,
 * and never turn a `false` into a `true` — it only decides WHICH criterion a
 * claim is about. A genuinely reworded criterion with no entry here still
 * fails, which is what keeps the gating model intact.
 */
export const SUPERSEDED_CRITERIA: readonly SupersededWording[] = [
  {
    was:
      'Given the data files, when any tab renders, then its content comes from .colaberry/plan.json '
      + 'and .colaberry/progress.json read at runtime rather than from hard-coded values.',
    now:
      'Given the Command Center, when any tab renders, then .colaberry/plan.json and '
      + '.colaberry/progress.json are both committed in this repo and every tab reads its content '
      + 'from them at runtime rather than from hard-coded values.',
    superseded_on: '2026-08-19',
    why:
      'The old sentence was grammatically about code BEHAVIOUR with the file as its object, so an '
      + 'honest student could satisfy it with the file absent — "the tab reads from plan.json" is '
      + 'true of a reader that finds nothing. The required STATE is now in the "then" clause, where '
      + 'it can be checked.',
  },
  {
    was:
      'Given .colaberry/manifest.json, when any tab is shown, then it displays how old the data is '
      + 'and warns when that age exceeds a week.',
    now:
      'Given the Command Center, when any tab is shown, then .colaberry/manifest.json is '
      + 'committed in this repo and every tab shows how old that data is and warns when the age '
      + 'exceeds a week.',
    superseded_on: '2026-08-19',
    why:
      'The old sentence put the file in the "Given", which frames it as a precondition somebody '
      + 'else supplies — and our own docs said exactly that, calling it "platform bookkeeping". '
      + '8 of 9 students created it themselves anyway; one read it the other way, and both '
      + 'readings were defensible from the text. The file is now named in the "then".',
  },
];

/** Historical wording ⇒ the wording it became. Built once; the table is frozen at module load. */
const SUPERSEDED_BY_KEY: ReadonlyMap<string, string> = new Map(
  SUPERSEDED_CRITERIA.map((e) => [normaliseCriterion(e.was), normaliseCriterion(e.now)]),
);

/**
 * Which criterion of the plan is this claim about? Returns the plan's own
 * normalised key, or null when the claim matches nothing the plan asks for.
 *
 * Order matters. A CURRENT wording is resolved first and directly, so the table
 * is consulted only for text the plan does not already recognise — which means
 * adding an entry can never change the answer for a file written against
 * today's wording.
 *
 * `planKeys` must already be normalised. Passing raw text would reintroduce the
 * mirror-image bug the normaliser exists to prevent.
 */
export function resolveCriterionKey(claimText: string, planKeys: ReadonlySet<string>): string | null {
  const key = normaliseCriterion(claimText);
  if (planKeys.has(key)) return key;

  const successor = SUPERSEDED_BY_KEY.get(key);
  // The successor must itself be something the plan asks for. Without this
  // check, a student story that never carried these criteria could pick one up
  // from the table.
  if (successor && planKeys.has(successor)) return successor;

  return null;
}
