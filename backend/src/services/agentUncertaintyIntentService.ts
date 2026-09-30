import { Op } from 'sequelize';
import StudentAssessment from '../models/StudentAssessment';
import Enrollment from '../models/Enrollment';
import type AiAgent from '../models/AiAgent';

/**
 * agentUncertaintyIntentService — Reese Agentic AI Employee mission,
 * Capability 7's manager question "What are you uncertain about?". Same
 * deterministic pre-check shape as agentWorkStatusIntentService.ts, added
 * as a sibling module (not a 3rd branch of that file) because the real data
 * source here — StudentAssessment, not Ticket — is genuinely different, and
 * "work status" isn't the right name for an assessment-uncertainty query.
 *
 * Answers only for an agent that actually runs assessments (declared via
 * tools_granted containing 'assess_student_health') — StudentAssessment has
 * no per-agent ownership column today (only Reese's reply pipeline ever
 * calls assessStudentHealth()), so answering for an unrelated agent would
 * either fabricate a false "nothing" or misattribute Reese's own
 * uncertainty to someone else's roster.
 */

const TRIGGER_PHRASES = [
  'what are you uncertain about',
  "what're you uncertain about",
  'what are you unsure about',
  "what don't you know",
  'what do you not know',
  'what are you unclear on',
];

export function detectUncertaintyQuery(messageText: string): boolean {
  const lower = messageText.toLowerCase();
  return TRIGGER_PHRASES.some((p) => lower.includes(p));
}

/** How far back "currently uncertain" looks. Matches the widest real
 * reassessment cadence (evidenceAssembly.ts's REASSESSMENT_DAYS tops out at
 * 30 for on_track) closely enough without a second join against each
 * enrollment's own reassessment_date — a deliberate, disclosed
 * approximation, not a precise "is this still the live assessment" check. */
const RECENT_DAYS = 14;
const MAX_LISTED = 5;

interface UncertainRow {
  enrollment_id: string;
  requires_human_review: boolean;
  unanswered_questions: string[];
}

/** Most recent assessment per enrollment, within the recency window, kept
 * in JS (not a SQL window function) to match this codebase's existing
 * query style for this module. */
function latestPerEnrollment(rows: UncertainRow[]): UncertainRow[] {
  const seen = new Set<string>();
  const latest: UncertainRow[] = [];
  for (const row of rows) {
    if (seen.has(row.enrollment_id)) continue;
    seen.add(row.enrollment_id);
    latest.push(row);
  }
  return latest;
}

export async function buildUncertaintyReply(agent: AiAgent): Promise<string> {
  if (!agent.tools_granted?.includes('assess_student_health')) {
    return `${agent.agent_name} doesn't run health assessments, so there's nothing to report here.`;
  }

  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const rows = (await StudentAssessment.findAll({
    where: { createdAt: { [Op.gte]: since } },
    order: [['created_at', 'DESC']],
    attributes: ['enrollment_id', 'requires_human_review', 'unanswered_questions'],
  })) as unknown as UncertainRow[];

  const uncertain = latestPerEnrollment(rows).filter(
    (r) => r.requires_human_review || (r.unanswered_questions && r.unanswered_questions.length > 0),
  );

  if (uncertain.length === 0) return "Nothing I'm currently uncertain about — every recent assessment came back with a clear picture.";

  const enrollments = await Enrollment.findAll({
    where: { id: { [Op.in]: uncertain.map((r) => r.enrollment_id) } },
    attributes: ['id', 'full_name'],
  });
  const nameById = new Map(enrollments.map((e: any) => [e.id, e.full_name]));

  const lines = uncertain.slice(0, MAX_LISTED).map((r) => {
    const name = nameById.get(r.enrollment_id) || r.enrollment_id;
    const question = r.unanswered_questions?.[0] ? ` — ${r.unanswered_questions[0]}` : '';
    return `- ${name}${question}`;
  }).join('\n');
  const remainder = uncertain.length - MAX_LISTED;
  const more = remainder > 0 ? `\n...and ${remainder} more.` : '';

  return `${uncertain.length} I'm uncertain about:\n${lines}${more}`;
}
