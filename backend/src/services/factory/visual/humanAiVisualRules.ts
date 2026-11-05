/**
 * humanAiVisualRules — the eight standing rules for any human/AI story visual, as DATA (L10.5).
 *
 * ## Why these are a module and not a paragraph in a style guide
 *
 * `story-build` contained no rule about visuals at all, so every diagram was drawn from scratch
 * and the rules lived wherever they were last written down. Rules kept as prose decay: they get
 * restated, drift apart, and eventually describe a picture nobody renders. Rules kept as data
 * with a test apiece cannot drift without something going red.
 *
 * So `story-build/SKILL.md` REFERENCES this module rather than restating it. There is one copy of
 * each rule and it is this one.
 *
 * ## What this module is NOT
 *
 * It does not enforce anything at runtime, and it does not render. It is the contract that the
 * renderer is tested against: `__tests__/humanAiFlowSvg.test.ts` has one test per `id` below, and
 * a completeness test asserting the two sets match exactly. Adding a ninth rule without a test
 * fails; writing a test for a rule that is not declared here fails too.
 *
 * ## The honest limitation
 *
 * Several of these rules are about what the picture must SHOW, which a test can check, rather
 * than about whether the underlying decomposition is right, which it cannot. A diagram can obey
 * all eight and still describe a bad process faithfully. `humanAiStructure` and
 * `factoryPerspective` are what check the decomposition; these check the drawing of it.
 */

export interface VisualRule {
  /** Stable id. Tests are named after it, so renaming one is a visible change. */
  readonly id: string;
  /** The rule, in one line, as it would be said to a person drawing the picture. */
  readonly statement: string;
  /** What the renderer does to satisfy it, so a reader can find the behaviour in the output. */
  readonly rendererBehaviour: string;
  /** Why the rule exists. Every one of these was bought with a mistake. */
  readonly because: string;
}

export const HUMAN_AI_VISUAL_RULES: readonly VisualRule[] = [
  {
    id: 'VR1_EXPLICIT_SPLIT',
    statement: 'The human half and the AI half are drawn as separate, labelled lanes.',
    rendererBehaviour: 'Lanes are emitted per `LANE_ORDER` with `LANE_LABELS` text, and each lane carries its own task count.',
    because: 'A single undifferentiated flow is what the first cohort shipped. If the split is the point of the picture, it cannot be something the reader infers.',
  },
  {
    id: 'VR2_UNCLASSIFIED_NEVER_DEFAULTED',
    statement: 'A task with no allocation is drawn as UNCLASSIFIED, never quietly placed in a lane.',
    rendererBehaviour: '`laneOf` returns `unclassified` when no allocation row exists; it never falls back to human or AI.',
    because: 'A diagram that shows an unclassified task as human is worse than one admitting the gap, because it answers the question it was built to ask with a guess.',
  },
  {
    id: 'VR3_NAMED_SUBJECT_AGENTS',
    statement: 'Every agent is named and bounded to one business subject. No "AI", no "Automation", no "General".',
    rendererBehaviour: 'Each agent team renders its `name` and its `subject`; a task performed by an agent shows which team owns it.',
    because: 'An unnamed agent absorbs every AI task in the project. Nobody owns it and no subject bounds it, so it is the monolith with a new label.',
  },
  {
    id: 'VR4_ONE_SURFACE_CONVERGENCE',
    statement: 'Human tasks converge on as few surfaces as the work allows, and the console is shown as one place.',
    rendererBehaviour: 'Surfaces render as a single footer band naming each surface and the number of human tasks on it, with `external` marked as external.',
    because: 'Human tasks had an owner and no destination, so the only grouping primitive left was the role, and the generated app grew one screen and one login per role.',
  },
  {
    id: 'VR5_AGENT_SHOWS_APPROVER',
    statement: 'Every agent-performed task shows its human approver, or is flagged as having none.',
    rendererBehaviour: 'An AI node renders the approver role name; with no human APPROVER assignment it renders an explicit NO APPROVER flag rather than omitting the line.',
    because: 'An agent acting with no human approver is a materially different claim to make in a bid than one whose work a human signs off. A blank is read as the safe case.',
  },
  {
    id: 'VR6_PRE_AI_BASELINE',
    statement: 'The pre-AI baseline is stated, so the change is legible rather than asserted.',
    rendererBehaviour: 'Where `role_map` rows exist, the header states how many functions change and renders the previous function beside the role that carries what is left.',
    because: '"AI does most of it" means nothing without what it was before. A picture with no baseline cannot show improvement, only arrangement.',
  },
  {
    id: 'VR7_APPROVALS_HUMAN',
    statement: 'Approvals and irreversible actions are always on the human side.',
    rendererBehaviour: 'A task whose allocation is `ai_autonomous` while an APPROVER assignment exists renders the approver; the AI lane label states that it is approval-gated.',
    because: 'This is the one rule in the set that is about authority rather than legibility. An approval an agent grants itself is not an approval.',
  },
  {
    id: 'VR8_EMPTY_STATE_NAMED',
    statement: 'Every empty state says WHICH empty it is.',
    rendererBehaviour: 'No tasks renders "no decomposition yet"; tasks with no allocation renders "nothing allocated yet". The two strings are different and neither is blank.',
    because: 'A blank panel reads as "nothing to report", which is the false zero this whole system keeps having to catch. "Not generated" and "generated, found nothing" are different facts.',
  },
] as const;

/** The ids, for the completeness test and for anything that filters by rule. */
export const HUMAN_AI_VISUAL_RULE_IDS: readonly string[] =
  HUMAN_AI_VISUAL_RULES.map((r) => r.id);
