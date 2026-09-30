// ─── Architect Evaluation Agent ────────────────────────────────────────────────
// Runs weekly (Saturday 6 AM UTC via schedulerService).
// For each active enrollment: reads ProjectDna + StudentGithubActivity + lesson
// progress + this week's completed Mock Interview score, calls the LLM to
// score the project and generate next steps, then upserts one row into
// architect_evaluations keyed on (enrollment_id, week_number).
//
// week_number is the student's own curriculum week (1-12, derived from their
// cohort's start_date via curriculumWeekNumber()) — NOT the calendar week of
// the year. Fixed as part of BC #10088637794: the prior isoWeekNumber()
// implementation used the calendar week, which almost never lines up with
// the fixed 12-week program's own numbering (interview rubrics, lessons,
// etc.), so the new interview join would otherwise have silently never
// matched a real session in production.
//
// Idempotent: re-running the same week updates the existing row.
// Fail-soft: one enrollment's failure does not abort others.

import { randomUUID } from 'crypto';
import Enrollment from '../../models/Enrollment';
import Cohort from '../../models/Cohort';
import ProjectDna from '../../models/ProjectDna';
import StudentGithubActivity from '../../models/StudentGithubActivity';
import ArchitectEvaluation from '../../models/ArchitectEvaluation';
import LessonInstance from '../../models/LessonInstance';
import InterviewSession from '../../models/InterviewSession';
import { chatCompletion } from '../../intelligence/assistant/openaiHelper';

const AGENT_NAME = 'ArchitectEvaluationAgent';

interface EvaluationOutput {
  overall_score: number;
  progress_summary: string;
  strengths: string[];
  next_steps: string[];
  technical_gaps: string[];
}

// Pure, deterministic blend used on the rule-based fallback path (LLM
// unavailable) — BC #10088637794. Weighted toward coursework progress since
// the interview is a single weekly checkpoint, not the whole picture. Missing
// interview data degrades cleanly to the pre-existing lesson-only behavior.
export function blendOverallScore(lessonCompletionPct: number, interviewScore: number | null): number {
  if (interviewScore === null) return lessonCompletionPct;
  return Math.round(lessonCompletionPct * 0.7 + interviewScore * 0.3);
}

// Curriculum week (1-12), not calendar-year ISO week — BC #10088637794 found
// this agent was previously scoring every enrollment against the calendar
// week of the year (e.g. 29 in mid-July), which never lines up with the
// fixed 12-week program's own week numbering (interview rubrics, lesson
// content, etc. are all keyed 1-12). Derived per-enrollment from the
// student's own cohort start_date so cohorts starting on different dates
// each get their own correct week. Falls back to week 1 if the enrollment
// has no cohort/start_date on record (never throws — a missing cohort
// shouldn't crash the whole weekly batch).
export async function curriculumWeekNumber(enrollmentId: string): Promise<number> {
  const enrollment = await Enrollment.findByPk(enrollmentId, {
    include: [{ model: Cohort, as: 'cohort', attributes: ['start_date'] }],
  });
  const startDateRaw = (enrollment as any)?.cohort?.start_date;
  if (!startDateRaw) return 1;

  const startDate = new Date(startDateRaw);
  const daysElapsed = Math.floor((Date.now() - startDate.getTime()) / 86400000);
  const week = Math.floor(daysElapsed / 7) + 1;
  return Math.min(12, Math.max(1, week));
}

function log(level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'backend',
    event,
    context: ctx,
  }));
}

export async function evaluateOneEnrollment(enrollmentId: string, weekNumber: number): Promise<void> {
  const [dna, github, instances, interview] = await Promise.all([
    ProjectDna.findOne({ where: { enrollment_id: enrollmentId } }),
    StudentGithubActivity.findOne({ where: { enrollment_id: enrollmentId } }),
    LessonInstance.findAll({ where: { enrollment_id: enrollmentId } }),
    InterviewSession.findOne({ where: { enrollment_id: enrollmentId, week_number: weekNumber, status: 'completed' } }),
  ]);

  const completed = instances.filter((l: any) => l.status === 'completed').length;
  const total = instances.length;
  // total_score is a FLOAT (0-100 percentage); rounded so it composes cleanly
  // with the integer overall_score. Only a 'completed' session counts —
  // in_progress/pending sessions have no score yet, treated same as missing.
  const interviewScore = interview && interview.total_score !== null ? Math.round(interview.total_score) : null;

  const dnaBlock = dna
    ? `Project DNA:\n- Problem: ${(dna as any).business_problem}\n- Target user: ${(dna as any).target_user}\n- Industry: ${(dna as any).industry} (${(dna as any).orientation} / ${(dna as any).focus})\n- AI components: ${((dna as any).ai_components || []).join(', ')}\n- Data sources: ${((dna as any).data_sources || []).join(', ')}`
    : 'No Project DNA defined.';

  const githubBlock = github
    ? `GitHub (last 7d): ${(github as any).commits_last_7d ?? 0} commits, ${(github as any).open_prs ?? 0} open PRs`
    : 'No GitHub repo connected.';

  const interviewBlock = interviewScore !== null
    ? `Mock Interview (week ${weekNumber}): scored ${interviewScore}/100.`
    : 'No mock interview completed for this week.';

  const systemPrompt = `You are the Architect Evaluation Agent for the Colaberry AI Systems Architect Accelerator (12-week program for enterprise professionals building production AI systems).

Evaluate a student's project progress at week ${weekNumber} and return JSON only — no prose before or after:
{
  "overall_score": <integer 0-100>,
  "progress_summary": "<2-3 sentences: honest, direct, specific — not generic praise>",
  "strengths": ["<specific strength>", "<specific strength>"],
  "next_steps": ["<concrete action step 1>", "<concrete action step 2>", "<concrete action step 3>"],
  "technical_gaps": ["<gap 1>", "<gap 2>"]
}

If Project DNA is missing, that is the highest-priority gap. If no GitHub is connected, flag it. Weigh this week's mock interview score as one input among the others, not the sole determinant. Score 0-30 for no project started, 30-60 for early work, 60-80 for solid progress, 80-100 for strong execution.`;

  const userPrompt = `Week ${weekNumber}. Curriculum: ${completed}/${total} lessons done.\n\n${dnaBlock}\n\n${githubBlock}\n\n${interviewBlock}`;

  const raw = await chatCompletion(systemPrompt, userPrompt, { json: true, maxTokens: 600, temperature: 0.2 });

  let output: EvaluationOutput;
  if (raw) {
    output = JSON.parse(raw) as EvaluationOutput;
  } else {
    // LLM unavailable — rule-based fallback so the row still lands
    const lessonPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const pct = blendOverallScore(lessonPct, interviewScore);
    output = {
      overall_score: pct,
      progress_summary: `Week ${weekNumber}: ${completed}/${total} lessons completed (${lessonPct}%).${interviewScore !== null ? ` Mock interview scored ${interviewScore}/100.` : ''}${!dna ? ' No Project DNA defined — complete the wizard.' : ''}${!github ? ' No GitHub repo connected.' : ''}`,
      strengths: completed > 0 ? ['Curriculum progress underway'] : [],
      next_steps: [
        ...(!dna ? ['Complete Project DNA wizard at /portal/project-builder'] : []),
        ...(!github ? ['Connect GitHub repo via /portal/project/builder'] : []),
        ...(interviewScore === null ? [`Complete the week ${weekNumber} mock interview`] : []),
        'Continue the next available curriculum lesson',
      ],
      technical_gaps: [
        ...(!dna ? ['Project DNA not defined'] : []),
        ...(!github ? ['No GitHub activity tracked'] : []),
      ],
    };
  }

  // Idempotent upsert: update if this week's row already exists, create if not
  const existing = await ArchitectEvaluation.findOne({
    where: { enrollment_id: enrollmentId, week_number: weekNumber },
  });

  const payload = {
    overall_score:    output.overall_score,
    interview_score:  interviewScore,
    progress_summary: output.progress_summary,
    strengths:        output.strengths || [],
    next_steps:       output.next_steps || [],
    technical_gaps:   output.technical_gaps || [],
    raw_response:     raw ? (JSON.parse(raw) as Record<string, unknown>) : null,
    evaluated_at:     new Date(),
  };

  if (existing) {
    await existing.update(payload);
  } else {
    await ArchitectEvaluation.create({
      id:            randomUUID(),
      enrollment_id: enrollmentId,
      week_number:   weekNumber,
      created_at:    new Date(),
      ...payload,
    } as any);
  }

  log('info', 'architect_evaluation_complete', {
    enrollment_id:     enrollmentId,
    week_number:       weekNumber,
    overall_score:     output.overall_score,
    interview_score:   interviewScore,
    lessons_completed: completed,
    has_dna:           !!dna,
    has_github:        !!github,
  });
}

export async function runArchitectEvaluationAgent(): Promise<{ evaluated: number; errors: number }> {
  const activeEnrollments = await Enrollment.findAll({
    where: { status: 'active', portal_enabled: true },
    attributes: ['id'],
  });

  let evaluated = 0;
  let errors = 0;

  for (const enrollment of activeEnrollments) {
    const enrollmentId = (enrollment as any).id;
    try {
      // Computed per-enrollment, not once for the whole batch — different
      // cohorts start on different dates, so "week N" differs per student.
      const weekNumber = await curriculumWeekNumber(enrollmentId);
      await evaluateOneEnrollment(enrollmentId, weekNumber);
      evaluated++;
    } catch (err: any) {
      errors++;
      log('error', 'architect_evaluation_enrollment_failed', {
        enrollment_id: enrollmentId,
        error:         err.message,
        error_class:   err.name || 'UnknownError',
      });
    }
  }

  log('info', 'architect_evaluation_batch_complete', { evaluated, errors });
  return { evaluated, errors };
}

export async function getLatestEvaluation(enrollmentId: string): Promise<ArchitectEvaluation | null> {
  return ArchitectEvaluation.findOne({
    where: { enrollment_id: enrollmentId },
    order: [['week_number', 'DESC']],
  });
}
