import { OnboardingProfile } from '../models';
import { extractTextFromBuffer } from '../services/fileExtractionService';
import { isExtractableResumeText } from '../services/resumeHistory';

/**
 * Restore a learner's real `resume_text` from the resume FILE already stored on their
 * onboarding profile.
 *
 * WHY THIS EXISTS. 14 profiles carry a `resume_text` that is not a resume but a
 * placeholder naming the uploaded file - `"[Uploaded file: EMERALD A resume 2023.docx]"`.
 * That placeholder is what made the history extractor invent careers (see
 * `isExtractableResumeText`), and it is why those learners have no Experience section.
 * For the subset that still has `resume_data`, the real document is sitting right there
 * in the same row and only needs parsing.
 *
 * WHAT IT DOES NOT DO, deliberately:
 *  - It does NOT re-run the full resume ingest. `ingestResumeFileText()` would rewrite
 *    `extracted` wholesale AND persist new CAPE skill claims, recomputing the learner's
 *    architecture radar. Moving somebody's radar is not a side effect a text-repair
 *    script should have. This writes ONE column.
 *  - It therefore does not produce the Experience section by itself. Run
 *    `backfillResumeHistory.ts` afterwards; with a real `resume_text` in place it now
 *    has something honest to read.
 *
 * IDEMPOTENT BY CONSTRUCTION. A row whose `resume_text` already passes
 * `isExtractableResumeText` is skipped, so a second run does nothing and costs nothing.
 * Nothing here calls an LLM, so a re-run is free in every sense.
 *
 * FAILURE-FIRST (root CLAUDE.md):
 *  1. On failure: per-row. A corrupt or unparseable document is counted and skipped; the
 *     rest of the batch still lands. One column, one statement, so no partial write.
 *  2. Retry: none internally. Re-running is the retry and is safe.
 *  3. Recovery: re-run. A row that failed still has its placeholder and is picked up again.
 *  4. Handled: no stored bytes, undecodable base64, a parser that throws, and extracted
 *     text that is still too short to be a resume (refused rather than written).
 *     NOT handled: the database being unavailable, which propagates and stops the run.
 *
 * Usage:
 *   node dist/scripts/backfillResumeTextFromFiles.js                  # dry run
 *   node dist/scripts/backfillResumeTextFromFiles.js --apply
 *   node dist/scripts/backfillResumeTextFromFiles.js --apply --enrollment=<id>
 */

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');

function argValue(name: string): string | null {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
}

const LIMIT = Number(argValue('limit')) || 0;
const ONLY_ENROLLMENT = argValue('enrollment');

async function main(): Promise<void> {
  const where: Record<string, unknown> = {};
  if (ONLY_ENROLLMENT) where.enrollment_id = ONLY_ENROLLMENT;
  const rows: any[] = await OnboardingProfile.findAll({ where } as any);

  let alreadyGood = 0;
  let noBytes = 0;
  const candidates: any[] = [];

  for (const row of rows) {
    const current = String(row.resume_text || '').trim();
    // Only rows whose stored text CANNOT be trusted are in scope. A learner with a real
    // resume_text is left completely alone.
    if (current && isExtractableResumeText(current)) { alreadyGood += 1; continue; }
    if (!row.resume_data || String(row.resume_data).length < 100) { noBytes += 1; continue; }
    candidates.push(row);
  }

  const work = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;

  console.log(JSON.stringify({
    event: 'backfill_resume_text_plan',
    mode: APPLY ? 'apply' : 'dry-run',
    profiles_total: rows.length,
    already_usable: alreadyGood,
    unusable_and_no_stored_file: noBytes,
    recoverable: candidates.length,
    will_process: work.length,
  }, null, 2));

  if (!work.length) {
    console.log('Nothing to do.');
    return;
  }

  let written = 0;
  let stillNotAResume = 0;
  let failed = 0;

  for (const row of work) {
    const id = row.enrollment_id;
    const fileName = String(row.resume_file_name || 'resume.pdf');
    try {
      const buffer = Buffer.from(String(row.resume_data), 'base64');
      // eslint-disable-next-line no-await-in-loop -- a handful of rows; sequential keeps
      // the parser's memory profile flat and the log readable.
      const text = String(await extractTextFromBuffer(buffer, fileName) || '').trim();

      // The same gate the extractor uses. If parsing produced something that still is
      // not a resume, writing it would only re-arm the fabrication this repairs.
      if (!isExtractableResumeText(text)) {
        stillNotAResume += 1;
        console.warn(JSON.stringify({
          event: 'backfill_resume_text_unusable',
          enrollment_id: id, file_name: fileName, chars: text.length,
        }));
        continue;
      }

      if (APPLY) {
        // eslint-disable-next-line no-await-in-loop -- one row at a time, see above.
        await row.update({ resume_text: text });
        written += 1;
      }
      console.log(JSON.stringify({
        event: 'backfill_resume_text_row',
        enrollment_id: id, file_name: fileName, chars: text.length, written: APPLY,
      }));
    } catch (err: any) {
      failed += 1;
      console.warn(JSON.stringify({
        event: 'backfill_resume_text_failed',
        enrollment_id: id, file_name: fileName,
        error_class: err?.error_class || err?.name || 'Error',
        message: err?.message,
      }));
    }
  }

  console.log(JSON.stringify({
    event: 'backfill_resume_text_done',
    mode: APPLY ? 'apply' : 'dry-run',
    processed: work.length,
    written,
    parsed_but_still_not_a_resume: stillNotAResume,
    failed,
    next_step: 'run backfillResumeHistory.js to read the restored text',
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfillResumeTextFromFiles failed:', err);
    process.exit(1);
  });
