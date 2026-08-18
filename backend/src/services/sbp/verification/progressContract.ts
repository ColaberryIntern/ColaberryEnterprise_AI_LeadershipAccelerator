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
 * Bumped only for a BREAKING shape change. Additive fields do NOT bump it — see
 * MIN_READABLE_PROGRESS_VERSION for why that distinction is load-bearing.
 *
 * v1 → v2 added the platform-owned `verification` block and `totals`. Both are
 * optional in the schema, so v1 and v2 files are mutually parseable.
 */
export const PROGRESS_SCHEMA_VERSION = 2;

/**
 * The oldest version this reader still understands.
 *
 * WHY A RANGE RATHER THAN AN EQUALITY. The original check was
 * `declared !== PROGRESS_SCHEMA_VERSION`, which looked conservative and was
 * actually destructive: the moment we bumped to 2, every student's existing v1
 * file failed to parse, `mergeProgressFile` fell back to the freshly rendered
 * file, and every tick their agent had written was silently wiped on the next
 * publish. The safe direction is asymmetric — refuse a file from the FUTURE
 * (we cannot know what a field means), accept one from the PAST (every version
 * so far only added optional fields, so an old file is a valid new file with
 * absences).
 */
export const MIN_READABLE_PROGRESS_VERSION = 1;

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

/**
 * The PLATFORM's conclusion about a story, mirrored into the repo so a static
 * page can render build progress with no API and no login. Written on publish
 * and on every sync; never merged up from the repo, because this side is not
 * the student's to assert — a page that trusted it would be reading a number
 * the reader could have typed themselves.
 *
 * NOTHING VOLATILE MAY LIVE HERE. Every field must be stable while the build is
 * stable, or the file's bytes change on every sync, `changedFiles` sees a diff,
 * and we commit to the student's repo for nothing. That is why `checked_at`
 * (which moves every run) is deliberately absent while `verified_at` (first
 * write wins, never moves) is present. Freshness belongs in the manifest — see
 * docs/COMMAND_CENTER_DATA_CONTRACT.md.
 */
const storyVerificationSchema = z.object({
  state: z.enum(['not_started', 'in_progress', 'submitted', 'verified']),
  criteria_passed: z.number().int().min(0),
  criteria_total: z.number().int().min(0),
  /** ISO-8601. Set once, by the platform, and never moved afterwards. */
  verified_at: z.string().max(64).nullish(),
  /** The commit the platform accepted as evidence. */
  commit_sha: z.string().max(64).nullish(),
  /** Absolute, clickable, and checkable by a stranger with no account. */
  commit_url: z.string().max(500).nullish(),
  commit_at: z.string().max(64).nullish(),
  /** Builder XP this story has been awarded, or null when nothing was awarded. */
  points_awarded: z.number().nullish(),
  /** Criterion text still outstanding — what the student has left to do. */
  outstanding: z.array(z.string()).max(200).default([]),
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
  /**
   * Platform-owned (v2+). Absent on a file written before verification ran.
   *
   * `.catch(null)` is what keeps `MIN_READABLE_PROGRESS_VERSION = 1` honest. A
   * v1 file carried `{state, commit}` here, which does not satisfy v2's shape,
   * and without the catch one stale block rejected the WHOLE file and every
   * criterion the student had ticked with it. This side is ours and is
   * recomputed on every run, so a copy we cannot read is discarded rather than
   * treated as a reason to disbelieve the student's side. See
   * `__tests__/progressV1PlatformBlocks.test.ts`.
   */
  verification: storyVerificationSchema.nullish().catch(null),
});

/** Whole-build counts, so a page can show a headline without summing 40 stories. */
const progressTotalsSchema = z.object({
  stories_total: z.number().int().min(0),
  stories_verified: z.number().int().min(0),
  stories_submitted: z.number().int().min(0),
  stories_in_progress: z.number().int().min(0),
  stories_not_started: z.number().int().min(0),
  criteria_total: z.number().int().min(0),
  criteria_passed: z.number().int().min(0),
  points_awarded: z.number().min(0),
});

export const progressFileSchema = z.object({
  schema_version: z.number().int(),
  /** Informational; the platform writes it so a human opening the file knows whose it is. */
  project: z.string().nullish(),
  /**
   * Platform-owned rollup (v2+).
   *
   * Leniently parsed for the same reason as `verification` above: v1 emitted
   * five of these eight keys, and a partial rollup we never read must not be
   * able to condemn the criteria we do read.
   */
  totals: progressTotalsSchema.nullish().catch(null),
  stories: z.array(storyProgressSchema).max(500),
});

export type ProgressCriterion = z.infer<typeof criterionSchema>;
export type StoryVerificationSummary = z.infer<typeof storyVerificationSchema>;
export type ProgressTotals = z.infer<typeof progressTotalsSchema>;
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

  // Version is checked BEFORE the shape. A v3 file failing v2's shape check
  // should say "written for a newer platform", not "your file is malformed".
  //
  // The check is a RANGE, not an equality, and the asymmetry is deliberate:
  // a file from the future is unreadable (we cannot know what its fields mean),
  // a file from the past is readable (every bump so far has only ADDED optional
  // fields). Getting this wrong is not a cosmetic bug — an over-strict check
  // makes `mergeProgressFile` discard the existing file and republish wipes
  // every criterion the student's agent had ticked.
  const declared = (parsed as { schema_version?: unknown })?.schema_version;
  if (typeof declared === 'number'
    && (declared > PROGRESS_SCHEMA_VERSION || declared < MIN_READABLE_PROGRESS_VERSION)) {
    return {
      ok: false,
      error_class: 'ProgressFileUnsupportedVersion',
      reason:
        `${PROGRESS_FILE_PATH} declares schema_version ${declared}, but this platform reads versions `
        + `${MIN_READABLE_PROGRESS_VERSION} to ${PROGRESS_SCHEMA_VERSION}. Sync your build plan from `
        + 'the portal to get a fresh file.',
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
 * One story's build progress as the PLATFORM holds it server-side, ready to be
 * mirrored into the repo. Assembled from `student_tasks` (verified_at,
 * verified_ref, verification_json) and `evidence_records` (builder_xp).
 */
export interface StoryProgressInput {
  story_id: string;
  state: StoryVerificationSummary['state'];
  criteria_passed: number;
  criteria_total: number;
  verified_at?: string | null;
  commit_sha?: string | null;
  commit_at?: string | null;
  points_awarded?: number | null;
  outstanding?: string[] | null;
}

export interface ProgressRenderInput {
  /** Server-side progress, by story. Omitted ⇒ the plan side only, all false. */
  progress?: StoryProgressInput[] | null;
  /**
   * Repo web URL (`https://github.com/owner/repo`), used to build clickable
   * commit links. A portfolio reader has no login, so a bare sha is not a
   * citation — the URL is what makes a claim checkable by a stranger.
   */
  repoUrl?: string | null;
}

/** `https://github.com/owner/repo` + sha ⇒ the commit page. Null when either is absent. */
export function commitUrl(repoUrl: string | null | undefined, sha: string | null | undefined): string | null {
  if (!repoUrl?.trim() || !sha?.trim()) return null;
  return `${repoUrl.trim().replace(/\.git$/, '').replace(/\/+$/, '')}/commit/${sha.trim()}`;
}

/** Sum the per-story verification blocks into the headline a page shows first. */
export function summariseTotals(stories: StoryProgress[]): ProgressTotals {
  const t: ProgressTotals = {
    stories_total: stories.length,
    stories_verified: 0,
    stories_submitted: 0,
    stories_in_progress: 0,
    stories_not_started: 0,
    criteria_total: 0,
    criteria_passed: 0,
    points_awarded: 0,
  };
  for (const s of stories) {
    const v = s.verification;
    t.criteria_total += v?.criteria_total ?? s.acceptance_total ?? s.criteria.length;
    t.criteria_passed += v?.criteria_passed ?? 0;
    t.points_awarded += v?.points_awarded ?? 0;
    switch (v?.state ?? 'not_started') {
      case 'verified': t.stories_verified += 1; break;
      case 'submitted': t.stories_submitted += 1; break;
      case 'in_progress': t.stories_in_progress += 1; break;
      default: t.stories_not_started += 1;
    }
  }
  return t;
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
  input: ProgressRenderInput = {},
): ProgressFile {
  const byStory = new Map((input.progress ?? []).map((p) => [p.story_id, p]));

  const rendered: StoryProgress[] = [...stories]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => {
      const p = byStory.get(s.id);
      const acceptance = s.acceptance ?? [];
      return {
        id: s.id,
        release: s.release ?? null,
        acceptance_total: acceptance.length,
        criteria: acceptance.map((text) => ({ text, passed: false })),
        files_touched: [],
        tests_added: [],
        notes: null,
        updated_at: null,
        // The platform's side. Always present once we have a verification run,
        // even for an untouched story: "not_started" stated explicitly beats a
        // missing key, because a page cannot tell an absent field from a zero.
        verification: p
          ? {
            state: p.state,
            criteria_passed: p.criteria_passed,
            criteria_total: p.criteria_total,
            verified_at: p.verified_at ?? null,
            commit_sha: p.commit_sha ?? null,
            commit_url: commitUrl(input.repoUrl, p.commit_sha),
            commit_at: p.commit_at ?? null,
            points_awarded: p.points_awarded ?? null,
            outstanding: p.outstanding ?? [],
          }
          : null,
      };
    });

  return {
    schema_version: PROGRESS_SCHEMA_VERSION,
    project: projectName ?? null,
    totals: summariseTotals(rendered),
    stories: rendered,
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
 *
 * THE OWNERSHIP LINE, field by field:
 *   platform, replaced outright — `schema_version`, `project`, `totals`, story
 *     `id`/`release`/`acceptance_total`, criterion `text`, and the whole
 *     `verification` block
 *   agent, carried across  — criterion `passed` and `evidence`,
 *     `files_touched`, `tests_added`, `notes`, `updated_at`
 * `verification` is explicitly on the platform side: it is our conclusion about
 * their evidence, so reading it back out of the repo would let the file assert
 * its own verification.
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
        // Restated rather than left to the spread above, so that a later refactor
        // reordering these keys cannot quietly start honouring the repo's copy.
        verification: story.verification ?? null,
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
