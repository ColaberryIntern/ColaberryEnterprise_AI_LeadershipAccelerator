/**
 * lifecycleService — the explicit Runtime Lifecycle of an AI Component. Authoring
 * states are stored on `status` (+ `version_locked`); runtime states (student
 * opened, generated, completed, evaluated) are derived from analytics so the
 * lifecycle is visible end-to-end. Pure state math; no hidden transitions.
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import ComponentAnalytics from '../../models/ComponentAnalytics';

export const LIFECYCLE_STATES = [
  'draft', 'generated', 'validated', 'published',
  'student_opened', 'generated_runtime', 'completed', 'evaluated',
  'archived', 'version_locked',
] as const;
export type LifecycleState = typeof LIFECYCLE_STATES[number];

/** Authoring-side allowed transitions (runtime states are observed, not set). */
const AUTHORING_TRANSITIONS: Record<string, string[]> = {
  draft: ['generated', 'validated', 'published', 'archived'],
  generated: ['validated', 'published', 'archived', 'draft'],
  validated: ['published', 'draft', 'archived'],
  ready: ['published', 'validated', 'archived', 'draft'],
  published: ['archived', 'draft', 'version_locked'],
  archived: ['draft'],
  version_locked: ['published'],
};

export function canTransition(from: string, to: string): boolean {
  return (AUTHORING_TRANSITIONS[from] || []).includes(to);
}

/** PURE — the furthest lifecycle state a component has reached, given its
 *  authoring status + observed runtime metrics. */
export function currentState(status: string, versionLocked: boolean, a?: { runtime_count?: number; completion_pct?: number; evaluation_quality?: number } | null): LifecycleState {
  if (versionLocked) return 'version_locked';
  if (status === 'archived') return 'archived';
  if (a && (a.evaluation_quality ?? 0) > 0 && (a.completion_pct ?? 0) > 0 && status === 'published') return 'evaluated';
  if (a && (a.completion_pct ?? 0) > 0 && status === 'published') return 'completed';
  if (a && (a.runtime_count ?? 0) > 0 && status === 'published') return 'generated_runtime';
  if (status === 'published') return 'published';
  if (status === 'ready' || status === 'validated') return 'validated';
  if (status === 'generated') return 'generated';
  return 'draft';
}

export async function componentLifecycle(slug: string) {
  const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
  const a = await ComponentAnalytics.findOne({ where: { component_slug: slug } });
  const state = currentState(c.status || 'draft', !!c.version_locked, a ? a.toJSON() as any : null);
  return {
    slug, status: c.status, version_locked: c.version_locked,
    states: LIFECYCLE_STATES, current: state,
    reached_index: LIFECYCLE_STATES.indexOf(state),
    allowed_transitions: AUTHORING_TRANSITIONS[c.status || 'draft'] || [],
  };
}

/** Set an authoring lifecycle status with transition validation. */
export async function setLifecycle(slug: string, to: string) {
  const c = await CurriculumTypeDefinition.findOne({ where: { slug } });
  if (!c) throw Object.assign(new Error(`Component "${slug}" not found`), { status: 404 });
  if (to === 'version_locked') { await c.update({ version_locked: true }); return componentLifecycle(slug); }
  if (!canTransition(c.status || 'draft', to)) throw Object.assign(new Error(`Cannot transition ${c.status} -> ${to}`), { status: 400 });
  await c.update({ status: to, ...(to === 'published' ? { version_locked: false } : {}) });
  return componentLifecycle(slug);
}
