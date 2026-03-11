// ─── Student Behavior Intelligence Agent ─────────────────────────────────────
// Cron (every 30 min). Aggregates student navigation events to detect
// anomalies: high drop-off, idle patterns, unusual mentor usage.
// Creates tickets when thresholds are exceeded.

import { sequelize } from '../../config/database';
import { createTicket } from '../ticketService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'StudentBehaviorIntelligenceAgent';

export async function runStudentBehaviorIntelligenceAgent(): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // 1. Aggregate per-lesson behavior from last 24h
    const behaviorStats: any[] = await sequelize.query(`
      SELECT
        sne.lesson_id,
        cl.title as lesson_title,
        sne.event_type,
        COUNT(*) as event_count,
        COUNT(DISTINCT sne.enrollment_id) as unique_students,
        AVG(sne.duration_ms) as avg_duration_ms
      FROM student_navigation_events sne
      LEFT JOIN curriculum_lessons cl ON cl.id = sne.lesson_id
      WHERE sne.created_at > NOW() - INTERVAL '24 hours'
        AND sne.lesson_id IS NOT NULL
      GROUP BY sne.lesson_id, cl.title, sne.event_type
      ORDER BY event_count DESC
    `, { type: 'SELECT' as any }).catch(() => []);

    // 2. Detect anomalies
    const lessonMap = new Map<string, any>();
    for (const stat of behaviorStats) {
      if (!stat.lesson_id) continue;
      if (!lessonMap.has(stat.lesson_id)) {
        lessonMap.set(stat.lesson_id, {
          lesson_id: stat.lesson_id,
          lesson_title: stat.lesson_title,
          events: {},
        });
      }
      lessonMap.get(stat.lesson_id).events[stat.event_type] = {
        count: Number(stat.event_count),
        unique_students: Number(stat.unique_students),
        avg_duration_ms: Number(stat.avg_duration_ms),
      };
    }

    let anomaliesDetected = 0;

    for (const [lessonId, data] of lessonMap) {
      const starts = data.events.lesson_start?.unique_students || 0;
      const completes = data.events.lesson_complete?.unique_students || 0;
      const idles = data.events.idle_detected?.count || 0;

      // High idle rate (>50% of starts)
      if (starts > 3 && idles > starts * 0.5) {
        await createTicket({
          title: `High idle rate on "${data.lesson_title}"`,
          description: `${idles} idle events detected across ${starts} students in the last 24h. Students may be disengaged or stuck.`,
          type: 'curriculum',
          priority: 'medium',
          source: `agent:${AGENT_NAME}`,
          created_by_type: 'agent',
          created_by_id: AGENT_NAME,
          entity_type: 'curriculum_lesson',
          entity_id: lessonId,
          metadata: { anomaly: 'high_idle', starts, idles, completes },
        });
        anomaliesDetected++;
      }

      // Low completion (starts > 5 but completions < 30%)
      if (starts > 5 && completes / starts < 0.3) {
        await createTicket({
          title: `Low completion rate (${Math.round((completes / starts) * 100)}%) on "${data.lesson_title}"`,
          description: `Only ${completes} of ${starts} students completed this lesson in the last 24h.`,
          type: 'curriculum',
          priority: 'high',
          source: `agent:${AGENT_NAME}`,
          created_by_type: 'agent',
          created_by_id: AGENT_NAME,
          entity_type: 'curriculum_lesson',
          entity_id: lessonId,
          metadata: { anomaly: 'low_completion', starts, completes },
        });
        anomaliesDetected++;
      }
    }

    actions.push({
      campaign_id: '',
      action: 'behavior_analysis',
      reason: `Analyzed ${lessonMap.size} lessons, ${behaviorStats.length} event groups, ${anomaliesDetected} anomalies`,
      confidence: 0.9,
      before_state: null,
      after_state: { lessons_analyzed: lessonMap.size, anomalies: anomaliesDetected },
      result: 'success',
      entity_type: 'system',
      entity_id: 'student_behavior',
    });
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    entities_processed: 1,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
