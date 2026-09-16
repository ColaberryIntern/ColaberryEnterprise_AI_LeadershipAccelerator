// ─── Curriculum QA Agent / scan_curriculum_integrity ────────────────────────
// On-demand (dispatched via ticket dispatch). Validates curriculum integrity
// by walking lesson sequences, checking content existence, and verifying
// gating logic.
//
// AI Employee Consolidation Program, Employee #1 (Curriculum/Dara), Phase 4
// — TOOL_CAPABILITY_DESIGN_v1.md B3.3 (independently plan-audited 20/20
// PASS): this scanner used to open a `bug` ticket at `PlatformFixAgent` for
// every issue found (mis-routed — a curriculum content finding has nothing
// to do with the Platform domain), and that write was blocked anyway by
// Discovery F1 (`enforceReportsToGate` throws — this row had no `reports_to`
// until Dara's registry entry absorbed it). Confirmed via BASELINE_2026-09-15.md:
// zero `agent_runs` ever for this agent, so removing the ticket write changes
// no observed production behavior. `scanCurriculumIntegrity()` is now the
// real tool contract — it READS and RETURNS findings, it does not WRITE
// anything. `runCurriculumQAAgent()` is kept only because
// `workGraph/capabilityRegistry.ts`'s `curriculum.qa_check` capability entry
// still calls it expecting an `AgentExecutionResult` — it now delegates to
// `scanCurriculumIntegrity()` and adapts the shape, with no ticket creation.

import { CurriculumModule, CurriculumLesson, ArtifactDefinition, MiniSection } from '../../models';
import type { AgentExecutionResult, AgentAction } from './types';
import { logAgentActivity } from '../agentBlueprint/agentActivityLogService';
import { getDaraAgentId } from '../curriculum/daraIdentitySeed';

const AGENT_NAME = 'CurriculumQAAgent';

/** The real, structured finding shape `scan_curriculum_integrity` returns —
 * a typed array, not a free-text string, so a caller (the Talk tab today; a
 * future scheduled digest later) can render it structurally. Two severities
 * only (not the old 4-level ticket-priority scale, which existed to set a
 * ticket's `priority` — a concept that no longer applies once this tool
 * creates no tickets): `warn` for a real structural problem (missing title,
 * a module with no lessons, no content at all), `info` for something worth
 * knowing but not necessarily a defect (out-of-order index). */
export interface QAFinding {
  severity: 'info' | 'warn';
  location: string;
  description: string;
  evidence: Record<string, unknown>;
}

/**
 * Walks modules -> lessons -> artifacts/mini-sections and returns real
 * findings. Read-only (R0) — no ticket, no write of any kind. Optionally
 * scoped to one module via `moduleId`.
 */
export async function scanCurriculumIntegrity(moduleId?: string): Promise<{ findings: QAFinding[] }> {
  const findings: QAFinding[] = [];

  const modules = await CurriculumModule.findAll({
    where: moduleId ? { id: moduleId } : undefined,
    include: [{
      model: CurriculumLesson,
      as: 'lessons',
      include: [
        { model: ArtifactDefinition, as: 'artifactDefinitions' },
        { model: MiniSection, as: 'miniSections' },
      ],
    }],
    order: [
      ['module_number', 'ASC'],
      [{ model: CurriculumLesson, as: 'lessons' }, 'sort_order', 'ASC'],
    ],
  });

  for (const mod of modules) {
    const moduleData = mod as any;
    const lessons = moduleData.lessons || [];

    if (lessons.length === 0) {
      findings.push({
        severity: 'warn',
        location: `curriculum_module:${moduleData.id}`,
        description: `Module "${moduleData.title}" has no lessons`,
        evidence: { module_id: moduleData.id, module_name: moduleData.title },
      });
      continue;
    }

    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i];

      if (!lesson.title || !lesson.title.trim()) {
        findings.push({
          severity: 'warn',
          location: `curriculum_lesson:${lesson.id}`,
          description: `Lesson in module "${moduleData.title}" is missing a title`,
          evidence: { module_id: moduleData.id, lesson_id: lesson.id },
        });
      }

      const hasMiniSections = lesson.miniSections && lesson.miniSections.length > 0;
      const hasArtifacts = lesson.artifactDefinitions && lesson.artifactDefinitions.length > 0;

      if (!hasMiniSections && !hasArtifacts) {
        findings.push({
          severity: 'warn',
          location: `curriculum_lesson:${lesson.id}`,
          description: `Lesson "${lesson.title}" has no content (no mini-sections or artifacts)`,
          evidence: { module_id: moduleData.id, lesson_id: lesson.id },
        });
      }

      if (i > 0 && lesson.sort_order <= lessons[i - 1].sort_order) {
        findings.push({
          severity: 'info',
          location: `curriculum_lesson:${lesson.id}`,
          description: `Lesson "${lesson.title}" has out-of-order index (${lesson.sort_order})`,
          evidence: { module_id: moduleData.id, lesson_id: lesson.id, sort_order: lesson.sort_order },
        });
      }
    }
  }

  return { findings };
}

/** Kept for `capabilityRegistry.ts`'s `curriculum.qa_check` dispatch entry,
 * which still expects an `AgentExecutionResult`. Delegates entirely to
 * `scanCurriculumIntegrity()` — creates no ticket, matching the coverage
 * contract's regression rule ("CurriculumQAAgent must open zero tickets"). */
export async function runCurriculumQAAgent(): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  // TOOL_CAPABILITY_DESIGN_v1.md B3.3 item 13 — real activity evidence on
  // both success and failure, tagged with Dara's real AiAgent.id (not
  // silently omitted, the exact gap this program exists to close). `null`
  // only if Dara's identity hasn't been seeded yet (e.g. a fresh boot before
  // seedAgentRegistry() has run) — logAgentActivity itself is fail-open, so
  // a missing id degrades to a skipped log line, never a thrown error.
  const daraAgentId = await getDaraAgentId().catch(() => null);

  try {
    const { findings } = await scanCurriculumIntegrity();

    actions.push({
      campaign_id: '',
      action: 'qa_scan_completed',
      reason: `Scanned curriculum, found ${findings.length} finding(s)`,
      confidence: 1.0,
      before_state: null,
      after_state: { findings_count: findings.length },
      result: 'success',
      entity_type: 'system',
      entity_id: 'curriculum_qa',
    });

    for (const finding of findings) {
      actions.push({
        campaign_id: '',
        action: 'qa_finding',
        reason: finding.description,
        confidence: 0.9,
        before_state: null,
        after_state: { severity: finding.severity, location: finding.location },
        result: 'success',
        entity_type: 'system',
        entity_id: finding.location,
      });
    }

    if (daraAgentId) {
      await logAgentActivity({
        agentId: daraAgentId,
        action: 'scan_curriculum_integrity',
        result: 'success',
        reason: `Scanned curriculum, found ${findings.length} finding(s)`,
        details: { findings_count: findings.length },
      });
    }
  } catch (err: any) {
    errors.push(err.message);
    if (daraAgentId) {
      await logAgentActivity({
        agentId: daraAgentId,
        action: 'scan_curriculum_integrity',
        result: 'failed',
        reason: err.message,
      });
    }
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    entities_processed: actions.filter((a) => a.action === 'qa_scan_completed').length,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
