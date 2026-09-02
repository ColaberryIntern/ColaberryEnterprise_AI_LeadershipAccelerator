import { OnboardingProfile } from '../models';
import { buildResumeExtractionPrompt, parseExtractionJson } from '../services/resumeIngestService';
import { normalizeExperience, normalizeEducation } from '../services/resumeHistory';

/**
 * Backfill `experience[]` / `education[]` onto resumes ingested before the extractor
 * knew to ask for them.
 *
 * WHY THIS EXISTS. The portfolio's Experience section reads `OnboardingProfile.extracted`.
 * Every resume ingested before this change has a blob with no `experience` key at all, so
 * those learners would see an empty section forever while the source text sits unread in
 * the same row.
 *
 * WRITTEN IN TYPESCRIPT ON PURPOSE. `backend/tsconfig.json` has no `allowJs`, so a `.js`
 * file under `src/` never reaches `dist/` and could not be run in the prod container at
 * all. Same reasoning as `scopeCaseStudyRepository.ts`.
 *
 * WHAT IT REFUSES TO DO, and why:
 *  - It never REPLACES the extraction. It runs the model, takes ONLY `experience` and
 *    `education`, and merges those two keys into the existing blob. A full replacement
 *    would rewrite `skill_claims`, which feeds CAPE placement, and a backfill has no
 *    business moving somebody's radar.
 *  - It never re-extracts a row that already carries an `experience` key, so a second run
 *    is free and cannot produce a different answer. `--force` overrides that for one named
 *    enrollment only, never in bulk.
 *  - It writes nothing without `--apply`.
 *
 * IDEMPOTENT BY CONSTRUCTION. The `experience` key is written even when the resume states
 * no history (as `[]`), so "already examined" and "has a history" are different states and
 * a re-run does not re-spend tokens on the same rows.
 *
 * FAILURE-FIRST (root CLAUDE.md):
 *  1. On failure: per-row. One learner's bad extraction is caught, logged and skipped; the
 *     rest of the batch still lands. There is no partial write within a row - the merge is
 *     one update of one JSONB column.
 *  2. Retry: none internally. Re-running the script is the retry, and it is safe.
 *  3. Recovery: re-run. A row that failed has no `experience` key, so it is picked up again.
 *  4. Handled: no resume text, unparseable model output, a resume with no history in it.
 *     NOT handled: the database being unavailable, which propagates and stops the run.
 *
 * Usage:
 *   node dist/scripts/backfillResumeHistory.js                       # dry run
 *   node dist/scripts/backfillResumeHistory.js --apply
 *   node dist/scripts/backfillResumeHistory.js --apply --limit=5
 *   node dist/scripts/backfillResumeHistory.js --apply --enrollment=<id> --force
 */

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const FORCE = ARGS.includes('--force');

function argValue(name: string): string | null {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
}

const LIMIT = Number(argValue('limit')) || 0;
const ONLY_ENROLLMENT = argValue('enrollment');

interface Candidate {
  row: any;
  text: string;
  extracted: Record<string, unknown> | null;
}

async function main(): Promise<void> {
  const where: Record<string, unknown> = {};
  if (ONLY_ENROLLMENT) where.enrollment_id = ONLY_ENROLLMENT;
  const rows: any[] = await OnboardingProfile.findAll({ where } as any);

  const candidates: Candidate[] = [];
  let skippedNoText = 0;
  let skippedAlreadyDone = 0;

  for (const row of rows) {
    const text = String(row.resume_text || '').trim();
    const extracted = (row.extracted && typeof row.extracted === 'object')
      ? (row.extracted as Record<string, unknown>)
      : null;
    const alreadyHas = !!extracted && Object.prototype.hasOwnProperty.call(extracted, 'experience');

    // --force only ever applies to a single named enrollment, so a stray flag on a bulk
    // run cannot re-extract (and re-bill) every learner in the table.
    if (alreadyHas && !(FORCE && ONLY_ENROLLMENT)) { skippedAlreadyDone += 1; continue; }
    if (!text) { skippedNoText += 1; continue; }
    candidates.push({ row, text, extracted });
  }

  const work = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;

  console.log(JSON.stringify({
    event: 'backfill_resume_history_plan',
    mode: APPLY ? 'apply' : 'dry-run',
    profiles_total: rows.length,
    eligible: candidates.length,
    will_process: work.length,
    skipped_already_backfilled: skippedAlreadyDone,
    skipped_no_resume_text: skippedNoText,
  }, null, 2));

  if (!work.length) {
    console.log('Nothing to do.');
    return;
  }

  const { getInstrumentedOpenAI } = await import('../services/openaiInstrumented');
  const openai = getInstrumentedOpenAI(
    { workflow_id: 'resume_history_backfill' } as any,
    { timeout: 60000, maxRetries: 1 } as any,
  );
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  let updated = 0;
  let noHistoryFound = 0;
  let failed = 0;

  for (const { row, text, extracted } of work) {
    const enrollmentId = row.enrollment_id;
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential on purpose: this is a
      // paid, rate-limited API and a backfill has no latency requirement.
      const response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You extract structured professional background as strict JSON. Never invent facts.',
          },
          { role: 'user', content: buildResumeExtractionPrompt(text) },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      });
      const parsed = parseExtractionJson(response.choices[0]?.message?.content || '');
      if (!parsed) throw new Error('extraction did not parse');

      const experience = normalizeExperience(parsed.experience);
      const education = normalizeEducation(parsed.education);
      if (!experience.length && !education.length) noHistoryFound += 1;

      const merged = { ...(extracted || {}), experience, education };
      if (APPLY) {
        // eslint-disable-next-line no-await-in-loop -- one row at a time, see above.
        await row.update({ extracted: merged });
        updated += 1;
      }

      console.log(JSON.stringify({
        event: 'backfill_resume_history_row',
        enrollment_id: enrollmentId,
        roles: experience.length,
        credentials: education.length,
        written: APPLY,
      }));
    } catch (err: any) {
      failed += 1;
      console.warn(JSON.stringify({
        event: 'backfill_resume_history_failed',
        enrollment_id: enrollmentId,
        error_class: err?.error_class || err?.name || 'Error',
        message: err?.message,
      }));
    }
  }

  console.log(JSON.stringify({
    event: 'backfill_resume_history_done',
    mode: APPLY ? 'apply' : 'dry-run',
    processed: work.length,
    updated,
    no_history_in_resume: noHistoryFound,
    failed,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfillResumeHistory failed:', err);
    process.exit(1);
  });
