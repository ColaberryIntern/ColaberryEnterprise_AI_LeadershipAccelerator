// ─── Curriculum Versioning Service ───────────────────────────────────────────
// Manages curriculum snapshots at various levels (full blueprint, module, lesson).
// Supports rollback and version comparison.

import { BlueprintSnapshot, ProgramBlueprint, CurriculumModule, CurriculumLesson, MiniSection, ArtifactDefinition } from '../models';
import { Op } from 'sequelize';

export type SnapshotLevel = 'full' | 'module' | 'lesson' | 'artifact';

// ── Create Snapshot ──────────────────────────────────────────────────────────

export async function createSnapshot(
  blueprintId: string,
  level: SnapshotLevel = 'full',
  entityId?: string,
  description?: string,
  createdBy?: string,
): Promise<any> {
  // Determine next version number
  const lastSnapshot = await BlueprintSnapshot.findOne({
    where: { blueprint_id: blueprintId },
    order: [['version_number', 'DESC']],
  }) as any;
  const versionNumber = (lastSnapshot?.version_number || 0) + 1;

  // Build snapshot data based on level
  let snapshotData: Record<string, any>;

  if (level === 'full') {
    snapshotData = await buildFullSnapshot(blueprintId);
  } else if (level === 'module' && entityId) {
    snapshotData = await buildModuleSnapshot(entityId);
  } else if (level === 'lesson' && entityId) {
    snapshotData = await buildLessonSnapshot(entityId);
  } else {
    throw new Error(`Invalid snapshot level "${level}" or missing entityId`);
  }

  const snapshot = await BlueprintSnapshot.create({
    blueprint_id: blueprintId,
    snapshot_data: snapshotData,
    description: description || `Version ${versionNumber} (${level})`,
    created_by: createdBy || null,
    version_number: versionNumber,
    snapshot_level: level,
    entity_id: entityId || null,
    change_summary: description || null,
  } as any);

  return snapshot;
}

// ── Rollback ─────────────────────────────────────────────────────────────────

export async function rollbackToSnapshot(snapshotId: string): Promise<any> {
  const snapshot = await BlueprintSnapshot.findByPk(snapshotId) as any;
  if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

  const data = snapshot.snapshot_data;
  const level = snapshot.snapshot_level || 'full';

  // Create a reverse snapshot before rollback
  await createSnapshot(
    snapshot.blueprint_id,
    level as SnapshotLevel,
    snapshot.entity_id || undefined,
    `Pre-rollback backup (before reverting to v${snapshot.version_number})`,
  );

  if (level === 'full') {
    await restoreFullSnapshot(snapshot.blueprint_id, data);
  } else if (level === 'module' && snapshot.entity_id) {
    await restoreModuleSnapshot(snapshot.entity_id, data);
  } else if (level === 'lesson' && snapshot.entity_id) {
    await restoreLessonSnapshot(snapshot.entity_id, data);
  }

  return snapshot;
}

// ── List Versions ────────────────────────────────────────────────────────────

export async function listVersions(blueprintId: string) {
  return BlueprintSnapshot.findAll({
    where: { blueprint_id: blueprintId },
    attributes: ['id', 'version_number', 'snapshot_level', 'entity_id', 'description', 'change_summary', 'created_by', 'created_at'],
    order: [['version_number', 'DESC']],
  });
}

// ── Diff Snapshots ───────────────────────────────────────────────────────────

export async function diffSnapshots(snapshotIdA: string, snapshotIdB: string) {
  const [a, b] = await Promise.all([
    BlueprintSnapshot.findByPk(snapshotIdA),
    BlueprintSnapshot.findByPk(snapshotIdB),
  ]);

  if (!a || !b) throw new Error('One or both snapshots not found');

  const dataA = (a as any).snapshot_data;
  const dataB = (b as any).snapshot_data;

  // Simple structural diff
  const diff: Record<string, any> = {
    version_a: (a as any).version_number,
    version_b: (b as any).version_number,
    changes: [],
  };

  // Compare module counts
  const modulesA = dataA.modules?.length || 0;
  const modulesB = dataB.modules?.length || 0;
  if (modulesA !== modulesB) {
    diff.changes.push({ type: 'module_count', from: modulesA, to: modulesB });
  }

  // Compare lesson counts
  const lessonsA = dataA.modules?.reduce((s: number, m: any) => s + (m.lessons?.length || 0), 0) || 0;
  const lessonsB = dataB.modules?.reduce((s: number, m: any) => s + (m.lessons?.length || 0), 0) || 0;
  if (lessonsA !== lessonsB) {
    diff.changes.push({ type: 'lesson_count', from: lessonsA, to: lessonsB });
  }

  return diff;
}

// ── Snapshot Builders ────────────────────────────────────────────────────────

async function buildFullSnapshot(blueprintId: string): Promise<Record<string, any>> {
  const blueprint = await ProgramBlueprint.findByPk(blueprintId) as any;
  if (!blueprint) throw new Error(`Blueprint ${blueprintId} not found`);

  const modules = await CurriculumModule.findAll({
    where: { program_id: blueprintId },
    include: [{
      model: CurriculumLesson,
      as: 'lessons',
      include: [
        { model: MiniSection, as: 'miniSections' },
        { model: ArtifactDefinition, as: 'artifactDefinitions' },
      ],
    }],
    order: [['order_index', 'ASC']],
  });

  return {
    blueprint: blueprint.toJSON(),
    modules: modules.map((m: any) => m.toJSON()),
    snapshot_at: new Date().toISOString(),
  };
}

async function buildModuleSnapshot(moduleId: string): Promise<Record<string, any>> {
  const module = await CurriculumModule.findByPk(moduleId, {
    include: [{
      model: CurriculumLesson,
      as: 'lessons',
      include: [
        { model: MiniSection, as: 'miniSections' },
        { model: ArtifactDefinition, as: 'artifactDefinitions' },
      ],
    }],
  });
  if (!module) throw new Error(`Module ${moduleId} not found`);
  return { module: (module as any).toJSON(), snapshot_at: new Date().toISOString() };
}

async function buildLessonSnapshot(lessonId: string): Promise<Record<string, any>> {
  const lesson = await CurriculumLesson.findByPk(lessonId, {
    include: [
      { model: MiniSection, as: 'miniSections' },
      { model: ArtifactDefinition, as: 'artifactDefinitions' },
    ],
  });
  if (!lesson) throw new Error(`Lesson ${lessonId} not found`);
  return { lesson: (lesson as any).toJSON(), snapshot_at: new Date().toISOString() };
}

// ── Snapshot Restorers ───────────────────────────────────────────────────────

async function restoreFullSnapshot(blueprintId: string, data: Record<string, any>): Promise<void> {
  // Restore blueprint fields
  if (data.blueprint) {
    const bp = await ProgramBlueprint.findByPk(blueprintId);
    if (bp) {
      const { id, created_at, ...fields } = data.blueprint;
      await (bp as any).update(fields);
    }
  }
}

async function restoreModuleSnapshot(moduleId: string, data: Record<string, any>): Promise<void> {
  if (data.module) {
    const mod = await CurriculumModule.findByPk(moduleId);
    if (mod) {
      const { id, created_at, lessons, ...fields } = data.module;
      await (mod as any).update(fields);
    }
  }
}

async function restoreLessonSnapshot(lessonId: string, data: Record<string, any>): Promise<void> {
  if (data.lesson) {
    const lesson = await CurriculumLesson.findByPk(lessonId);
    if (lesson) {
      const { id, created_at, miniSections, artifactDefinitions, ...fields } = data.lesson;
      await (lesson as any).update(fields);
    }
  }
}
