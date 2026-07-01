/**
 * studentOpsRoutes — student-facing CB-System operating model.
 *
 * Adapts the employee ops machinery (services/ops/priorityEngineService,
 * runMyDayPromptService, approvalService) for students. Work source is
 * RequirementsMap (native student tasks), not Basecamp todos.
 *
 * Phase 1 endpoints:
 *   GET  /api/portal/student-ops/my-queue  — ranked requirement queue + Claude Code prompts
 *   POST /api/portal/student-ops/decide    — mark done or flag blocker
 */
import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { Op } from 'sequelize';
import { requireParticipant } from '../middlewares/participantAuth';
import { getProjectByEnrollment } from '../services/projectService';
import RequirementsMap from '../models/RequirementsMap';

const router = Router();

// ---------------------------------------------------------------------------
// Urgency scoring (deterministic, mirrors priorityEngineService pattern)
// ---------------------------------------------------------------------------

type ReqCategory = 'build' | 'integrate' | 'deploy' | 'test' | 'design' | 'default';

const STATUS_BASE: Record<string, number> = {
  unmatched: 60,
  unmapped:  60,
  partial:   35,
  matched:   20,
  planned:   15,
};

const STALE_BONUS = (updatedAt: Date): number => {
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000);
  if (days > 14) return 20;
  if (days > 7)  return 12;
  if (days > 3)  return 6;
  return 0;
};

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; cat: ReqCategory; bonus: number }> = [
  { pattern: /\b(deploy|hosting|docker|infrastructure|cloud|production|VPS)\b/i, cat: 'deploy',    bonus: 8 },
  { pattern: /\b(test|testing|coverage|spec|jest|playwright)\b/i,                cat: 'test',      bonus: 5 },
  { pattern: /\b(integrate|API|webhook|oauth|github|connection)\b/i,             cat: 'integrate', bonus: 6 },
  { pattern: /\b(design|UI|UX|layout|component|style|CSS)\b/i,                   cat: 'design',    bonus: 3 },
  { pattern: /\b(build|implement|create|develop|feature|logic|service)\b/i,      cat: 'build',     bonus: 4 },
];

function classify(text: string): { cat: ReqCategory; bonus: number } {
  for (const { pattern, cat, bonus } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return { cat, bonus };
  }
  return { cat: 'default', bonus: 0 };
}

function scoreRequirement(req: RequirementsMap): { urgency: number; cat: ReqCategory } {
  const base = STATUS_BASE[req.status] ?? 10;
  const stale = STALE_BONUS(req.updated_at);
  const { cat, bonus } = classify(`${req.requirement_key} ${req.requirement_text}`);
  return { urgency: Math.min(100, base + stale + bonus), cat };
}

// ---------------------------------------------------------------------------
// Claude Code prompt generation (deterministic templates, no LLM)
// ---------------------------------------------------------------------------

const PROMPT_TEMPLATES: Record<ReqCategory, (text: string) => string> = {
  build: (text) =>
    `claude --project . "Implement this requirement: ${text}\\n\\nSteps:\\n1. Read the existing codebase to understand patterns.\\n2. Implement the requirement following those patterns.\\n3. Write a brief test if logic is non-trivial.\\n4. Commit with message: feat: <what you built>"`,
  integrate: (text) =>
    `claude --project . "Wire up this integration: ${text}\\n\\nSteps:\\n1. Check if any relevant env vars or credentials are already configured.\\n2. Implement the integration with a timeout and error handler.\\n3. Test the happy path locally.\\n4. Commit: feat: integrate <service name>"`,
  deploy: (text) =>
    `claude --project . "Set up deployment for: ${text}\\n\\nSteps:\\n1. Review the current Dockerfile and docker-compose if present.\\n2. Add or update the deploy configuration.\\n3. Test the container builds cleanly (docker build .).\\n4. Commit: chore: add deployment config for <service>"`,
  test: (text) =>
    `claude --project . "Write tests for: ${text}\\n\\nSteps:\\n1. Identify the function or module to test.\\n2. Write happy-path + one failure-path test.\\n3. Run tests locally to confirm they pass.\\n4. Commit: test: add coverage for <what you tested>"`,
  design: (text) =>
    `claude --project . "Build the UI for: ${text}\\n\\nSteps:\\n1. Identify the component or page that needs this design work.\\n2. Implement the layout using existing component patterns (no new design system).\\n3. Check that it renders correctly on a 1280px viewport.\\n4. Commit: feat(ui): <what you built>"`,
  default: (text) =>
    `claude --project . "Complete this requirement: ${text}\\n\\nSteps:\\n1. Read the codebase to understand context.\\n2. Implement the requirement.\\n3. Verify it works as described.\\n4. Commit your changes with a descriptive message."`,
};

function buildPrompt(text: string, cat: ReqCategory): string {
  return PROMPT_TEMPLATES[cat](text.replace(/"/g, '\\"'));
}

// ---------------------------------------------------------------------------
// GET /api/portal/student-ops/my-queue
// ---------------------------------------------------------------------------

export interface StudentQueueItemShape {
  id: string;
  requirement_key: string;
  requirement_text: string;
  status: string;
  urgency_score: number;
  category: ReqCategory;
  claude_code_prompt: string;
  github_file_paths: string[];
  rank: number;
}

router.get('/api/portal/student-ops/my-queue', requireParticipant, async (req: Request, res: Response) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
  try {
    const enrollmentId = req.participant!.sub;
    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) {
      res.json({ items: [], total: 0, project_id: null, generated_at: new Date().toISOString() });
      return;
    }

    const DONE_STATUSES = ['verified', 'auto_verified'];
    const rows = await RequirementsMap.findAll({
      where: {
        project_id: project.id,
        is_active: { [Op.ne]: false },
        status: { [Op.notIn]: DONE_STATUSES },
      },
      order: [['updated_at', 'ASC']],
      limit: 50,
    });

    const scored = rows
      .map((r) => {
        const { urgency, cat } = scoreRequirement(r);
        return {
          id: r.id,
          requirement_key: r.requirement_key,
          requirement_text: r.requirement_text,
          status: r.status,
          urgency_score: urgency,
          category: cat,
          claude_code_prompt: buildPrompt(r.requirement_text, cat),
          github_file_paths: r.github_file_paths || [],
        };
      })
      .sort((a, b) => b.urgency_score - a.urgency_score)
      .slice(0, 20)
      .map((item, i) => ({ ...item, rank: i + 1 }));

    res.json({
      items: scored,
      total: scored.length,
      project_id: project.id,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend',
      event: 'student_queue_fetch_failed', correlation_id: correlationId,
      outcome: 'failure', error_class: err.constructor?.name ?? 'Error',
      context: { message: err.message },
    }));
    res.status(500).json({ error: 'Failed to load student queue' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/portal/student-ops/decide
// ---------------------------------------------------------------------------

const decideSchema = z.object({
  requirement_id: z.string().uuid(),
  decision: z.enum(['done', 'flag_blocker']),
  note: z.string().max(500).optional(),
});

router.post('/api/portal/student-ops/decide', requireParticipant, async (req: Request, res: Response) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
  const parse = decideSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  try {
    const enrollmentId = req.participant!.sub;
    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) {
      res.status(404).json({ error: 'No active project found' });
      return;
    }

    const req_ = await RequirementsMap.findOne({
      where: { id: parse.data.requirement_id, project_id: project.id },
    });
    if (!req_) {
      res.status(404).json({ error: 'Requirement not found' });
      return;
    }

    if (parse.data.decision === 'done') {
      await req_.update({ status: 'verified', verification_notes: parse.data.note ?? undefined });
    } else {
      // flag_blocker → revert to unmatched so it resurfaces at top of queue with a note
      await req_.update({ status: 'unmatched', verification_notes: parse.data.note ?? undefined });
    }

    res.json({ ok: true, id: req_.id, new_status: req_.status });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend',
      event: 'student_ops_decide_failed', correlation_id: correlationId,
      outcome: 'failure', error_class: err.constructor?.name ?? 'Error',
      context: { message: err.message },
    }));
    res.status(500).json({ error: 'Failed to record decision' });
  }
});

export default router;
