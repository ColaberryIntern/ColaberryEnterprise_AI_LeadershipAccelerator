/**
 * studentProgressMerge — `mergeProgressFile`, made safe to hand to a student.
 *
 * ## Why this exists
 *
 * `mergeProgressFile` is the platform's reference merge and it is correct for
 * the job it was written for: `repoWriter` calls it to build the bytes of a
 * commit the platform makes into a repo it can push to. Its contract is the
 * ownership line — our story list and criterion text replaced outright, the
 * agent's `passed` flags, evidence, notes and file lists carried across.
 *
 * It has one property that is invisible while it only ever feeds a repo write,
 * and destructive the moment its output is handed to a student as THEIR file:
 * it is built as `{ ...rendered, stories: [...] }`, and `rendered` carries
 * exactly four keys. Anything else a student put at the top level of
 * `.colaberry/progress.json` is not merged and not dropped by decision — it is
 * simply never in the output. `parseProgressFile` cannot save it either: the
 * Zod object strips unknown keys before the merge ever sees them.
 *
 * That is not hypothetical. Read live from the fifteen pull-only repos on
 * 2026-08-21, Hellen Muhonja's file carries NINE custom top-level keys her
 * Command Center reads at runtime — `updatedAt`, `storyStatus`, `systemStatus`,
 * `guardrailEnforced`, `agentsScoped`, `outcomes`, `story000`, `decisions`,
 * `notes` — including her own decisions log. A plain `mergeProgressFile` would
 * hand her back a file with all nine gone. Abrahim Nur carries a per-story
 * `points` key that goes the same way.
 *
 * So this module re-grafts what the schema does not model, at both levels, and
 * changes nothing the reference merge already decides.
 *
 * ## What it deliberately does NOT change
 *
 * The STORY LIST still comes from the plan, exactly as `mergeProgressFile`
 * leaves it. A story in the student's file that the plan does not contain is
 * not carried over, because that is the documented ownership line and it is
 * what a push-access student's repo receives on every sync — a download that
 * disagreed would be a second, quietly different answer to the same question.
 * Verified harmless before relying on it: across all fifteen pull-only repos,
 * zero students have a story entry that is not in their plan. The count is
 * reported anyway (`unrecognised_story_ids`) so that if it ever stops being
 * zero, the surface can say so instead of losing it silently.
 *
 * PURE. No I/O, no clock, no randomness — same inputs, byte-identical output.
 */
import {
  ProgressFile,
  mergeProgressFile,
  parseProgressFile,
  serialiseProgressFile,
} from './progressContract';

/**
 * The top-level keys the PLATFORM owns — every key `renderProgressFile` emits.
 *
 * Pinned as a constant rather than derived from the rendered object at runtime,
 * because deriving it would make the ownership line depend on whichever plan
 * happened to be rendering: a plan that produced a null `totals` would make
 * `totals` look like a student key and let a stale copy survive. A test pins
 * this list against a real render so adding a platform key without updating it
 * fails loudly rather than leaking.
 */
export const PLATFORM_TOP_LEVEL_KEYS: readonly string[] = [
  'schema_version', 'project', 'totals', 'stories',
];

/** The per-story keys the platform owns — every key `renderProgressFile` puts on a story. */
export const PLATFORM_STORY_KEYS: readonly string[] = [
  'id', 'release', 'acceptance_total', 'criteria', 'files_touched', 'tests_added',
  'notes', 'updated_at', 'verification',
];

const TOP_LEVEL = new Set(PLATFORM_TOP_LEVEL_KEYS);
const STORY_LEVEL = new Set(PLATFORM_STORY_KEYS);

export interface StudentProgressMergeResult {
  /** Serialised and ready to save at `.colaberry/progress.json`. */
  content: string;
  /**
   * What was found at the student's live path.
   *   `absent`     — nothing there; this is the plain seed
   *   `merged`     — read, parsed, and merged into
   *   `unreadable` — there IS a file but it does not parse, so nothing could be
   *                  carried across. The caller must warn; it must never be
   *                  reported as a clean merge.
   */
  existing: 'absent' | 'merged' | 'unreadable';
  stories: number;
  criteria: number;
  /** Ticks in the delivered file. Equals the student's own count on a clean merge. */
  criteria_passed: number;
  /** Custom top-level keys carried across — Hellen's nine, for her. */
  preserved_top_level_keys: string[];
  /** Custom per-story keys carried across, deduped across stories. */
  preserved_story_keys: string[];
  /** Story ids in their file that the plan does not contain, so are not carried. */
  unrecognised_story_ids: string[];
}

/** Parse to a plain object, or null. Never throws — a broken file is a state, not a crash. */
function rawObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

/** Every key of `source` the platform does not own, in the order the file had them. */
function customKeysOf(source: Record<string, unknown> | null, owned: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!source) return out;
  for (const [key, value] of Object.entries(source)) {
    if (owned.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function countCriteria(file: ProgressFile): { total: number; passed: number } {
  let total = 0;
  let passed = 0;
  for (const story of file.stories) {
    for (const c of story.criteria) {
      total += 1;
      if (c.passed) passed += 1;
    }
  }
  return { total, passed };
}

/**
 * Merge the platform's freshly rendered progress file over the student's own,
 * preserving everything neither side's schema models.
 *
 * ## Why the custom keys go AFTER the platform keys, always
 *
 * Idempotency is the requirement — eleven students were emailed a computed file
 * yesterday, so this will routinely run against a file that is already correct,
 * and a second run must produce byte-identical output. Re-grafting at a fixed
 * position gives that: on the second pass the custom keys are read back out of
 * the same trailing block, in the same relative order, and land in the same
 * place. Preserving their ORIGINAL position instead would be stable too, but
 * only until a student reordered their file by hand.
 *
 * A custom key can never collide with a platform key, because it is defined as
 * a key the platform does not own — so nothing here can overwrite our side.
 */
export function mergeStudentProgressFile(
  rendered: ProgressFile,
  existingRaw: string | null | undefined,
): StudentProgressMergeResult {
  // THE REFERENCE MERGE, CALLED NOT REIMPLEMENTED. Criterion identity, the
  // supersession table, the pessimistic tie-break and the v1/v2 range check all
  // live in there and are the reason a student who ticked the OLD STORY-000
  // wording keeps their 5 of 5. Reimplementing any of it here would be a second
  // answer to a question that already has one.
  const merged = mergeProgressFile(rendered, existingRaw);

  const prior = rawObject(existingRaw);
  const hadFile = existingRaw !== null && existingRaw !== undefined && existingRaw.trim() !== '';

  const topCustom = customKeysOf(prior, TOP_LEVEL);

  const priorStories: unknown[] = prior && Array.isArray(prior.stories) ? prior.stories : [];
  const priorById = new Map<string, Record<string, unknown>>();
  for (const entry of priorStories) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : null;
    // First entry wins on a duplicated id: the merge above is already
    // pessimistic about duplicate CLAIMS, and re-deriving that judgement for
    // unmodelled keys would be inventing a rule nothing else in the contract has.
    if (id && !priorById.has(id)) priorById.set(id, row);
  }

  const storyKeysSeen = new Set<string>();
  const stories = merged.stories.map((story) => {
    const custom = customKeysOf(priorById.get(story.id) ?? null, STORY_LEVEL);
    for (const key of Object.keys(custom)) storyKeysSeen.add(key);
    return Object.keys(custom).length === 0 ? story : { ...story, ...custom };
  });

  const renderedIds = new Set(merged.stories.map((s) => s.id));
  const unrecognised = [...priorById.keys()].filter((id) => !renderedIds.has(id));

  /**
   * Cast rather than a wider type on the whole module.
   *
   * `ProgressFile` is the schema's shape and these keys are BY DEFINITION not in
   * it — that is what makes them the student's. Reusing `serialiseProgressFile`
   * is worth the cast: it is the single place the file's formatting is decided,
   * and a local `JSON.stringify` here would be a second formatter free to drift
   * from the one every other writer uses.
   */
  const withCustom = { ...merged, stories, ...topCustom } as unknown as ProgressFile;
  const counts = countCriteria(merged);

  return {
    content: serialiseProgressFile(withCustom),
    /**
     * `merged` is claimed only when the merge could ACTUALLY read their file.
     *
     * The test is `parseProgressFile`, not "did JSON.parse work", and the
     * difference is the whole point: a file that is valid JSON but fails the
     * schema parses fine here while `mergeProgressFile` discards it entirely and
     * carries nothing across. Reporting that as a clean merge is the lie that
     * would cost a student their ticks — they would replace their file believing
     * the ticks came with it. Their custom keys are still preserved on that
     * path, because those we CAN read; only the claim is downgraded.
     */
    existing: !hadFile ? 'absent' : (parseProgressFile(existingRaw).ok ? 'merged' : 'unreadable'),
    stories: merged.stories.length,
    criteria: counts.total,
    criteria_passed: counts.passed,
    preserved_top_level_keys: Object.keys(topCustom),
    preserved_story_keys: [...storyKeysSeen],
    unrecognised_story_ids: unrecognised,
  };
}
