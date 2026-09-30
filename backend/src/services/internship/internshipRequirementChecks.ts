import type InternshipInterviewResponse from '../../models/InternshipInterviewResponse';

/**
 * Deterministic green/red on the internship's stated requirements.
 *
 * These come straight from the applicant's own answers to specific questions —
 * no model, no interpretation — so a reviewer can trust them at a glance. The AI
 * summary and recommendation are built ON TOP of these, never instead of them: a
 * language model is the wrong tool for "did they say yes to the 25-hour question".
 *
 * `met` (green) / `not_met` (red) / `unclear` (amber, e.g. skipped or never asked).
 */
export type RequirementStatus = 'met' | 'not_met' | 'unclear';

export interface RequirementCheck {
  key: string;
  /** What the reviewer reads. */
  label: string;
  status: RequirementStatus;
  /** The applicant's own answer, quoted, when there is one. */
  evidence: string | null;
}

type AnswerRow = Pick<InternshipInterviewResponse, 'question_key' | 'answer_text' | 'answer_value' | 'state'>;

/** yes / no / unknown from a yes_no answer, tolerant of how it was stored or transcribed. */
function yesNo(a: AnswerRow | undefined): 'yes' | 'no' | 'unknown' {
  if (!a || a.state === 'skipped' || a.state === 'not_asked') return 'unknown';
  const v = a.answer_value;
  if (v === true) return 'yes';
  if (v === false) return 'no';
  const s = String(v ?? a.answer_text ?? '').trim().toLowerCase();
  if (['yes', 'true', 'y', '1'].includes(s)) return 'yes';
  if (['no', 'false', 'n', '0'].includes(s)) return 'no';
  return 'unknown';
}

function choice(a: AnswerRow | undefined): string | null {
  if (!a || a.state === 'skipped' || a.state === 'not_asked') return null;
  const s = String(a.answer_value ?? a.answer_text ?? '').trim().toLowerCase();
  return s || null;
}

function evidenceOf(a: AnswerRow | undefined): string | null {
  if (!a) return null;
  if (a.state === 'skipped') return '(skipped)';
  const v = a.answer_value;
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return a.answer_text || (v != null ? String(v) : null);
}

/** A yes_no requirement: yes → met, no → not_met, anything else → unclear. */
function yesNoRequirement(key: string, label: string, a: AnswerRow | undefined): RequirementCheck {
  const answer = yesNo(a);
  return {
    key,
    label,
    status: answer === 'yes' ? 'met' : answer === 'no' ? 'not_met' : 'unclear',
    evidence: evidenceOf(a),
  };
}

/**
 * The requirements, checked against the answers. Order is the order a reviewer
 * would want to scan: the eligibility gates first, then the acknowledgements.
 */
export function checkRequirements(answers: Map<string, AnswerRow>): RequirementCheck[] {
  const emp = choice(answers.get('employment_status'));
  const employmentCheck: RequirementCheck = {
    key: 'not_employed_fulltime',
    label: 'Not employed full-time',
    status: emp == null ? 'unclear' : emp === 'full_time' ? 'not_met' : 'met',
    evidence: evidenceOf(answers.get('employment_status')),
  };

  return [
    employmentCheck,
    yesNoRequirement('weekly_hours', 'Can commit 25+ hours a week', answers.get('weekly_hours_commitment')),
    yesNoRequirement('attend_meetings', 'Can attend the required meetings', answers.get('can_attend_meetings')),
    yesNoRequirement('will_notify_absence', 'Will notify the team before missing a meeting', answers.get('will_notify_absence')),
    yesNoRequirement('has_tools', 'Has, or will get, Claude Code + an API key with billing', answers.get('tools_ready_or_will_obtain')),
    yesNoRequirement('understands_costs', 'Understands they pay for the tools (~$30/mo)', answers.get('costs_understood')),
    yesNoRequirement('protects_secrets', 'Will never share keys/secrets with staff or this site', answers.get('tools_secrets_ack')),
    yesNoRequirement('agrees_expectations', 'Agrees to the internship expectations', answers.get('agrees_to_expectations')),
  ];
}

/** A compact summary of where the requirements stand, for the recommendation and the fallback. */
export function requirementTally(checks: RequirementCheck[]): { met: number; not_met: number; unclear: number; total: number } {
  return {
    met: checks.filter((c) => c.status === 'met').length,
    not_met: checks.filter((c) => c.status === 'not_met').length,
    unclear: checks.filter((c) => c.status === 'unclear').length,
    total: checks.length,
  };
}
