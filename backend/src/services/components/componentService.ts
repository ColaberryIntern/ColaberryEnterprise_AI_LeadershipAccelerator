/**
 * componentService — the Experience Builder registry service. Reads/writes AI
 * Components (curriculum_type_definitions) and maintains an append-only version
 * history (component_versions). Every save snapshots the prior state, bumps the
 * component_version, and recomputes cost/token/runtime estimates.
 *
 * One responsibility: component lifecycle. Prompt execution lives in
 * promptTesterService; cost math in costEstimationService.
 */
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import ComponentVersion from '../../models/ComponentVersion';
import { estimateComponent } from './costEstimationService';

/** Fields an author may edit in the builder (everything else is derived/system). */
export const EDITABLE_FIELDS = [
  'label', 'student_label', 'description', 'icon', 'badge_class',
  'design_prompt', 'renderer_prompt', 'generation_prompt', 'evaluation_prompt', 'reflection_prompt',
  'github_prompt', 'improvement_prompt', 'thumbnail_url', 'preview_examples', 'variable_keys',
  'bucket_default', 'render_band', 'difficulty',
  'learning_xp', 'builder_xp', 'community_xp', 'estimated_time', 'competencies',
  'category', 'tags', 'status', 'learning_objectives', 'architect_domains', 'capabilities',
  'inputs', 'outputs', 'artifacts_produced', 'evidence_produced', 'portfolio_assets', 'github_assets',
  'evaluation_type', 'completion_rules', 'dependencies', 'version_locked', 'thumbnail_url',
  'can_create_variables', 'can_create_artifacts',
  'evidence_required', 'github_required', 'ai_evaluation', 'instructor_review', 'portfolio_eligible',
  'is_active',
] as const;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 90) || 'component';
}

function snapshotOf(c: CurriculumTypeDefinition): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of EDITABLE_FIELDS) out[f] = (c as any)[f];
  return out;
}

/** Component library — all components with their version count + estimates. */
export async function listComponents() {
  const rows = await CurriculumTypeDefinition.findAll({ order: [['display_order', 'ASC'], ['label', 'ASC']] });
  const counts = await ComponentVersion.findAll({
    attributes: ['component_slug', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
    group: ['component_slug'],
  });
  const versionCount = new Map(counts.map((r: any) => [r.component_slug, Number(r.get('n'))]));
  return rows.map((c) => ({ ...c.toJSON(), version_count: versionCount.get(c.slug) || 0 }));
}

/** One component + its version history (newest first). */
export async function getComponent(slug: string) {
  const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
  const versions = await ComponentVersion.findAll({ where: { component_slug: slug }, order: [['version', 'DESC']], limit: 50 });
  return { ...c.toJSON(), versions: versions.map((v) => v.toJSON()) };
}

/**
 * Apply an author edit: snapshot the current state as the next version, patch the
 * editable fields, refresh estimates, bump component_version. Transactional.
 */
export async function updateComponent(slug: string, patch: Record<string, any>, author?: string, note?: string) {
  return sequelize.transaction(async (t) => {
    const c = await CurriculumTypeDefinition.findOne({ where: { slug }, transaction: t });
    if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });

    // 1. snapshot the CURRENT (pre-edit) state at the current version number.
    await ComponentVersion.findOrCreate({
      where: { component_slug: slug, version: c.component_version },
      defaults: { component_slug: slug, version: c.component_version, snapshot: snapshotOf(c), author: author ?? null, label: note ?? null },
      transaction: t,
    });

    // 2. apply only whitelisted fields.
    const clean: Record<string, any> = {};
    for (const f of EDITABLE_FIELDS) if (f in patch) clean[f] = patch[f];

    // 3. refresh estimates from the (possibly new) prompts + difficulty.
    const merged = { ...c.toJSON(), ...clean };
    const est = estimateComponent(merged as any);
    Object.assign(clean, {
      est_input_tokens: est.input_tokens, est_output_tokens: est.output_tokens,
      est_cost_usd: est.cost_usd, est_runtime_ms: est.runtime_ms,
      component_version: c.component_version + 1,
    });

    await c.update(clean, { transaction: t });
    return c;
  });
}

/** Create a NEW component from an (AI-generated) draft. Slug derived + de-duped. */
export async function createComponent(draft: Record<string, any>): Promise<CurriculumTypeDefinition> {
  let slug = draft.slug ? slugify(String(draft.slug)) : slugify(String(draft.label || 'component'));
  // de-dupe slug
  let n = 1; const base = slug;
  while (await CurriculumTypeDefinition.findOne({ where: { slug } })) { slug = `${base}_${++n}`; }

  const clean: Record<string, any> = { slug };
  for (const f of EDITABLE_FIELDS) if (f in draft) clean[f] = draft[f];
  if (!clean.label) clean.label = 'New Component';
  if (!clean.student_label) clean.student_label = clean.label;
  clean.is_system = false;
  clean.component_version = 1;
  clean.status = clean.status || 'draft';

  const est = estimateComponent(clean as any);
  Object.assign(clean, { est_input_tokens: est.input_tokens, est_output_tokens: est.output_tokens, est_cost_usd: est.cost_usd, est_runtime_ms: est.runtime_ms });
  return CurriculumTypeDefinition.create(clean as any);
}

/** Export a component as a portable package (marketplace-ready). */
export async function exportComponent(slug: string) {
  const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
  const j = c.toJSON() as any;
  const component: Record<string, any> = { slug: j.slug };
  for (const f of EDITABLE_FIELDS) component[f] = j[f];
  return { format: 'colaberry-component@1', exported_at: null, component, dependencies: j.dependencies || [] };
}

/** Import a component package -> a new component (de-duped slug). */
export async function importComponent(pkg: any): Promise<CurriculumTypeDefinition> {
  if (!pkg || (pkg.format && !String(pkg.format).startsWith('colaberry-component'))) {
    throw Object.assign(new Error('Unrecognized component package'), { status: 400 });
  }
  const draft = pkg.component || pkg;
  return createComponent({ ...draft, dependencies: pkg.dependencies || draft.dependencies || [] });
}

export async function listVersions(slug: string) {
  return ComponentVersion.findAll({ where: { component_slug: slug }, order: [['version', 'DESC']] });
}

/** Restore a prior version as a NEW version (never destructive). */
export async function restoreVersion(slug: string, version: number, author?: string) {
  const v = await ComponentVersion.findOne({ where: { component_slug: slug, version } });
  if (!v) throw Object.assign(new Error(`Version ${version} of "${slug}" not found`), { status: 404 });
  return updateComponent(slug, v.snapshot, author, `Restored from v${version}`);
}

/** Recompute + persist estimates for one or all components (backfill helper). */
export async function refreshEstimates(slug?: string) {
  const where = slug ? { slug } : {};
  const rows = await CurriculumTypeDefinition.findAll({ where: where as any });
  let updated = 0;
  for (const c of rows) {
    const est = estimateComponent(c.toJSON() as any);
    await c.update({ est_input_tokens: est.input_tokens, est_output_tokens: est.output_tokens, est_cost_usd: est.cost_usd, est_runtime_ms: est.runtime_ms });
    updated += 1;
  }
  return { updated };
}

export { CurriculumTypeDefinition, ComponentVersion, Op };
