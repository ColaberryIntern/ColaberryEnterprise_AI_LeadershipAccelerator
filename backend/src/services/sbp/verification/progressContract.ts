/**
 * `.colaberry/progress.json` — the two-way contract between the platform and
 * the Claude Code session running in the student's repo.
 *
 * The PLATFORM writes the plan side: which stories exist, and the exact text of
 * each acceptance criterion. CLAUDE CODE writes the completion side: which of
 * those criteria now pass, which files it touched, which tests it added.
 *
 * WHY A JSON FILE THE AGENT MAINTAINS, rather than parsing commit messages or
 * scraping markdown checkboxes:
 *   - Commit messages are prose. Students (and models) reformat them, squash
 *     them, amend them. Any parser we write is guessing.
 *   - Markdown checkboxes live in a file the student is invited to edit and
 *     restructure — the story docs are theirs. A regex over `- [x]` breaks the
 *     first time somebody reorders a list or wraps a line.
 *   - We already control the instructions the agent follows, through the
 *     managed block in their CLAUDE.md. A structured file we ask for in that
 *     block is the one artefact we can specify exactly and validate exactly.
 *
 * PURE. Zod at the read boundary, no I/O, no clock. Everything here is
 * unit-testable without GitHub.
 *
 * HONESTY: a student can open this file and type `"passed": true` on every
 * line. Nothing here prevents that and nothing here pretends to — see
 * docs/BUILD_VERIFICATION_CONTRACT.md for the actual defences and their limits.
 */
import { z } from 'zod';

/**
 * Bumped only for a BREAKING shape change. A reader that meets a version it was
 * not written for must refuse rather than guess, because guessing at a shape
 * means awarding or withholding credit on a misread file.
 */
export const PROGRESS_SCHEMA_VERSION = 1;

export const PROGRESS_FILE_PATH = '.colaberry/progress.json';

/**
 * One acceptance criterion. `text` is the anchor: the reader matches a claim
 * back to the plan by its normalised text, so an agent that reorders the array
 * still lands on the right criterion, and an agent that INVENTS a criterion
 * matches nothing and is rejected rather than counted.
 */
const criterionSchema = z.object({
  text: z.string().min(1, 'criterion text may not be empty'),
  passed: z.boolean(),
  /** Optional free-text from the agent: how it knows this passes. */
  evidence: z.string().max(2000).optional(),
});

const storyProgressSchema = z.object({
  id: z.string().min(1),
  /** Written by the platform; informational. */
  release: z.string().nullish(),
  /** Written by the platform: how many criteria the plan says this story has. */
  acceptance_total: z.number().int().min(0).nullish(),
  criteria: z.array(criterionSchema).max(200).default([]),
  files_touched: z.array(z.string().min(1)).max(500).default([]),
  tests_added: z.array(z.string().min(1)).max(500).default([]),
  notes: z.string().max(4000).nullish(),
  /** ISO-8601, written by the agent. Advisory only — never trusted as proof. */
  updated_at: z.string().max(64).nullish(),
});

export const progressFileSchema = z.object({
  schema_version: z.number().int(),
  /** Informational; the platform writes it so a human opening the file knows whose it is. */
  project: z.string().nullish(),
  stories: z.array(storyProgressSchema).max(500),
});

export type ProgressCriterion = z.infer<typeof criterionSchema>;
export type StoryProgress = z.infer<typeof storyProgressSchema>;
export type ProgressFile = z.infer<typeof progressFileSchema>;

export type ProgressParseErrorClass =
  | 'ProgressFileMissing'
  | 'ProgressFileNotJson'
  | 'ProgressFileSchemaMismatch'
  | 'ProgressFileUnsupportedVersion';

export interface ProgressParseFailure {
  ok: false;
  error_class: ProgressParseErrorClass;
  /** One sentence a student can act on. Rendered in the portal verbatim. */
  reason: string;
  /** Field-level detail for the log line. Never shown raw to a student. */
  issues?: string[];
}

export interface ProgressParseSuccess {
  ok: true;
  file: ProgressFile;
}

export type ProgressParseResult = ProgressParseSuccess | ProgressParseFailure;

/**
 * Parse the raw file contents.
 *
 * A malformed file is REJECTED with a reason. It is never downgraded to "an
 * empty progress file", because those two states must produce different
 * outcomes: an empty file means the student has not started, a mangled file
 * means we cannot tell — and telling a student "nothing done" when the truth is
 * "your file is broken" sends them off to redo work they already did.
 *
 * A rejected read also leaves every existing verification untouched. Nothing in
 * this loop ever REVOKES a verification on the strength of a file it could not
 * read.
 */
export function parseProgressFile(raw: string | null | undefined): ProgressParseResult {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return {
      ok: false,
      error_class: 'ProgressFileMissing',
      reason:
        `${PROGRESS_FILE_PATH} is not in your repo. Sync your build plan from the portal to get it, `
        + 'then let Claude Code fill it in as it finishes stories.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error_class: 'ProgressFileNotJson',
      reason:
        `${PROGRESS_FILE_PATH} is not valid JSON, so the platform cannot read which stories you finished. `
        + 'Fix the syntax (a trailing comma or an unclosed brace is the usual cause) and sync again.',
      issues: [err instanceof Error ? err.message : String(err)],
    };
  }

  // Version is checked BEFORE the shape. A v2 file failing v1's shape check
  // should say "written for a newer platform", not "your file is malformed".
  const declared = (parsed as { schema_version?: unknown })?.schema_version;
  if (typeof declared === 'number' && declared !== PROGRESS_SCHEMA_VERSION) {
    return {
      ok: false,
      error_class: 'ProgressFileUnsupportedVersion',
      reason:
        `${PROGRESS_FILE_PATH} declares schema_version ${declared}, but this platform reads version `
        + `${PROGRESS_SCHEMA_VERSION}. Sync your build plan from the portal to get a fresh file.`,
    };
  }

  const result = progressFileSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error_class: 'ProgressFileSchemaMismatch',
      reason:
        `${PROGRESS_FILE_PATH} does not match the expected shape, so the platform cannot tell which `
        + 'criteria you marked as passing. Sync your build plan from the portal to restore the file.',
      issues: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  return { ok: true, file: result.data };
}

// ── the platform's side of the file ─────────────────────────────────────────

export interface PlanStorySeed {
  id: string;
  release?: string | null;
  acceptance?: string[] | null;
}

/**
 * The file the platform writes from a plan: every story, every criterion, all
 * `passed: false`. Seeding the criteria TEXT from the plan is deliberate — the
 * agent flips a boolean rather than retyping a sentence, so the common case
 * produces claims that match the plan exactly and the reader's rejection path
 * only fires on genuinely invented criteria.
 *
 * PURE and deterministic: same plan in, byte-identical file out, which is what
 * lets repoWriter's content-hash idempotency hold.
 */
export function renderProgressFile(
  stories: PlanStorySeed[],
  projectName?: string | null,
): ProgressFile {
  return {
    schema_version: PROGRESS_SCHEMA_VERSION,
    project: projectName ?? null,
    stories: [...stories]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((s) => ({
        id: s.id,
        release: s.release ?? null,
        acceptance_total: (s.acceptance ?? []).length,
        criteria: (s.acceptance ?? []).map((text) => ({ text, passed: false })),
        files_touched: [],
        tests_added: [],
        notes: null,
        updated_at: null,
      })),
  };
}

/**
 * Merge a freshly rendered progress file over whatever is already in the repo.
 *
 * The same shape of ownership as the managed block in CLAUDE.md: the PLAN side
 * is ours and is replaced outright (a republished plan may add, drop or reword
 * stories), the COMPLETION side is the agent's and survives.
 *
 * Without this, republishing a plan silently wipes every tick the student's
 * agent had written. Verifications already stamped server-side would survive —
 * `markTaskVerifiedComplete` is first-write-wins — but everything at
 * `submitted` would drop back to `not_started`, which reads to a student as the
 * platform losing their work.
 *
 * Matching is by story id, then by normalised criterion text. A criterion whose
 * wording the plan changed is intentionally NOT carried over: the sentence the
 * student ticked is not the sentence that is now being asked for.
 */
export function mergeProgressFile(rendered: ProgressFile, existingRaw: string | null | undefined): ProgressFile {
  const parsed = parseProgressFile(existingRaw);
  if (!parsed.ok) return rendered;   // unreadable ⇒ start clean; we lose nothing we could read

  const priorByStory = new Map(parsed.file.stories.map((s) => [s.id, s]));

  return {
    ...rendered,
    stories: rendered.stories.map((story) => {
      const prior = priorByStory.get(story.id);
      if (!prior) return story;

      const priorByText = new Map(prior.criteria.map((c) => [normaliseCriterion(c.text), c]));
      return {
        ...story,
        criteria: story.criteria.map((c) => {
          const was = priorByText.get(normaliseCriterion(c.text));
          return was ? { ...c, passed: was.passed, ...(was.evidence ? { evidence: was.evidence } : {}) } : c;
        }),
        files_touched: prior.files_touched,
        tests_added: prior.tests_added,
        notes: prior.notes ?? null,
        updated_at: prior.updated_at ?? null,
      };
    }),
  };
}

// ── criterion identity ──────────────────────────────────────────────────────

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
 * WHY THIS EXISTS AT ALL. STORY-000's third acceptance line is `Trust — no tab
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
 *     criterion must keep failing — that is the whole gating model.
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

/** Serialise for the repo: stable key order via the schema, trailing newline. */
export function serialiseProgressFile(file: ProgressFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
