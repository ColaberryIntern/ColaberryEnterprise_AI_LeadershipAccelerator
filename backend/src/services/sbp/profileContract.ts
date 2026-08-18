/**
 * `.colaberry/profile.json` — the student's portfolio layer.
 *
 * A Command Center is for the builder while building. A PROFILE is for a
 * stranger deciding whether to interview them. Same underlying build, different
 * question being answered, and — critically — a different audience with
 * different consent attached, which is why this is a file of its own rather
 * than another block inside plan.json.
 *
 * ── THE THIRD OWNERSHIP CLASS ───────────────────────────────────────────────
 *
 *   .colaberry/plan.json      platform-owned  · replaced wholesale
 *   .colaberry/progress.json  co-owned        · merged field by field
 *   .colaberry/profile.json   STUDENT-OWNED   · seeded once, never overwritten
 *
 * The seed-once rule is the whole point. A profile contains editorial choices —
 * which build to lead with, how to describe an employer, what the hard part
 * actually was — and none of that is derivable from a plan. It also carries
 * consent, and consent that the platform can overwrite is not consent. So the
 * platform writes this file exactly once, when it does not exist, and treats it
 * as read-only from then on.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT CONTAIN ────────────────────────────
 *
 * No copied requirement text, no copied measures, no copied systems list. The
 * profile renderer joins this file with plan.json and progress.json at render
 * time and honours the `include` flags below. Copying content in here instead
 * would create a second stale copy of data that already exists two files away,
 * and would put employer-identifying text into a new file for no gain — it is
 * already in plan.json in the same repo.
 *
 * ── THE HONEST LIMIT OF THESE FLAGS ─────────────────────────────────────────
 *
 * `include` governs what a PUBLISHED PROFILE restates. It does NOT and cannot
 * un-publish bytes that are already in a public repo: plan.json sits beside
 * this file and carries the verbatim requirements. The control for the repo is
 * REPO VISIBILITY, not a flag inside the repo. Two exposures, two controls, and
 * conflating them would be the kind of false assurance that gets a corporate
 * learner in trouble at work. See docs/COMMAND_CENTER_DATA_CONTRACT.md.
 *
 * PURE. No I/O, no clock.
 */
import { z } from 'zod';

export const PROFILE_SCHEMA_VERSION = 1;
export const MIN_READABLE_PROFILE_VERSION = 1;
export const PROFILE_FILE_PATH = '.colaberry/profile.json';

/**
 * How much of this build the student is willing to have restated publicly.
 *
 * Defaults to `private`, and the default is doing real work: a corporate
 * learner's plan can name their employer's internal systems and real operating
 * numbers ("signature to kickoff drops from 9 days to 2"). Publishing that
 * verbatim by default, on a document we encourage them to send to recruiters,
 * would be a genuine problem for them at work. Opting IN is a decision they can
 * make; opting out after the fact is not.
 */
export const DISCLOSURE_LEVELS = ['private', 'anonymised', 'public'] as const;
export type Disclosure = typeof DISCLOSURE_LEVELS[number];

/**
 * Per-category consent, honoured by the profile renderer.
 *
 * Split rather than a single boolean because the categories carry very
 * different risk. The shape of a build (how many stories, how many guardrails,
 * how much was verified) identifies nobody. A verbatim NFR with a real
 * before-and-after number can identify an employer's operations to anyone in
 * that industry. A student should be able to publish the first without the
 * second, which a single "make public" switch would not allow.
 */
const includeSchema = z.object({
  /** Verbatim requirement statements. Highest re-identification risk. */
  requirement_statements: z.boolean(),
  /** Numeric NFR targets — real operating figures. */
  measures: z.boolean(),
  /** Named systems of record, which name an employer's stack. */
  systems: z.boolean(),
  /** The student's own narrative fields below. */
  narrative: z.boolean(),
});

export const profileFileSchema = z.object({
  schema_version: z.number().int(),
  disclosure: z.enum(DISCLOSURE_LEVELS),
  /** One line, the student's words. "Built an agreement-to-onboarding pipeline." */
  headline: z.string().max(280).nullish(),
  /**
   * The paragraph a hiring manager actually reads: what it does, who for, and
   * why it was hard. Seeded EMPTY on purpose — this is the most valuable
   * content we could put in a portfolio and the least safe to generate. A
   * summary in the student's own words is both safer and better than one
   * assembled from their employer's requirement text.
   */
  summary: z.string().max(4000).nullish(),
  /** What was genuinely hard. The differentiator against "I did a tutorial". */
  challenge: z.string().max(4000).nullish(),
  /** Story ids to lead with. Empty ⇒ the renderer picks the verified ones. */
  highlight_story_ids: z.array(z.string().min(1)).max(20).default([]),
  /** How a stranger checks the claims without an account. */
  links: z.object({
    repo: z.string().max(500).nullish(),
    command_center: z.string().max(500).nullish(),
  }),
  include: includeSchema,
});

export type ProfileFile = z.infer<typeof profileFileSchema>;

export type ProfileParseResult =
  | { ok: true; file: ProfileFile }
  | { ok: false; reason: string };

/**
 * Parse an existing profile file.
 *
 * Failure is SOFT here, unlike progress.json. A profile is presentation, not
 * credit: a malformed one costs a student nothing but the profile, whereas a
 * malformed progress file could cost them a verification. So a bad profile is
 * reported and the existing bytes are left exactly as the student wrote them,
 * rather than being replaced with a fresh seed that would discard their prose.
 */
export function parseProfileFile(raw: string | null | undefined): ProfileParseResult {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { ok: false, reason: `${PROFILE_FILE_PATH} is not in your repo yet.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: `${PROFILE_FILE_PATH} is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  const declared = (parsed as { schema_version?: unknown })?.schema_version;
  if (typeof declared === 'number'
    && (declared > PROFILE_SCHEMA_VERSION || declared < MIN_READABLE_PROFILE_VERSION)) {
    return { ok: false, reason: `${PROFILE_FILE_PATH} declares schema_version ${declared}, which this platform does not read.` };
  }
  const result = profileFileSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: `${PROFILE_FILE_PATH} does not match the expected shape: `
        + result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
    };
  }
  return { ok: true, file: result.data };
}

export interface ProfileSeedInput {
  repoUrl?: string | null;
  commandCenterUrl?: string | null;
}

/**
 * The file the platform seeds on first publish: everything closed, everything
 * blank, links filled in because those are facts rather than choices.
 *
 * PURE and deterministic — same inputs, byte-identical output, which is what
 * lets the seed-once check below stay hash-based.
 */
export function renderProfileSeed(input: ProfileSeedInput = {}): ProfileFile {
  return {
    schema_version: PROFILE_SCHEMA_VERSION,
    disclosure: 'private',
    headline: null,
    summary: null,
    challenge: null,
    highlight_story_ids: [],
    links: {
      repo: input.repoUrl ?? null,
      command_center: input.commandCenterUrl ?? null,
    },
    include: {
      requirement_statements: false,
      measures: false,
      systems: false,
      narrative: false,
    },
  };
}

export function serialiseProfileFile(file: ProfileFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
