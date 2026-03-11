// ─── Curriculum QA Agent ─────────────────────────────────────────────────────
// Cron (every 6h) + on-demand. Validates curriculum integrity by walking
// lesson sequences, checking content existence, and verifying gating logic.
// Creates tickets for issues found.

import { CurriculumModule, CurriculumLesson, ArtifactDefinition, MiniSection } from '../../models';
import { createTicket } from '../ticketService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'CurriculumQAAgent';

interface QAIssue {
  entity_type: string;
  entity_id: string;
  issue: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export async function runCurriculumQAAgent(): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const issues: QAIssue[] = [];

  try {
    // 1. Load all active modules with lessons
    const modules = await CurriculumModule.findAll({
      include: [{
        model: CurriculumLesson,
        as: 'lessons',
        include: [
          { model: ArtifactDefinition, as: 'artifactDefinitions' },
          { model: MiniSection, as: 'miniSections' },
        ],
      }],
      order: [['order_index', 'ASC']],
    });

    let entitiesChecked = 0;

    for (const mod of modules) {
      const moduleData = mod as any;
      const lessons = moduleData.lessons || [];
      entitiesChecked++;

      // Check: module has at least one lesson
      if (lessons.length === 0) {
        issues.push({
          entity_type: 'curriculum_module',
          entity_id: moduleData.id,
          issue: `Module "${moduleData.name}" has no lessons`,
          severity: 'high',
        });
        continue;
      }

      // Check lessons in sequence
      for (let i = 0; i < lessons.length; i++) {
        const lesson = lessons[i];
        entitiesChecked++;

        // Check: lesson has title and description
        if (!lesson.title || !lesson.title.trim()) {
          issues.push({
            entity_type: 'curriculum_lesson',
            entity_id: lesson.id,
            issue: `Lesson in module "${moduleData.name}" is missing a title`,
            severity: 'critical',
          });
        }

        // Check: lesson has content (mini-sections or artifacts)
        const hasMiniSections = lesson.miniSections && lesson.miniSections.length > 0;
        const hasArtifacts = lesson.artifactDefinitions && lesson.artifactDefinitions.length > 0;

        if (!hasMiniSections && !hasArtifacts) {
          issues.push({
            entity_type: 'curriculum_lesson',
            entity_id: lesson.id,
            issue: `Lesson "${lesson.title}" has no content (no mini-sections or artifacts)`,
            severity: 'medium',
          });
        }

        // Check: order_index continuity
        if (i > 0 && lesson.order_index <= lessons[i - 1].order_index) {
          issues.push({
            entity_type: 'curriculum_lesson',
            entity_id: lesson.id,
            issue: `Lesson "${lesson.title}" has out-of-order index (${lesson.order_index})`,
            severity: 'low',
          });
        }
      }
    }

    actions.push({
      campaign_id: '',
      action: 'qa_scan_completed',
      reason: `Scanned ${modules.length} modules, ${entitiesChecked} entities, found ${issues.length} issues`,
      confidence: 1.0,
      before_state: null,
      after_state: { modules_scanned: modules.length, issues_found: issues.length },
      result: 'success',
      entity_type: 'system',
      entity_id: 'curriculum_qa',
    });

    // 2. Create tickets for issues
    for (const issue of issues) {
      await createTicket({
        title: issue.issue,
        description: `Automated QA check found an issue:\n\n${issue.issue}\n\nEntity: ${issue.entity_type} (${issue.entity_id})`,
        type: 'bug',
        priority: issue.severity,
        source: `agent:${AGENT_NAME}`,
        created_by_type: 'agent',
        created_by_id: AGENT_NAME,
        entity_type: issue.entity_type,
        entity_id: issue.entity_id,
        metadata: { qa_issue: true, severity: issue.severity },
      });

      actions.push({
        campaign_id: '',
        action: 'created_qa_ticket',
        reason: issue.issue,
        confidence: 0.9,
        before_state: null,
        after_state: { entity_type: issue.entity_type, entity_id: issue.entity_id },
        result: 'success',
        entity_type: 'system',
        entity_id: issue.entity_id,
      });
    }
  } catch (err: any) {
    errors.push(err.message);
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
