import type { Blockers } from './caseStudyPublishRules';
import { CASE_STUDY_MATURITIES, type CaseStudyMaturity } from '../sbp/caseStudyHypothesis';

/**
 * caseStudyPublishMaturityRule - the line between a build record and a case
 * study, drawn in the gate. PURE.
 *
 * Unified Project Discovery, Phase 7. A Case Study record linked to a student
 * project carries that project's computed maturity into the gate. Two rules:
 *
 *   maturity_below_operational_result   nothing has been measured in use, so
 *                                       whatever the narrative says, this is
 *                                       a build record or a demonstration, and
 *                                       it is refused as a case study
 *   project_truth_has_open_questions    a story found something that disagrees
 *                                       with what the student confirmed, and
 *                                       nobody has settled it; the truth
 *                                       disagrees with itself
 *
 * Both are no-ops when the input carries no foundation, which is every Case
 * Study about no student project and every one whose project's intake never
 * ran. An additive rule must not refuse the library it was added to.
 *
 * `via` says how the project was found. `linked` is `case_studies.project_id`.
 * `repository` is a record with no `project_id` whose cited repository belongs
 * to a student project (`caseStudyProjectResolution.ts`): before 2026-09-14
 * that record skipped this rule entirely, which made `from-repositories` a
 * way to publish a build record as a case study. The message names the route
 * so an admin reading the refusal is not told about a link they never made.
 */

export interface PublishFoundation {
  readonly maturity: CaseStudyMaturity;
  readonly openQuestions: number;
  readonly via?: 'linked' | 'repository';
}

export const PUBLISHABLE_FROM: CaseStudyMaturity = 'operational_result';

const rung = (m: CaseStudyMaturity): number => CASE_STUDY_MATURITIES.indexOf(m);

const subject = (f: PublishFoundation): string =>
  f.via === 'repository' ? 'the student project this record\'s repository belongs to' : 'the linked project';

export function ruleMaturity(foundation: PublishFoundation | null | undefined, b: Blockers): void {
  if (!foundation) return;

  if (rung(foundation.maturity) < rung(PUBLISHABLE_FROM)) {
    b.add(
      'maturity_below_operational_result',
      'project.maturity',
      `${subject(foundation)} is at "${foundation.maturity}", below "${PUBLISHABLE_FROM}": nothing has been measured in real use, so this is a build record or a demonstration, not a case study`,
      'record an outcome through an approved measurement definition, confirmed by the client; a passing build or a demo cannot stand in for one',
    );
  }

  if (foundation.openQuestions > 0) {
    b.add(
      'project_truth_has_open_questions',
      'project.truth.openQuestions',
      `${foundation.openQuestions} ${foundation.openQuestions === 1 ? 'question a story raised is' : 'questions stories raised are'} unsettled: the project's truth disagrees with itself`,
      'settle each question on the project review screen so the truth says one thing before it is written up',
    );
  }
}
