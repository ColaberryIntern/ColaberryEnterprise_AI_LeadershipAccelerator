/**
 * projectScopeService — the artifact a prospect is actually being asked to pay for.
 *
 * ## Why this exists
 *
 * The first version of the wow screen showed the UNDERSTANDING: four counts and a list of
 * things the person had just said. Tested live on "city tour guide app for old people", it
 * returned:
 *
 *     PRIMARY USERS 0 · AI OPPORTUNITIES 0 · HUMAN DECISION POINTS 0
 *
 * Zero users on an app whose entire premise is a group of users. Even ignoring the zeros,
 * the artifact was a summary of their own words - it told them nothing they did not already
 * know, and nothing about what would be BUILT.
 *
 * The §18 blueprint had existed for a while by then and nobody was showing it. That is the
 * whole change here: surface the scope, not the transcript.
 *
 * ## Backward-looking versus forward-looking
 *
 * "What we heard" is evidence that we listened. It belongs, but underneath. What earns a
 * monthly commitment is the part that says what we would build, in what order, what the
 * software does on its own, and where a human still decides - because that is the part the
 * customer cannot write for themselves.
 *
 * ## Cached, because a scope that changes while you read it is worse than one that waits
 *
 * The proposal half costs a model call and is not deterministic. Regenerating per page load
 * would mean a customer who refreshes watches the scope of their project quietly change.
 * So it is generated once and stored on the understanding it derives from.
 */

import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import {
  itemsFor,
  openQuestions,
  decisionsForCustomer,
  type ProjectUnderstanding,
} from './projectUnderstanding';
import { projectBlueprint, type BuildBlueprint } from './buildBlueprint';
import { generateProposals, applyProposals } from './blueprintProposals';

export interface ScopeSection {
  key: string;
  title: string;
  /** What this section is for, in one line, shown under the heading. */
  lead: string;
  items: string[];
}

export interface ProjectScope {
  title: string;
  /** One paragraph a person could read aloud. The scope in a sentence. */
  summary: string;
  sections: ScopeSection[];
  /** Only counts that mean something. A zero is never shown. */
  figures: Array<{ label: string; value: number }>;
  open_questions: string[];
  decisions: string[];
  heard: string[];
  generated_at: string;
}

const entriesOf = (bp: BuildBlueprint, key: string): string[] =>
  (bp.sections.find((s) => s.key === key)?.entries || []).map((e) => e.value);

/**
 * Assemble the customer-facing scope from a blueprint.
 *
 * Pure and deterministic given the blueprint, so what a customer sees can be reproduced
 * from what was stored rather than re-derived by another model call.
 */
export function assembleScope(u: ProjectUnderstanding, bp: BuildBlueprint, generatedAt: string): ProjectScope {
  const sections: ScopeSection[] = [
    {
      key: 'build',
      title: 'What we would build',
      lead: 'The system itself, as we would scope it today.',
      items: entriesOf(bp, 'proposed_application'),
    },
    {
      key: 'release_1',
      title: 'Release 1',
      lead: 'The first thing worth putting in front of your team.',
      items: entriesOf(bp, 'release_1'),
    },
    {
      key: 'agents',
      title: 'What the software does on its own',
      lead: 'The work that stops landing on a person every morning.',
      items: entriesOf(bp, 'proposed_agents'),
    },
    {
      key: 'human',
      title: 'What still needs a person',
      lead: 'Deliberately kept with you. AI builds; authority stays human.',
      items: [...entriesOf(bp, 'human_responsibilities'), ...entriesOf(bp, 'trust_blueprint')],
    },
    {
      key: 'surfaces',
      title: 'Screens',
      lead: 'Where the work would actually happen.',
      items: [...u.proposed_surfaces, ...entriesOf(bp, 'ux_direction')],
    },
    {
      key: 'architecture',
      title: 'How it would be built',
      lead: 'Direction, not a final design.',
      items: [...entriesOf(bp, 'architecture_direction'), ...entriesOf(bp, 'integrations')],
    },
    {
      key: 'risks',
      title: 'What could go wrong',
      lead: 'Named now rather than discovered later.',
      items: entriesOf(bp, 'risks_unknowns'),
    },
  ]
    // A section with nothing in it is worse than no section: it reads as a gap in the
    // thinking rather than a gap in the conversation.
    .filter((s) => s.items.length > 0);

  const figures = [
    { label: 'Screens', value: sections.find((s) => s.key === 'surfaces')?.items.length || 0 },
    { label: 'Automations', value: sections.find((s) => s.key === 'agents')?.items.length || 0 },
    { label: 'Your decisions', value: sections.find((s) => s.key === 'human')?.items.length || 0 },
    { label: 'Open questions', value: openQuestions(u).length },
  ]
    // NEVER show a zero. "Primary users 0" was the single most damaging thing on the old
    // screen: a zero reads as broken software, not as an honest gap.
    .filter((f) => f.value > 0);

  const problem = itemsFor(u, 'problem')[0]?.value || itemsFor(u, 'pain_points')[0]?.value || '';
  const outcome = itemsFor(u, 'desired_outcome')[0]?.value || '';
  const build = sections.find((s) => s.key === 'build')?.items[0] || '';

  const summary = [problem, outcome ? `You want ${outcome.charAt(0).toLowerCase()}${outcome.slice(1)}` : '', build]
    .filter(Boolean)
    .join(' ');

  return {
    title: u.title,
    summary,
    sections,
    figures,
    open_questions: openQuestions(u).map((q) => q.value),
    decisions: decisionsForCustomer(u).map((d) => d.value),
    heard: u.items.filter((i) => i.classification === 'FACT').map((i) => i.value),
    generated_at: generatedAt,
  };
}

export type ScopeResult =
  | { ok: true; scope: ProjectScope; cached: boolean }
  | { ok: false; error: string };

/**
 * Get the scope for an understanding, generating the proposal half once.
 *
 * Returns the cached scope when there is one. On a generation failure it still returns a
 * scope built from the derived half alone rather than nothing - a customer seeing what we
 * heard plus their screens is a worse artifact than the full one, but it is not an error
 * page, and the parts that came from them are still true.
 */
export async function getOrCreateScope(recordId: string): Promise<ScopeResult> {
  const record: any = await ProjectUnderstandingRecord.findByPk(recordId);
  if (!record || record.status !== 'extracted') return { ok: false, error: 'no understanding to scope' };

  if (record.scope) return { ok: true, scope: record.scope as ProjectScope, cached: true };

  const understanding: ProjectUnderstanding = {
    title: record.title || 'Your project',
    proposed_surfaces: record.proposed_surfaces || [],
    items: record.items || [],
  };

  const projected = projectBlueprint(understanding);

  let blueprint = projected;
  try {
    const proposals = await generateProposals({ understanding, blueprint: projected });
    if (proposals.ok) blueprint = applyProposals(projected, proposals.entries);
    else console.warn('[ProjectScope] proposals refused:', proposals.error);
  } catch (err: any) {
    console.warn('[ProjectScope] proposal generation failed:', err?.message);
  }

  const generatedAt = new Date().toISOString();
  const scope = assembleScope(understanding, blueprint, generatedAt);

  try {
    await record.update({ scope, scope_generated_at: generatedAt });
  } catch (err: any) {
    // Losing the cache is survivable; failing the customer's page over it is not.
    console.warn('[ProjectScope] could not cache scope:', err?.message);
  }

  return { ok: true, scope, cached: false };
}
