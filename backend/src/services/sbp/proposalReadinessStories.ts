/**
 * proposalReadinessStories - the P1-P8 proposal ladder that fills the R1 release.
 *
 * M3. A gov project's R1 (Proposal) release is the ladder the intern actually works during
 * a pursuit. These eight stories are injected as board rows at materialize time (exactly like
 * STORY-000 Command Center and STORY-900 Connected Demo), gated behind a gov-only ctx flag,
 * chained P1 -> P2 -> ... -> P8 by blocked_by set at injection time.
 *
 * The titles follow the approved human workflow (orient, rapport, draft, Sharath collect-loop,
 * review gates, human QA, submit, mark-submitted). The CONTENT of each story is grounded in the
 * shipped proposal engine so the ladder matches real code, not invented terms:
 *   Blueprint (buildProposalBlueprint / reanalyzeProposalBlueprint),
 *   Build (buildOutline + draftProposalSection + assemble),
 *   Judge (the six checks: coverage 25, evaluator 25, proof 15, clarity 15, format 10, fact 10;
 *          pass = weighted >= 95, no check < 85, no fatal finding, no open gap),
 *   Revise, Needs (the typed-needs inbox: fact, decision, file, signature, approval, confirm_rule,
 *          setting), Gold (one human go/no-go, separation of duties), Package (PDFs + sealed price
 *          file + compliance matrix + manifest; exporting is not submitting).
 *
 * Governance woven into the acceptance: drafts only (nothing auto-sends), never fabricate a fact,
 * every claim cites a source, and submission is always a deliberate human action.
 */
import type { BuildPlan } from './planContract';
import { COMMAND_CENTER_STORY_ID } from './commandCenterStory';
import { CONNECTED_DEMO_STORY_ID } from './connectedDemoStory';

export const PROPOSAL_STORY_IDS = [
  'STORY-P1', 'STORY-P2', 'STORY-P3', 'STORY-P4',
  'STORY-P5', 'STORY-P6', 'STORY-P7', 'STORY-P8',
] as const;

export type ProposalStoryId = (typeof PROPOSAL_STORY_IDS)[number];

/**
 * The subject tag every intern email to Sharath must carry. Sharath is cross-copied on many
 * projects, so his inbox traffic is noisy; this tag marks the gov-contract thread, and his replies
 * keep it (Re: [Gov Proposal] ...). The Gov Proposal Studio tab's inbox watcher keys on this exact
 * tag so only gov-contract mail from Sharath wakes the tab. Keep in sync with GOV_PROPOSAL_TAG_WORDS
 * in the watcher.
 */
export const GOV_PROPOSAL_EMAIL_TAG = '[Gov Proposal]';

/** The row columns the materializer needs, identical in shape to the Command Center / demo columns. */
export interface ProposalStoryColumns {
  story_id: string;
  title: string;
  narrative: string;
  build: string;
  acceptance: string[];
}

interface ProposalStorySpec {
  id: ProposalStoryId;
  title: string;
  narrative: string;
  acceptance: string[];
  /** A short, grounded build prompt. `project` is the plan's project name for context. */
  build: (project: string) => string;
}

const SPECS: readonly ProposalStorySpec[] = [
  {
    id: 'STORY-P1',
    title: 'P1 - Orient to the pursuit',
    narrative: 'As the builder, I want to orient to this pursuit from the real solicitation, the Command Center, and the connected demo, so that every later step starts from grounded requirements and a working system.',
    acceptance: [
      'Given the gov project, When R1 opens, Then P1 is unblocked and points to the Command Center and the connected demo already built in R0.',
      'Given the solicitation blueprint, When I read it, Then I can name the scoring rubric, the required forms, and the page limits before any drafting.',
      'Trust: the orientation cites the real solicitation; it never invents a requirement, a form, or a limit.',
    ],
    build: (p) => `Orient on "${p}". Read the proposal Blueprint (buildProposalBlueprint / reanalyzeProposalBlueprint) and open the Command Center (STORY-000) and connected demo (STORY-900) already materialized in R0. Write down the scoring rubric, the forms, and the page limits from the blueprint. Produce no draft yet - this is orientation only.`,
  },
  {
    id: 'STORY-P2',
    title: 'P2 - Establish rapport with the client contract manager',
    narrative: 'As the builder, I want a relationship with the single authorized client contact - the person managing this contract - so that the pursuit has a real line to the client and I never reach out to anyone I am not allowed to.',
    acceptance: [
      'Given the solicitation, When I identify the client contact, Then I use ONLY the contract-managing contact whose information is included, and never anyone else at the client.',
      'Given the pursuit is active, When I engage the client, Then I email the authorized contact at least once, as a DRAFT held for Ali, never auto-sent.',
      'Given the client holds a meeting, When one is scheduled, Then I bring a prepared set of questions to ask.',
      'Trust: the only external person contacted about this pursuit is the one authorized client contact, and every outreach is a draft Ali approves before it is sent.',
    ],
    build: (p) => `For "${p}", identify the single authorized client contact - the person managing this contract, whose information is included in the solicitation - and treat them as the ONLY external person you may contact about the pursuit. Email them at least once (DRAFT only, held for Ali, never auto-sent), and prepare a set of questions to ask at any client meeting. Do not reach out to anyone else at the client. (Sharath, the internal lead, is contacted later when the documents are built and submitted - P4 and P7 - not here.)`,
  },
  {
    id: 'STORY-P3',
    title: 'P3 - Draft the proposal',
    narrative: 'As the builder, I want a grounded first draft of every required section, so that review has real content to judge and gaps are made explicit.',
    acceptance: [
      'Given the blueprint, When I build the draft, Then every required section has a grounded draft or an explicit [PLACEHOLDER].',
      'Given a missing fact, When a section needs it, Then it becomes a [PLACEHOLDER] and a typed need, never a guess.',
      'Trust: every claim in the draft traces to a cited source; nothing is fabricated to fill a gap.',
    ],
    build: (p) => `Build the "${p}" draft: buildOutline, then draftProposalSection per section grounded in the cited blueprint, then assemble and save version 1. Any fact you do not have becomes a [PLACEHOLDER] and a need for P4 - do not invent a price, a date, a reference, or a past-performance claim.`,
  },
  {
    id: 'STORY-P4',
    title: 'P4 - Collect from Sharath (needs loop)',
    narrative: 'As the builder, I want the open needs resolved by the right human, so that every [PLACEHOLDER] is filled with a real answer before review.',
    acceptance: [
      'Given the draft, When needs are aggregated, Then each open item is typed (fact, decision, file, signature, approval, confirm_rule, setting) and routed to Sharath or Ali.',
      'Given Sharath answers a need, When the answer lands, Then the need resolves and the draft updates from it.',
      'Trust: a need is never silently closed without a real answer, and a signature or approval is never synthesized.',
    ],
    build: (p) => `Work the typed-needs inbox for "${p}" (aggregateNeeds / collectProjectNeeds / resolveNeed). Route each open need to Sharath (via the collection form) or Ali. When an answer returns, resolve the need and update the section. Do not close a need without its answer. Every email to Sharath about this pursuit carries ${GOV_PROPOSAL_EMAIL_TAG} in the subject, so his replies stay tracked to the gov contract.`,
  },
  {
    id: 'STORY-P5',
    title: 'P5 - Review gates (the six checks)',
    narrative: 'As the builder, I want the proposal judged against the six checks and only the failing sections revised, so that the package reaches the quality bar without churning passing work.',
    acceptance: [
      'Given the assembled draft, When the judge runs, Then each of the six checks reports a score (coverage, evaluator, proof, clarity, format, fact).',
      'Given a check below gate, When I revise, Then only the failing sections change, up to the iteration cap; pass is weighted >= 95 with no check < 85, no fatal finding, and no open gap.',
      'Trust: the scores are the independent judge\'s, never self-asserted by the drafter.',
    ],
    build: (p) => `Run the six checks on "${p}" (runProposalDocumentChecks / documentChecks + judgeRuns): coverage 25, evaluator 25, proof 15, clarity 15, format 10, fact 10. Revise only the failing sections (runReviewCycle), up to the cap. Target: weighted >= 95, no check < 85, no fatal finding, no open gap.`,
  },
  {
    id: 'STORY-P6',
    title: 'P6 - Human QA checklist',
    narrative: 'As the builder, I want a human QA pass before the go decision, so that a person has checked the package the automated checks cannot fully judge.',
    acceptance: [
      'Given a passing draft, When QA runs, Then a human QA checklist is completed and recorded against the package.',
      'Given a QA item fails, When it is raised, Then it returns to P5 revision before the go decision.',
      'Trust: QA is a person\'s recorded sign-off, not an AI claim of readiness.',
    ],
    build: (p) => `Complete the human QA checklist for "${p}": forms present and correct, page limits met, pricing consistent, no [PLACEHOLDER] left, compliance matrix complete. Record who signed off. Any failure returns to P5.`,
  },
  {
    id: 'STORY-P7',
    title: 'P7 - Submit to Sharath: go decision and package',
    narrative: 'As the builder, I want one human go/no-go and then the assembled package, so that submission is gated by a person and the package is complete.',
    acceptance: [
      'Given QA is complete, When the go decision is made, Then one human go/no-go gates the whole package (separation of duties from the drafter).',
      'Given a go, When the package assembles, Then it produces the PDFs, the sealed price file, the compliance matrix, and the manifest, marked DRAFT / NOT FOR SUBMISSION until a human submits.',
      'Trust: no package is marked submission-ready without the recorded human go decision.',
    ],
    build: (p) => `Take "${p}" through the Gold gate (goldGate): one human go/no-go, separated from whoever drafted. On go, assemble the submission package (buildProposalPackage): PDFs + sealed price file + compliance matrix + manifest. Exporting is not submitting - the package stays DRAFT / NOT FOR SUBMISSION. Hand it to Sharath for the actual portal submission, with ${GOV_PROPOSAL_EMAIL_TAG} in the subject so the handoff is tracked to the gov contract.`,
  },
  {
    id: 'STORY-P8',
    title: 'P8 - Mark submitted',
    narrative: 'As the builder, I want the pursuit marked submitted only after a human submits, so that the pipeline (and later the Revenue Room) reflects reality.',
    acceptance: [
      'Given the human has submitted to the portal, When I mark the pursuit submitted, Then it is a deliberate, recorded human action with the submission date.',
      'Given no human submission yet, When nothing has been filed, Then the pursuit is not marked submitted.',
      'Trust: the system never claims a submission that a human did not actually make.',
    ],
    build: (p) => `After Sharath confirms the portal submission of "${p}", mark the pursuit submitted with the real submission date. This is the signal M5\'s Revenue Room reads to record a potential win (with dollar value and close date). Never mark submitted on your own.`,
  },
];

/**
 * All eight proposal stories in ladder order, as row columns for the materializer.
 * `plan.project_name` grounds each build prompt. Pure; deterministic.
 */
export function proposalReadinessTaskColumns(plan: BuildPlan): ProposalStoryColumns[] {
  const project = plan?.project_name || 'this pursuit';
  return SPECS.map((s) => ({
    story_id: s.id,
    title: s.title,
    narrative: s.narrative,
    build: s.build(project),
    acceptance: [...s.acceptance],
  }));
}

/**
 * The head of the P-chain gates on the last R0 Foundation story so R1 is visibly locked until the
 * Foundation release lands. The connected demo (STORY-900) is the last R0 row when present, else the
 * Command Center (STORY-000). The materializer passes which one exists.
 */
export function proposalChainHeadBlockedBy(hasConnectedDemo: boolean): string[] {
  return [hasConnectedDemo ? CONNECTED_DEMO_STORY_ID : COMMAND_CENTER_STORY_ID];
}
