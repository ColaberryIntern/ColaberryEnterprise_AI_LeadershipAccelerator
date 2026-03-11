// ─── Curriculum Optimizer Agent ──────────────────────────────────────────────
// Cron (daily at 6am). Analyzes student behavior data to identify
// drop-off points, slow lessons, and optimization opportunities.
// Creates tickets for actionable improvements.

import { sequelize } from '../../config/database';
import { LessonInstance, CurriculumLesson, MentorConversation } from '../../models';
import { createTicket } from '../ticketService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'CurriculumOptimizerAgent';

// Thresholds
const DROP_OFF_THRESHOLD = 0.4; // 40% drop-off rate triggers a ticket
const SLOW_LESSON_THRESHOLD_MIN = 60; // Lessons taking >60min avg triggers a ticket
const HIGH_MENTOR_USAGE_THRESHOLD = 0.7; // 70% of students using mentor suggests confusion

export async function runCurriculumOptimizerAgent(): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // 1. Aggregate completion rates per lesson
    const lessonStats: any[] = await sequelize.query(`
      SELECT
        li.lesson_id,
        cl.title as lesson_title,
        cl.module_id,
        COUNT(*) as total_starts,
        COUNT(CASE WHEN li.status = 'completed' THEN 1 END) as completions,
        ROUND(AVG(EXTRACT(EPOCH FROM (li.completed_at - li.started_at)) / 60)::numeric, 1) as avg_duration_min
      FROM lesson_instances li
      JOIN curriculum_lessons cl ON cl.id = li.lesson_id
      WHERE li.started_at > NOW() - INTERVAL '30 days'
      GROUP BY li.lesson_id, cl.title, cl.module_id
      HAVING COUNT(*) >= 5
      ORDER BY COUNT(CASE WHEN li.status = 'completed' THEN 1 END)::float / COUNT(*)::float ASC
    `, { type: 'SELECT' as any }).catch(() => []);

    let optimizationsFound = 0;

    for (const stat of lessonStats) {
      const completionRate = stat.total_starts > 0 ? stat.completions / stat.total_starts : 1;
      const dropOffRate = 1 - completionRate;

      // Check drop-off
      if (dropOffRate >= DROP_OFF_THRESHOLD) {
        await createTicket({
          title: `High drop-off (${Math.round(dropOffRate * 100)}%) on "${stat.lesson_title}"`,
          description: `Lesson "${stat.lesson_title}" has a ${Math.round(dropOffRate * 100)}% drop-off rate over the last 30 days.\n\n- Total starts: ${stat.total_starts}\n- Completions: ${stat.completions}\n- Avg duration: ${stat.avg_duration_min || 'N/A'} min\n\nConsider simplifying content, breaking into smaller sections, or adding engagement hooks.`,
          type: 'curriculum',
          priority: dropOffRate >= 0.6 ? 'high' : 'medium',
          source: `agent:${AGENT_NAME}`,
          created_by_type: 'agent',
          created_by_id: AGENT_NAME,
          entity_type: 'curriculum_lesson',
          entity_id: stat.lesson_id,
          metadata: {
            action: 'optimize_lesson',
            drop_off_rate: dropOffRate,
            total_starts: stat.total_starts,
            completions: stat.completions,
            avg_duration_min: stat.avg_duration_min,
          },
        });
        optimizationsFound++;
      }

      // Check slow lessons
      if (stat.avg_duration_min && stat.avg_duration_min > SLOW_LESSON_THRESHOLD_MIN) {
        await createTicket({
          title: `Slow lesson (${stat.avg_duration_min}min avg): "${stat.lesson_title}"`,
          description: `Students spend an average of ${stat.avg_duration_min} minutes on "${stat.lesson_title}" (threshold: ${SLOW_LESSON_THRESHOLD_MIN}min).\n\nConsider breaking this lesson into smaller sections or providing better scaffolding.`,
          type: 'curriculum',
          priority: 'medium',
          source: `agent:${AGENT_NAME}`,
          created_by_type: 'agent',
          created_by_id: AGENT_NAME,
          entity_type: 'curriculum_lesson',
          entity_id: stat.lesson_id,
          metadata: { action: 'optimize_lesson', avg_duration_min: stat.avg_duration_min },
        });
        optimizationsFound++;
      }
    }

    // 2. Check mentor usage patterns
    const mentorStats: any[] = await sequelize.query(`
      SELECT
        mc.lesson_id,
        cl.title as lesson_title,
        COUNT(DISTINCT mc.enrollment_id) as students_using_mentor,
        (SELECT COUNT(DISTINCT li.enrollment_id) FROM lesson_instances li WHERE li.lesson_id = mc.lesson_id) as total_students
      FROM mentor_conversations mc
      JOIN curriculum_lessons cl ON cl.id = mc.lesson_id
      WHERE mc.created_at > NOW() - INTERVAL '30 days'
      GROUP BY mc.lesson_id, cl.title
      HAVING COUNT(DISTINCT mc.enrollment_id) >= 3
    `, { type: 'SELECT' as any }).catch(() => []);

    for (const stat of mentorStats) {
      const usageRate = stat.total_students > 0 ? stat.students_using_mentor / stat.total_students : 0;
      if (usageRate >= HIGH_MENTOR_USAGE_THRESHOLD) {
        await createTicket({
          title: `High mentor usage (${Math.round(usageRate * 100)}%) on "${stat.lesson_title}"`,
          description: `${Math.round(usageRate * 100)}% of students are seeking mentor help on "${stat.lesson_title}". This may indicate confusing content or insufficient scaffolding.`,
          type: 'curriculum',
          priority: 'medium',
          source: `agent:${AGENT_NAME}`,
          created_by_type: 'agent',
          created_by_id: AGENT_NAME,
          entity_type: 'curriculum_lesson',
          entity_id: stat.lesson_id,
          metadata: { action: 'optimize_lesson', mentor_usage_rate: usageRate },
        });
        optimizationsFound++;
      }
    }

    actions.push({
      campaign_id: '',
      action: 'optimization_scan',
      reason: `Analyzed ${lessonStats.length} lessons, found ${optimizationsFound} optimization opportunities`,
      confidence: 0.85,
      before_state: null,
      after_state: { lessons_analyzed: lessonStats.length, optimizations_found: optimizationsFound },
      result: 'success',
      entity_type: 'system',
      entity_id: 'curriculum_optimizer',
    });
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    entities_processed: actions.length,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
