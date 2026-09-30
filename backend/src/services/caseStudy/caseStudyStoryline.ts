/**
 * Case Study OS — the storyline: step 1 of the Studio.
 *
 * ONE SENTENCE STATES THE WHOLE CONTRACT OF THIS FILE: a storyline is
 * EDITORIAL DIRECTION AND NEVER A VERIFIED CLAIM.
 *
 * It is the human's answer to "what is the story?" — the angle, the audience,
 * the thing worth saying. It aims the draft generator and it tells the next
 * reviewer what this record was for. It is a prompt, not a source.
 *
 * HOW THAT IS GUARANTEED, AND IT IS NOT BY A RULE.
 *
 * The value is written to `case_study_storylines`, which is neither
 * `case_studies` nor `case_study_snapshots.content`. Two consequences follow
 * mechanically:
 *
 *   1. `caseStudyPublicProjection.ts` — the declared security boundary of the
 *      public API — reads snapshot content and a typed allowlist. It has no
 *      spread, no `Object.assign`, no `JSON.parse(JSON.stringify)`, and it
 *      never loads this table. There is no expression in that file which could
 *      evaluate to a storyline. Publishing one is not forbidden; it is
 *      unreachable.
 *   2. `collectNarrative` walks snapshot content to build the prose the publish
 *      gate scans. A storyline is not in snapshot content, so it is never
 *      scanned — and that is right rather than a hole. Scanning it would report
 *      an operator's own planning note ("show the 40% number if we can back
 *      it") as an unbacked public claim, which would train reviewers to ignore
 *      the gate.
 *
 * The one thing that must never happen is the storyline being copied verbatim
 * into `content`. `caseStudyStoryDraftGenerator.ts` is the only module that
 * reads it, and `caseStudyStorylineQuarantine.test.ts` proves by mutation that
 * it never emits it as a draft value.
 */

import { CaseStudyStoryline as StorylineModel } from '../../models';
import type { CaseStudyStoryline } from '../../types/caseStudyStory';
import { CaseStudyAdminError } from './caseStudyAdminStore';

/** Bounded like every other free-text field the Studio accepts. */
export const MAX_STORYLINE_CHARS = 4000;

export interface SaveStorylineInput {
  readonly caseStudyId: string;
  readonly text: string;
  readonly actor: string;
}

const toContract = (row: StorylineModel): CaseStudyStoryline => ({
  caseStudyId: row.case_study_id,
  text: row.storyline_text,
  authoredBy: row.authored_by,
  updatedAt: (row.updated_at ?? row.created_at).toISOString(),
});

/** The storyline for one record, or null when nobody has written one. */
export async function getStoryline(caseStudyId: string): Promise<CaseStudyStoryline | null> {
  const row = await StorylineModel.findByPk(caseStudyId);
  return row ? toContract(row) : null;
}

/**
 * Write or replace the storyline. IDEMPOTENT: the primary key is
 * `case_study_id`, so saving the same text twice leaves one row with the same
 * content, not two rows and not a second side effect. Re-running is the retry
 * strategy.
 *
 * There is deliberately no versioning here. A storyline is scaffolding for the
 * current draft, not a record of what was published — the snapshot chain is
 * where history lives, and giving direction its own version history would
 * invite reading it as part of the record.
 */
export async function saveStoryline(input: SaveStorylineInput): Promise<CaseStudyStoryline> {
  const text = String(input.text ?? '').trim();
  if (text.length === 0) {
    throw new CaseStudyAdminError('ValidationError', 'A storyline cannot be empty.', {
      field: 'text',
    });
  }
  if (text.length > MAX_STORYLINE_CHARS) {
    throw new CaseStudyAdminError(
      'ValidationError',
      `A storyline is capped at ${MAX_STORYLINE_CHARS} characters.`,
      { field: 'text', length: text.length, max: MAX_STORYLINE_CHARS },
    );
  }

  const existing = await StorylineModel.findByPk(input.caseStudyId);
  if (existing) {
    existing.storyline_text = text;
    existing.authored_by = input.actor;
    await existing.save();
    return toContract(existing);
  }

  const created = await StorylineModel.create({
    case_study_id: input.caseStudyId,
    storyline_text: text,
    authored_by: input.actor,
  });
  return toContract(created);
}

/**
 * Remove the direction. Returns whether a row was there, so the caller can tell
 * "cleared it" from "there was nothing to clear" rather than reporting success
 * for both.
 */
export async function clearStoryline(caseStudyId: string): Promise<{ cleared: boolean }> {
  const removed = await StorylineModel.destroy({ where: { case_study_id: caseStudyId } });
  return { cleared: removed > 0 };
}
