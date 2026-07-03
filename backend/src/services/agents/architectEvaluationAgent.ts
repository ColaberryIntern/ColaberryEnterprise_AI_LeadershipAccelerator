// ─── Architect Evaluation Agent ────────────────────────────────────────────────
// Runs weekly (Saturday 6 AM UTC via schedulerService).
// For each active enrollment: reads ProjectDna + StudentGithubActivity + lesson
// progress, calls the LLM to score the project and generate next steps, then
// upserts one row into architect_evaluations keyed on (enrollment_id, week_number).
//
// Idempotent: re-running the same week updates the existing row.
// Fail-soft: one enrollment's failure does not abort others.

import { randomUUID } from 'crypto';
import Enrollment from '../../models/Enrollment';
import ProjectDna from '../../models/ProjectDna';
import StudentGithubActivity from '../../models/StudentGithubActivity';
import ArchitectEvaluation from '../../models/ArchitectEvaluation';
import LessonInstance from '../../models/LessonInstance';
import { chatCompletion } from '../../intelligence/assistant/openaiHelper';

const AGENT_NAME = 'ArchitectEvaluationAgent';

interface EvaluationOutput {
  overall_score: number;
  progress_summary: string;
  strengths: string[];
  next_steps: string[];
  technical_gaps: string[];
}

function isoWeekNumber(): number {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
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

async function evaluateOneEnrollment(enrollmentId: string, weekNumber: number): Promise<void> {
  const [dna, github, instances] = await Promise.all([
    ProjectDna.findOne({ where: { enrollment_id: enrollmentId } }),
    StudentGithubActivity.findOne({ where: { enrollment_id: enrollmentId } }),
    LessonInstance.findAll({ where: { enrollment_id: enrollmentId } }),
  ]);

  const completed = instances.filter((l: any) => l.status === 'completed').length;
  const total = instances.length;

  const dnaBlock = dna
    ? `Project DNA:\n- Problem: ${(dna as any).business_problem}\n- Target user: ${(dna as any).target_user}\n- Industry: ${(dna as any).industry} (${(dna as any).orientation} / ${(dna as any).focus})\n- AI components: ${((dna as any).ai_components || []).join(', ')}\n- Data sources: ${((dna as any).data_sources || []).join(', ')}`
    : 'No Project DNA defined.';

  const githubBlock = github
    ? `GitHub (last 7d): ${(github as any).commits_last_7d ?? 0} commits, ${(github as any).open_prs ?? 0} open PRs`
    : 'No GitHub repo connected.';

  const systemPrompt = `You are the Architect Evaluation Agent for the Colaberry AI Systems Architect Accelerator (12-week program for enterprise professionals building production AI systems).

Evaluate a student's project progress at week ${weekNumber} and return JSON only — no prose before or after:
{
  "overall_score": <integer 0-100>,
  "progress_summary": "<2-3 sentences: honest, direct, specific — not generic praise>",
  "strengths": ["<specific strength>", "<specific strength>"],
  "next_steps": ["<concrete action step 1>", "<concrete action step 2>", "<concrete action step 3>"],
  "technical_gaps": ["<gap 1>", "<gap 2>"]
}

If Project DNA is missing, that is the highest-priority gap. If no GitHub is connected, flag it. Score 0-30 for no project started, 30-60 for early work, 60-80 for solid progress, 80-100 for strong execution.`;

  const userPrompt = `Week ${weekNumber}. Curriculum: ${completed}/${total} lessons done.\n\n${dnaBlock}\n\n${githubBlock}`;

  const raw = await chatCompletion(systemPrompt, userPrompt, { json: true, maxTokens: 600, temperature: 0.2 });

  let output: EvaluationOutput;
  if (raw) {
    output = JSON.parse(raw) as EvaluationOutput;
  } else {
    // LLM unavailable — rule-based fallback so the row still lands
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    output = {
      overall_score: pct,
      progress_summary: `Week ${weekNumber}: ${completed}/${total} lessons completed (${pct}%).${!dna ? ' No Project DNA defined — complete the wizard.' : ''}${!github ? ' No GitHub repo connected.' : ''}`,
      strengths: completed > 0 ? ['Curriculum progress underway'] : [],
      next_steps: [
        ...(!dna ? ['Complete Project DNA wizard at /portal/project-builder'] : []),
        ...(!github ? ['Connect GitHub repo via /portal/project/builder'] : []),
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
    lessons_completed: completed,
    has_dna:           !!dna,
    has_github:        !!github,
  });
}

export async function runArchitectEvaluationAgent(): Promise<{ evaluated: number; errors: number }> {
  const weekNumber = isoWeekNumber();
  const activeEnrollments = await Enrollment.findAll({
    where: { status: 'active', portal_enabled: true },
    attributes: ['id'],
  });

  let evaluated = 0;
  let errors = 0;

  for (const enrollment of activeEnrollments) {
    try {
      await evaluateOneEnrollment((enrollment as any).id, weekNumber);
      evaluated++;
    } catch (err: any) {
      errors++;
      log('error', 'architect_evaluation_enrollment_failed', {
        enrollment_id: (enrollment as any).id,
        week_number:   weekNumber,
        error:         err.message,
        error_class:   err.name || 'UnknownError',
      });
    }
  }

  log('info', 'architect_evaluation_batch_complete', { week_number: weekNumber, evaluated, errors });
  return { evaluated, errors };
}

export async function getLatestEvaluation(enrollmentId: string): Promise<ArchitectEvaluation | null> {
  return ArchitectEvaluation.findOne({
    where: { enrollment_id: enrollmentId },
    order: [['week_number', 'DESC']],
  });
}
