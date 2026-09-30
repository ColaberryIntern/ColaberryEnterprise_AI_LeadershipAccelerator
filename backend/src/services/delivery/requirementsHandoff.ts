/**
 * requirementsHandoff — where the free experience becomes paid delivery truth.
 *
 * §18 requires that the free blueprint convert "into paid delivery truth without retyping
 * everything". The target is not a new system: the platform already runs a proven pipeline
 * behind /portal/projects -
 *
 *     materializeRequirementsFromDocument(projectId, docText) -> RequirementsMap rows
 *     createTasksFromRequirements                             -> StudentTask
 *     smartRequirementVerifier                                -> requirement vs real repo files
 *
 * so this renders a document that pipeline already understands, and hands it over.
 * (Decision, Ali, 2026-09-04: convert AT ACTIVATION, not before. See REUSE_MAP.md.)
 *
 * ## Only what the customer stood behind may cross
 *
 * `RequirementsMap` verifies a requirement against CODE - "is it built?" - and carries no
 * provenance at all. Nothing downstream can tell whether a requirement came from the
 * customer's mouth or from a model's guess, and once a row exists it will be verified,
 * tasked, and built.
 *
 * So the filter has to happen HERE, on the way in, while provenance still exists. An
 * assumption must not become a governed requirement by passing through a checkout. Only
 * `client_confirmed` items cross, which is exactly what §17's confirmation step produces.
 *
 * ## The ten-character trap
 *
 * The existing parser skips any bullet whose text is 10 characters or fewer, treating it as
 * a sub-bullet or noise. That is reasonable for a generated document and dangerous for a
 * handover: a genuinely confirmed requirement that happens to be terse would be dropped
 * with no error anywhere, and would simply never be built.
 *
 * So this reports every item it knows the parser will discard, rather than discovering the
 * shortfall later as a requirement nobody can find. A silent drop at the boundary between
 * free and paid is the worst possible place for one.
 */

import {
  itemsFor,
  UNDERSTANDING_DIMENSIONS,
  DIMENSION_LABELS,
  type ProjectUnderstanding,
  type UnderstandingItem,
} from './projectUnderstanding';
import type { BuildBlueprint } from './buildBlueprint';

/** The parser's own threshold: `if (text.length > 10)`. Mirrored so it can be asserted on. */
export const PARSER_MIN_TEXT_LENGTH = 11;

export interface HandoffExclusion {
  value: string;
  reason: string;
}

export interface RenderedRequirements {
  doc_text: string;
  /** Requirements that will survive the parser. */
  included: number;
  /** Everything that did not cross, and why. Never silent. */
  excluded: HandoffExclusion[];
}

const crossable = (item: UnderstandingItem): boolean => item.provenance === 'client_confirmed';

/**
 * Render the confirmed understanding as a requirements document the existing parser reads.
 *
 * Format is dictated by `parseRequirementsWithSections`: `##` section headers, `-` bullets.
 * Nothing here is decorative - a change to the heading level or the bullet character would
 * silently produce zero requirements.
 */
export function renderRequirementsDocument(
  u: ProjectUnderstanding,
  options: { blueprint?: BuildBlueprint; includeAcceptedProposals?: boolean } = {},
): RenderedRequirements {
  const excluded: HandoffExclusion[] = [];
  const lines: string[] = [`# ${u.title}`, ''];
  let included = 0;

  /** A bullet the parser will actually keep, or an exclusion explaining why not. */
  const acceptable = (text: string): boolean => {
    if (text.length < PARSER_MIN_TEXT_LENGTH) {
      excluded.push({ value: text, reason: 'too short for the requirements parser (needs > 10 characters)' });
      return false;
    }
    return true;
  };

  UNDERSTANDING_DIMENSIONS.forEach((dimension) => {
    const all = itemsFor(u, dimension);
    if (all.length === 0) return;

    all
      .filter((i) => !crossable(i))
      .forEach((i) =>
        excluded.push({
          value: i.value,
          reason: `not confirmed by the customer (provenance: ${i.provenance})`,
        }),
      );

    const body = all
      .filter(crossable)
      .filter((i) => acceptable(i.value))
      .map((i) => `- ${i.value}`);

    // Only open a section that earned one. An empty heading reads as a dimension nobody had
    // anything to say about, which is a different claim from one whose items were excluded.
    if (body.length > 0) {
      lines.push(`## ${DIMENSION_LABELS[dimension]}`, '', ...body, '');
      included += body.length;
    }
  });

  // Proposals are OURS, not theirs, so they cross only when the customer has accepted the
  // blueprint - which is what paying for it means. They are labelled in the document so a
  // reader can still tell a proposal from something the customer asked for.
  if (options.includeAcceptedProposals && options.blueprint) {
    options.blueprint.sections
      .filter((s) => s.kind === 'proposed' && s.entries.length > 0)
      .forEach((s) => {
        const before = included;
        const body: string[] = [];
        s.entries.forEach((e) => {
          if (e.value.length < PARSER_MIN_TEXT_LENGTH) {
            excluded.push({ value: e.value, reason: 'too short for the requirements parser (needs > 10 characters)' });
            return;
          }
          body.push(`- ${e.value}`);
          included += 1;
        });
        if (included > before) {
          lines.push(`## ${s.title} (proposed)`, '', ...body, '');
        }
      });
  } else if (options.blueprint) {
    options.blueprint.sections
      .filter((s) => s.kind === 'proposed')
      .forEach((s) =>
        s.entries.forEach((e) =>
          excluded.push({ value: e.value, reason: 'proposal not accepted by the customer' }),
        ),
      );
  }

  // Rebuild cleanly: the section assembly above pushes headers only when a section earned
  // one, so the accumulated `lines` is already correct — but strip trailing blanks so the
  // document does not end in whitespace the parser has to skip.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  return { doc_text: lines.join('\n'), included, excluded };
}

export type HandoffResult =
  | { ok: true; requirements_created: number; included: number; excluded: HandoffExclusion[]; doc_text: string }
  | { ok: false; error: string; excluded: HandoffExclusion[] };

/**
 * Hand a confirmed understanding to the existing requirements pipeline.
 *
 * Refuses rather than handing over an empty document. A project activated with zero
 * requirements looks identical to one whose handover silently failed, and the customer
 * would be paying for a build with nothing in it.
 */
export async function handOffToRequirements(params: {
  projectId: string;
  understanding: ProjectUnderstanding;
  blueprint?: BuildBlueprint;
  includeAcceptedProposals?: boolean;
  /** Injected so this can be tested without the whole student-platform stack. */
  materialize?: (projectId: string, docText: string) => Promise<number>;
}): Promise<HandoffResult> {
  const rendered = renderRequirementsDocument(params.understanding, {
    blueprint: params.blueprint,
    includeAcceptedProposals: params.includeAcceptedProposals,
  });

  if (rendered.included === 0) {
    return {
      ok: false,
      error:
        'nothing the customer confirmed survived into the requirements document — handing over an empty project would look identical to a silent failure',
      excluded: rendered.excluded,
    };
  }

  const materialize =
    params.materialize ||
    (async (projectId: string, docText: string) => {
      const { materializeRequirementsFromDocument } = await import('../requirementsMaterializeService');
      return materializeRequirementsFromDocument(projectId, docText);
    });

  try {
    const created = await materialize(params.projectId, rendered.doc_text);
    return {
      ok: true,
      requirements_created: created,
      included: rendered.included,
      excluded: rendered.excluded,
      doc_text: rendered.doc_text,
    };
  } catch (err: any) {
    return { ok: false, error: `materialize failed: ${err?.message || 'unknown'}`, excluded: rendered.excluded };
  }
}
