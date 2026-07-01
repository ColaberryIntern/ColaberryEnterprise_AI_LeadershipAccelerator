import { Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import {
  DeepPlan,
  deriveExecutionMode,
  fulfilledReqIds,
  reqState,
} from './buildPlanIngestHelpers';

export interface IngestCounts {
  capabilities: number;
  requirements: number;
  sprints: number;
  tasks: number;
}

/**
 * Ingest a Story-Driven Build engine plan (deep_plan.json) into a student's
 * native project objects: Capabilities (clusters), RequirementsMap (reqs +
 * 4-state), StudentSprint (releases), StudentTask (stories).
 *
 * Idempotent: every upsert is keyed on a stable id, so re-ingesting the same
 * plan produces no duplicates. Transactional: any failure rolls the whole
 * ingest back (no half-published plan). The caller is responsible for the
 * trace-gate check (reject when plan.trace.ok === false) before calling.
 */
export async function ingestBuildPlan(projectId: string, plan: DeepPlan): Promise<IngestCounts> {
  const { Capability, RequirementsMap, StudentSprint, StudentTask } = await import('../models');
  const reqs = plan.reqs || [];
  const stories = plan.stories || [];
  const releases = plan.releases || [];
  const fulfilled = fulfilledReqIds(stories);

  return sequelize.transaction(async (t: Transaction) => {
    const counts: IngestCounts = { capabilities: 0, requirements: 0, sprints: 0, tasks: 0 };

    // 1. Capabilities, one per distinct cluster (match on project_id + name).
    const clusterToCapId = new Map<string, string>();
    const clusters = Array.from(new Set(reqs.map((r) => (r.cluster || '').trim()).filter(Boolean)));
    for (const name of clusters) {
      const [cap] = await Capability.findOrCreate({
        where: { project_id: projectId, name },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize creation attrs
        defaults: { project_id: projectId, name, source: 'build_plan' } as any,
        transaction: t,
      });
      clusterToCapId.set(name, (cap as any).id);
      counts.capabilities++;
    }

    // 2. Requirements (upsert by project_id + requirement_key), seed 4-state.
    for (const r of reqs) {
      const capId = r.cluster ? clusterToCapId.get(r.cluster.trim()) ?? null : null;
      const state = reqState(r.id, fulfilled);
      const existing = await RequirementsMap.findOne({
        where: { project_id: projectId, requirement_key: r.id },
        transaction: t,
      });
      if (existing) {
        await existing.update({ requirement_text: r.statement, capability_id: capId, state } as any, { transaction: t });
      } else {
        await RequirementsMap.create(
          { project_id: projectId, requirement_key: r.id, requirement_text: r.statement, capability_id: capId, state } as any,
          { transaction: t }
        );
      }
      counts.requirements++;
    }

    // 3. Sprints (upsert by project_id + key).
    const keyToSprintId = new Map<string, string>();
    for (const rel of releases) {
      const weeks = Array.isArray(rel.weeks) ? rel.weeks : [];
      const week_start = typeof weeks[0] === 'number' ? weeks[0] : null;
      const week_end = typeof weeks[1] === 'number' ? weeks[1] : null;
      const fields = { name: rel.name || rel.key, goal: rel.goal ?? null, demo: rel.demo ?? null, week_start, week_end };
      const existing = await StudentSprint.findOne({ where: { project_id: projectId, key: rel.key }, transaction: t });
      const sprint = existing
        ? await existing.update(fields as any, { transaction: t })
        : await StudentSprint.create({ project_id: projectId, key: rel.key, ...fields } as any, { transaction: t });
      keyToSprintId.set(rel.key, (sprint as any).id);
      counts.sprints++;
    }

    // 4. Tasks (upsert by project_id + story_id).
    for (const s of stories) {
      const sprintId = s.release ? keyToSprintId.get(s.release) ?? null : null;
      const fields = {
        sprint_id: sprintId,
        title: s.title,
        narrative: s.narrative ?? null,
        fulfills: s.fulfills || [],
        owner_agent: s.owner_agent ?? null,
        acceptance: s.acceptance || [],
        build: s.build ?? null,
        vibe: s.vibe ?? null,
        trust: s.trust ?? null,
        execution_mode: deriveExecutionMode(s),
      };
      const existing = await StudentTask.findOne({ where: { project_id: projectId, story_id: s.id }, transaction: t });
      if (existing) {
        await existing.update(fields as any, { transaction: t });
      } else {
        await StudentTask.create({ project_id: projectId, story_id: s.id, status: 'todo', ...fields } as any, { transaction: t });
      }
      counts.tasks++;
    }

    return counts;
  });
}
