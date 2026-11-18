/**
 * toolRequestDraftService — AF11.12. The I/O half of the drafter: load the rosters a draft must be
 * written against, call the model, hand back a normalized draft.
 *
 * Split from `toolRequestDrafter.ts` on the same seam the rest of this subtree uses: the prompt
 * and the normalizer are pure and testable without a network, and everything that touches the
 * database, the capability files or OpenAI lives here.
 *
 * ## THE ROSTERS ARE THE SAME ONES THE GATE WILL CHECK AGAINST
 *
 * `acceptToolRequest` refuses a capability id, a dataset name or an actor email that is not on the
 * roster the caller supplies. If the drafter were given a different or wider list, it would
 * confidently produce requests the gate then refuses by name, and the builder would read that as
 * the AI being broken rather than as a roster mismatch. So this loads from exactly the same
 * sources `fileChangeRequest` does: `loadDomainMatrix` for capabilities, `loadDatasetCatalog` for
 * datasets, `loadActorRoster` for people.
 *
 * ## AN ABSENT ROSTER IS NOT A FAILURE HERE
 *
 * The contract's rule is that an absent roster is a REFUSAL, never a silent pass — but that rule
 * belongs to the gate, which is deciding whether a request may stand. This is a drafting aid. If
 * the actor roster cannot be read, the right behaviour is to draft without `acts_on_output` and
 * let the gate refuse it with `actor_roster_absent`, which is a sentence the builder can act on.
 * Failing the draft instead would replace a nameable refusal with a broken button.
 *
 * ## THE MODEL CALL
 *
 * `getInstrumentedOpenAI` rather than a bare client, so the call emits an `ai_events` row with its
 * cost like every other model call in this backend. `temperature` is deliberately non-zero: Ali's
 * second mode is "ask the AI to come up with one randomly", and he described pressing it again to
 * get a different one, which a deterministic sample cannot do.
 */
import type { Sequelize } from 'sequelize';
import OpenAI from 'openai';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { loadDomainMatrix } from './capabilityRecord';
import { projectCapabilities } from './capabilityProjection';
import { datasetNames, loadDatasetCatalog } from './datasetCatalog';
import { actorEmails, loadActorRoster } from './actorRoster';
import {
  buildDraftMessages,
  normalizeDraft,
  normalizePackageDraft,
  type DraftContext,
  type DraftMode,
} from './toolRequestDrafter';
import { TOOL_REQUEST_VERBS } from './toolRequestDecisionContract';
import type { ToolRequestDetailInput } from './toolRequestContract';

/** The model that drafts. Small and cheap: this is a first draft a human is about to edit. */
const DRAFT_MODEL = 'gpt-4o-mini';
const DRAFT_MAX_TOKENS = 3000;
const DRAFT_TEMPERATURE = 0.6;

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!client) client = getInstrumentedOpenAI({ workflow_id: 'tool_request_draft' });
  return client;
}

/** Thrown when the model could not be reached or did not return usable JSON. */
export class ToolRequestDraftUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolRequestDraftUnavailableError';
  }
}

export interface DraftToolRequestArgs {
  readonly sequelize: Sequelize;
  readonly domainKey: string;
  readonly agentId: string | null;
  readonly agentDisplayName: string | null;
  readonly mode: DraftMode;
  readonly intent?: string | null;
}

export interface DraftToolRequestResult {
  readonly detail: ToolRequestDetailInput;
  /**
   * AF11.13 — the ten-block case, minus the three evidence blocks the drafter must not write.
   * Filed alongside the request so it "arrives finished".
   */
  readonly decisionPackage: Record<string, unknown>;
  /** What the draft was written against, so the form can say why a field was left blank. */
  readonly grounded_in: {
    readonly capabilities: number;
    readonly datasets: number;
    readonly actors: number;
    readonly actor_roster_absent: boolean;
  };
}

async function loadContext(args: DraftToolRequestArgs): Promise<{
  context: DraftContext;
  actorRosterAbsent: boolean;
}> {
  const matrix = loadDomainMatrix(args.domainKey);
  const projected = projectCapabilities(matrix.capabilities);

  let datasets: string[] = [];
  try {
    datasets = [...datasetNames(await loadDatasetCatalog(args.sequelize))];
  } catch {
    datasets = [];
  }

  let actors: string[] = [];
  let actorRosterAbsent = false;
  try {
    const roster = await loadActorRoster(args.sequelize);
    actors = [...actorEmails(roster)];
    actorRosterAbsent = actors.length === 0;
  } catch {
    actors = [];
    actorRosterAbsent = true;
  }

  return {
    actorRosterAbsent,
    context: {
      domainKey: args.domainKey,
      agentId: args.agentId,
      agentDisplayName: args.agentDisplayName,
      capabilities: projected.capabilities.map((c) => ({
        capability_id: c.capability_id,
        name: c.name,
      })),
      datasets,
      actors,
    },
  };
}

export async function draftToolRequest(
  args: DraftToolRequestArgs,
): Promise<DraftToolRequestResult> {
  if (args.mode === 'from_intent' && !String(args.intent || '').trim()) {
    throw new ToolRequestDraftUnavailableError('Say what you want the tool to do, in a sentence.');
  }

  const { context, actorRosterAbsent } = await loadContext(args);
  const messages = buildDraftMessages({
    mode: args.mode,
    intent: args.intent,
    context,
    verbs: TOOL_REQUEST_VERBS,
  });

  let content: string | null | undefined;
  try {
    const res = await openai().chat.completions.create({
      model: DRAFT_MODEL,
      temperature: DRAFT_TEMPERATURE,
      max_tokens: DRAFT_MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    content = res.choices[0]?.message?.content;
  } catch (e) {
    throw new ToolRequestDraftUnavailableError(
      `The drafter could not be reached: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!content) throw new ToolRequestDraftUnavailableError('The drafter returned nothing.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ToolRequestDraftUnavailableError('The drafter did not return usable JSON.');
  }

  // Two halves of one object now. A response shaped like the old one -- the detail at the top
  // level -- is still read correctly, so an older model reply does not come back as an empty draft.
  const root = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
    ? parsed as Record<string, unknown>
    : {};
  const detail = normalizeDraft(root.tool_request ?? root);
  const decisionPackage = normalizePackageDraft(root.decision_package);

  return {
    decisionPackage,
    // The agent is authoritative from the caller, never from the model: it was ownership-checked
    // before this ran, and a model-invented id would be refused by the gate as `agent_not_yours`.
    detail: args.agentId ? { ...detail, agent_id: args.agentId } : detail,
    grounded_in: {
      capabilities: context.capabilities.length,
      datasets: context.datasets.length,
      actors: context.actors.length,
      actor_roster_absent: actorRosterAbsent,
    },
  };
}
