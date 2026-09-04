/**
 * buildBlueprint — the plan's 18-section Free Build Blueprint, as a projection.
 *
 * ## Why a projection and not a document
 *
 * §18 requires eighteen sections. It would be easy to hand a model the transcript and ask
 * for eighteen headings, and the result would read well and be untraceable: nobody could
 * say which sentence came from the customer and which the model composed.
 *
 * Most of a blueprint is not new information. "Intended users" is the `actors` the customer
 * already named; "Workflow map" is `current_workflow`; "Important decisions" are the items
 * already classified DECISION. Those sections are DERIVED, and deriving them keeps every
 * line attached to the quote it came from.
 *
 * What genuinely is new - the proposed application, the agents, the architecture and UX
 * direction, the Release 1 recommendation - is ours, not theirs. It gets generated, and it
 * is marked as proposal so that it never reads as something the customer said.
 *
 * ## The distinction this file exists to hold
 *
 *     HEARD     - their words, traceable to a quote
 *     PROPOSED  - our suggestion, which nobody has agreed to
 *     OPEN      - a question or decision still outstanding
 *
 * §16 says do not merge assumptions into facts. A blueprint is exactly where that merge
 * would happen unnoticed, because a blueprint is a persuasive document: everything in it
 * acquires the same authority from the formatting alone. Keeping the three apart is the
 * same rule applied one layer up, where the stakes are higher because this is the artifact
 * the customer reads before deciding to pay.
 *
 * ## Convertible without retyping
 *
 * §18 also requires that the free blueprint convert into paid delivery truth without
 * re-entering everything. A projection satisfies that by construction: the paid side can
 * consume the same `ProjectUnderstanding` and the same section mapping, and what a customer
 * confirmed while it was free is still confirmed - with its provenance - after they pay.
 */

import {
  itemsFor,
  openQuestions,
  decisionsForCustomer,
  confidenceProfile,
  type ProjectUnderstanding,
  type UnderstandingItem,
  type UnderstandingDimension,
} from './projectUnderstanding';

/* ── Section definitions ──────────────────────────────────────────── */

export type SectionKind = 'heard' | 'proposed' | 'open';

export interface BlueprintSectionSpec {
  key: string;
  /** The plan's own heading, §18, in the plan's order. */
  title: string;
  kind: SectionKind;
  /** Dimensions this section is derived from. Empty for sections we must propose. */
  dimensions: UnderstandingDimension[];
}

export const BLUEPRINT_SECTIONS: BlueprintSectionSpec[] = [
  { key: 'what_we_heard', title: 'What we heard', kind: 'heard', dimensions: [] },
  { key: 'business_problem', title: 'Business problem', kind: 'heard', dimensions: ['problem', 'pain_points'] },
  { key: 'intended_users', title: 'Intended users', kind: 'heard', dimensions: ['actors'] },
  {
    key: 'workflow_map',
    title: 'Workflow map',
    kind: 'heard',
    dimensions: ['current_workflow', 'inputs', 'outputs', 'exceptions'],
  },
  { key: 'ai_opportunities', title: 'AI opportunities', kind: 'heard', dimensions: ['ai_opportunities'] },
  {
    key: 'human_responsibilities',
    title: 'Human responsibilities',
    kind: 'heard',
    dimensions: ['human_only_decisions', 'approval_points'],
  },
  { key: 'proposed_application', title: 'Proposed application', kind: 'proposed', dimensions: [] },
  { key: 'proposed_agents', title: 'Proposed AI agents', kind: 'proposed', dimensions: [] },
  { key: 'integrations', title: 'Integrations', kind: 'heard', dimensions: ['systems', 'integrations'] },
  { key: 'data_considerations', title: 'Data considerations', kind: 'heard', dimensions: ['data', 'security_context'] },
  { key: 'trust_blueprint', title: 'Trust Before Intelligence blueprint', kind: 'proposed', dimensions: [] },
  { key: 'architecture_direction', title: 'Architecture direction', kind: 'proposed', dimensions: [] },
  { key: 'ux_direction', title: 'UX direction', kind: 'proposed', dimensions: [] },
  { key: 'release_1', title: 'Release 1 recommendation', kind: 'proposed', dimensions: ['delivery_profile'] },
  { key: 'important_decisions', title: 'Important decisions', kind: 'open', dimensions: [] },
  { key: 'assumptions', title: 'Assumptions', kind: 'open', dimensions: ['assumptions'] },
  { key: 'risks_unknowns', title: 'Risks and unknowns', kind: 'open', dimensions: ['unknowns', 'constraints'] },
  { key: 'next_step', title: 'Next step', kind: 'proposed', dimensions: [] },
];

/* ── The projected document ───────────────────────────────────────── */

export interface BlueprintEntry {
  value: string;
  classification: UnderstandingItem['classification'];
  /** Their words, when this line came from their words. */
  source_quote?: string;
}

export interface BlueprintSection {
  key: string;
  title: string;
  kind: SectionKind;
  entries: BlueprintEntry[];
  /**
   * True when this section has nothing yet AND cannot be derived - it is waiting on
   * generation. Distinct from a derived section that is simply empty because the customer
   * never mentioned it, which is a gap in the CONVERSATION and is reported as such.
   */
  needs_generation: boolean;
  /** Set on a derived section the conversation never touched. */
  not_discussed: boolean;
}

export interface BuildBlueprint {
  title: string;
  proposed_surfaces: string[];
  sections: BlueprintSection[];
  readiness: BlueprintReadiness;
}

export interface BlueprintReadiness {
  /** Derived sections that the conversation actually supplied something for. */
  sections_with_content: number;
  /** Sections that still need to be written by us. */
  sections_needing_generation: number;
  /** Derived sections the customer never covered - the honest list of what to ask next. */
  not_discussed: string[];
  fact_ratio: number;
  /**
   * Whether this is strong enough to put in front of a customer.
   *
   * Deliberately conservative. A blueprint assembled from three items and fourteen empty
   * headings is not a wow moment, it is evidence that the interview did not happen - and
   * showing it would do more damage than saying the call was too short.
   */
  presentable: boolean;
  /** Always populated when `presentable` is false, so a caller never has to guess why. */
  not_presentable_because?: string;
}

const entryFrom = (item: UnderstandingItem): BlueprintEntry => ({
  value: item.value,
  classification: item.classification,
  ...(item.source_quote ? { source_quote: item.source_quote } : {}),
});

/**
 * The "What we heard" opener: what they told us, in their own words, and nothing else.
 *
 * Only FACT items, because this section's whole job is to show the customer we listened.
 * An inference in here would be us telling them what they said, which is the fastest way to
 * lose the room in a document whose first purpose is to earn trust.
 */
function whatWeHeard(u: ProjectUnderstanding): BlueprintEntry[] {
  return u.items.filter((i) => i.classification === 'FACT').map(entryFrom);
}

/**
 * Project an understanding into the blueprint's shape.
 *
 * Pure and deterministic: same understanding in, same blueprint out. The generated sections
 * are left explicitly empty rather than filled with plausible filler, because a section
 * that says "needs generation" is a to-do and a section of confident boilerplate is a lie
 * with a heading on it.
 */
export function projectBlueprint(u: ProjectUnderstanding): BuildBlueprint {
  const sections: BlueprintSection[] = BLUEPRINT_SECTIONS.map((spec) => {
    let entries: BlueprintEntry[] = [];

    if (spec.key === 'what_we_heard') {
      entries = whatWeHeard(u);
    } else if (spec.key === 'important_decisions') {
      entries = decisionsForCustomer(u).map(entryFrom);
    } else if (spec.key === 'assumptions') {
      // Everything we assumed, wherever it was filed - not just the `assumptions`
      // dimension.
      //
      // Found by projecting a real call: an inference about who approves spending sat
      // under "Human responsibilities" classified ASSUMPTION, while this section read
      // "not discussed". A blueprint whose Assumptions heading is empty tells the reader
      // there were none, which was the opposite of the truth and exactly the place §16's
      // rule stops being enforced - the section that exists to make assumptions visible
      // was the one hiding them.
      entries = [
        ...u.items.filter((i) => i.classification === 'ASSUMPTION'),
        ...itemsFor(u, 'assumptions'),
      ]
        .filter((item, i, all) => all.findIndex((x) => x.value === item.value) === i)
        .map(entryFrom);
    } else if (spec.key === 'risks_unknowns') {
      entries = [
        ...spec.dimensions.flatMap((d) => itemsFor(u, d)),
        ...openQuestions(u),
      ]
        // A QUESTION filed under `unknowns` would otherwise appear twice.
        .filter((item, i, all) => all.findIndex((x) => x.value === item.value) === i)
        .map(entryFrom);
    } else {
      entries = spec.dimensions.flatMap((d) => itemsFor(u, d)).map(entryFrom);
    }

    const derivable =
      spec.key === 'what_we_heard' ||
      spec.key === 'important_decisions' ||
      spec.key === 'assumptions' ||
      spec.dimensions.length > 0;

    return {
      key: spec.key,
      title: spec.title,
      kind: spec.kind,
      entries,
      needs_generation: spec.kind === 'proposed' && entries.length === 0,
      not_discussed: derivable && spec.kind !== 'proposed' && entries.length === 0,
    };
  });

  return {
    title: u.title,
    proposed_surfaces: u.proposed_surfaces,
    sections,
    readiness: assessReadiness(u, sections),
  };
}

/**
 * Minimum bar for showing a customer their blueprint.
 *
 * These numbers are a judgement, and a conservative one: four derived sections and six
 * facts is not much, but it is enough that the document describes THEIR business rather
 * than a template. Below it, the right move is another conversation, not a prettier PDF.
 */
export const MIN_SECTIONS_WITH_CONTENT = 4;
export const MIN_FACTS = 6;

function assessReadiness(u: ProjectUnderstanding, sections: BlueprintSection[]): BlueprintReadiness {
  const derived = sections.filter((s) => s.kind !== 'proposed');
  const withContent = derived.filter((s) => s.entries.length > 0);
  const profile = confidenceProfile(u);

  const readiness: BlueprintReadiness = {
    sections_with_content: withContent.length,
    sections_needing_generation: sections.filter((s) => s.needs_generation).length,
    not_discussed: derived.filter((s) => s.not_discussed).map((s) => s.title),
    fact_ratio: profile.fact_ratio,
    presentable: true,
  };

  if (profile.facts < MIN_FACTS) {
    readiness.presentable = false;
    readiness.not_presentable_because = `only ${profile.facts} confirmed facts; the conversation was too thin to describe their business`;
  } else if (withContent.length < MIN_SECTIONS_WITH_CONTENT) {
    readiness.presentable = false;
    readiness.not_presentable_because = `only ${withContent.length} of ${derived.length} derived sections have content`;
  }

  return readiness;
}
