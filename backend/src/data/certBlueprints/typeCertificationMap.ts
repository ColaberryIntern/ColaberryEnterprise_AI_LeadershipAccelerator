/**
 * Which exam objectives a card type evidences, and — more importantly — which
 * types cannot be mapped at this grain at all.
 *
 * `curriculum_type_definitions.certification_mapping` is a jsonb column that
 * has been empty on all 53 active types. Filling it is the third of the four
 * classroom phases, and it is the one that needs judgement rather than typing,
 * because a wrong mapping does not fail loudly. It reads as progress.
 *
 * THE FINDING THAT SHAPED THIS FILE. Most types cannot honestly be mapped at
 * the TYPE level, because the objective depends on the instance rather than the
 * kind. `implementation_task` is a real evidence-producing type, and what a
 * given implementation task evidences is whatever that week asked the student
 * to build — subagents in Week 7, structured extraction in Week 9. Mapping the
 * type to a fixed objective would credit every student who ever completed one
 * with the same evidence, whatever they actually built.
 *
 * So this file is deliberately short, and the types it leaves out are listed
 * with the reason. Three grains exist and each is right for something:
 *
 *   type   →  objective   this file, for types whose SUBJECT is the type
 *   card   →  objective   per week, where the subject is the week's topic
 *   signal →  objective   CCAR_F_MATCH_RULES, for what an artifact contains
 *
 * The second grain does not exist yet. That is a real gap and it is named here
 * rather than papered over by mapping the type and hoping.
 *
 * `github_sync` IS NOT HERE, AND THAT IS THE POINT OF CHECKING. It was in the
 * first draft of this map, mapped to D3.6 and proposed as portfolio-eligible.
 * Production does not have it: the type was removed when syncing became a
 * background process. It appeared in the type list I read because that list
 * came from a LOCAL database that also happens to be called accelerator_prod.
 * D3.6 is still reachable through the github_pr evidence signal, which is the
 * right grain for it anyway - a pull request is the artifact, not the sync.
 *
 * OVERLAP WITH THE SIGNAL GRAIN IS SAFE, AND WAS CHECKED RATHER THAN ASSUMED.
 * `prompt_lab` claims D4.1-D4.3 here, and CCAR_F_MATCH_RULES also reaches
 * D4.1-D4.3 through the prompt_library artifact and the prompt_lab signal.
 * That cannot inflate anything: `computeReadiness` counts DISTINCT objectives —
 * `verifiedObjectives` is a Set keyed `domain:objective` — so two sources
 * evidencing one objective count once. More evidence for one objective is
 * better evidence, not more credit. The test file lists the overlap explicitly
 * so a NEW one has to be acknowledged rather than appearing by accident.
 *
 * NOTHING HERE AWARDS ANYTHING. A mapping makes a completed card a CANDIDATE
 * for evidence; `cert_evidence_mappings` still lands it as `pending`, and
 * readiness still counts only what a named human verified. The same rule that
 * governs the rest of Cert Prep.
 */

export interface TypeCertificationMapping {
  /** The curriculum type slug, as it appears in curriculum_type_definitions. */
  type_slug: string;
  /** Objectives finishing one of these genuinely evidences. */
  objective_ids: string[];
  /** Why. Stored with the mapping so a reviewer sees the reasoning. */
  rationale: string;
}

/**
 * Mapped types: the subject of the work IS the type, not the week's topic.
 */
export const TYPE_CERTIFICATION_MAP: TypeCertificationMapping[] = [
  {
    type_slug: 'prompt_lab',
    objective_ids: ['D4.1', 'D4.2', 'D4.3'],
    rationale:
      'A Prompt Lab is prompt engineering whatever the week is about: the student writes criteria, works an example set, and enforces an output shape. That is D4.1, D4.2 and D4.3 by construction rather than by topic.',
  },
  {
    type_slug: 'prompt_challenge',
    objective_ids: ['D4.1'],
    rationale:
      'A challenge is a precision exercise on one prompt — explicit criteria, fewer false positives. It does not reach few-shot or schema enforcement, so it maps to D4.1 alone.',
  },
  {
    type_slug: 'claude_code_technique',
    objective_ids: ['D3.5'],
    rationale:
      'A technique card is iterative refinement practised deliberately, which is D3.5. It does NOT evidence CLAUDE.md hierarchy or CI integration — those are different techniques with their own cards.',
  },
  {
    type_slug: 'setup_lab',
    objective_ids: ['D3.1'],
    rationale:
      'A setup lab configures the workspace: CLAUDE.md placement, scoping and what belongs at the root versus a subtree. That is D3.1 regardless of what is built afterwards.',
  },
];

/**
 * Types that produce real evidence and are deliberately NOT mapped here,
 * because the objective belongs to the instance rather than the kind.
 *
 * This list is as much the deliverable as the map above: it is the difference
 * between "we have not got to these" and "these cannot be answered at this
 * grain", and the second needs a card-level mapping to resolve.
 */
export const UNMAPPABLE_AT_TYPE_LEVEL: { type_slug: string; reason: string }[] = [
  {
    type_slug: 'implementation_task',
    reason: 'What it evidences is whatever that week asked the student to build — subagents in one week, extraction in another. Needs a card-level mapping.',
  },
  {
    type_slug: 'project_task',
    reason: 'Same as implementation_task: the subject is the story, not the type.',
  },
  {
    type_slug: 'artifact_submission',
    reason: 'The artifact decides. CCAR_F_MATCH_RULES already maps artifact SIGNALS to objectives, which is the right grain for this one.',
  },
  {
    type_slug: 'build_story',
    reason: 'A build story describes whatever was built. Its evidence value comes from the artifact it points at, not from being a build story.',
  },
  {
    type_slug: 'certification_exercise',
    reason: 'A sitting MEASURES knowledge; it is not evidence of having built anything. Readiness already counts it on the knowledge side, and mapping it here would count it twice.',
  },
  {
    type_slug: 'mock_interview',
    reason: 'Defensible against D5.5, and only when the interview actually covered human review and confidence. Left out rather than credited on the strength of the type name.',
  },
  {
    type_slug: 'architect_mindset',
    reason: 'A reflection on how the student would have worked differently. Real, and reflection is not evidence of a build.',
  },
];

/** Every objective id this file claims, for validation against the blueprint. */
export function mappedObjectiveIds(): string[] {
  return [...new Set(TYPE_CERTIFICATION_MAP.flatMap((m) => m.objective_ids))].sort();
}

/**
 * Types that leave a durable artifact somebody could be shown, and are not
 * already flagged. Kept small and justified per type: `portfolio_eligible`
 * decides whether finishing something offers to fill a student's portfolio,
 * and a portfolio assembled from everything is not a portfolio.
 */
export const PORTFOLIO_ELIGIBLE_ADDITIONS: { type_slug: string; rationale: string }[] = [
  {
    type_slug: 'setup_lab',
    rationale: 'Leaves a configured workspace and a written CLAUDE.md — a real artifact, and one an employer can read.',
  },
];
