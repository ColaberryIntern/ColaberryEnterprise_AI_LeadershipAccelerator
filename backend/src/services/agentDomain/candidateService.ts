/**
 * Reading and writing capability candidates, and turning a row into something a page can render.
 *
 * ## Why the status comes from a JOIN and never from a column here
 *
 * A candidate points at up to two change requests and holds no status of its own. So every read
 * resolves those two rows and asks `nextStep()` where the candidate actually is. That costs one
 * extra query per page and buys the thing a status column cannot: when Ali approves a request
 * through the governance console, every candidate view changes on the next read, with nothing to
 * sync and nothing that can be stale.
 *
 * ## Self-scoping
 *
 * Every read here takes the domain keys the CALLER owns and filters on them. Nothing in this
 * module can return a domain the caller did not pass, which is the half of the scoping that lives
 * in code rather than in a route's good intentions. The route resolves ownership; this decides
 * what comes back. `agent-domains-mine` states the same split in its header: *"Section access
 * decides whether you may ask; ownership decides what comes back."*
 *
 * An empty list of keys returns an empty result, never the whole table. Treating "no filter" as
 * "no restriction" is how a scoping bug becomes a disclosure.
 */

import { Op } from 'sequelize';
import AgentDomainCandidate from '../../models/AgentDomainCandidate';
import AgentDomainChangeRequest from '../../models/AgentDomainChangeRequest';
import type {
  CandidateProductState,
  CandidateSource,
} from '../../db/ensureAgentDomainCandidateSchema';
import type { AgentChangeRequestStatus } from './agentChangeRequest';
import type { AutonomyLevel } from './autonomyLadder';
import { GATE_SIZE_BY_RUNG } from './builderPath';
import { nextStep } from './candidateFlow';
import { countsTowardGate } from './candidateStages';
// The PURE half lives next door and this module re-exports it, so `agentDomainSnapshot.ts`
// can import the section without importing a Sequelize model that calls `.init()` at module
// scope. Doing that from here broke five untouched suites, 138 tests, with
// `Cannot read properties of undefined (reading 'define')`.
import type { CandidateListResult, CandidateView } from './candidateSection';

export { candidatesSection } from './candidateSection';
export type { CandidateListResult, CandidateView } from './candidateSection';


const iso = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
};

/** The statuses of every request these candidates point at, by request id. */
async function statusesFor(ids: string[]): Promise<Map<string, AgentChangeRequestStatus>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await AgentDomainChangeRequest.findAll({
    where: { id: { [Op.in]: unique } },
    attributes: ['id', 'status'],
  });
  return new Map(rows.map((r) => [String(r.id), r.status]));
}

/**
 * The candidates in these domains, each with its position worked out.
 *
 * `rungByDomain` is optional; where a domain's rung is unknown the gate falls back to R0's size,
 * which is the smallest, so an unknown rung can never make the countdown look further along than
 * it is.
 */
export async function listCandidates(
  domainKeys: ReadonlyArray<string>,
  rungByDomain: Readonly<Record<string, AutonomyLevel>> = {},
): Promise<CandidateListResult> {
  const scoped = [...new Set(domainKeys.filter((k) => typeof k === 'string' && k.trim()))].sort();

  if (scoped.length === 0) {
    return {
      candidates: [],
      scoped_to_domains: [],
      reason: 'You are not recorded as the manager or the builder of any domain, so there is '
        + 'nothing scoped to you. This is an ownership gap in `org_members`, not a permissions '
        + 'problem: ask for your domain row rather than for a wider role.',
    };
  }

  const rows = await AgentDomainCandidate.findAll({
    where: { domain_key: { [Op.in]: scoped } },
    order: [['domain_key', 'ASC'], ['created_at', 'ASC'], ['title', 'ASC']],
  });

  const statuses = await statusesFor(
    rows.flatMap((r) => [r.screen_request_id, r.tool_request_id].filter(Boolean) as string[]),
  );

  // How many capabilities in each domain have already reached the watched stage. Computed in one
  // pass before the views are built, because the countdown on any one candidate is a fact about
  // its DOMAIN, and working it out per row would make each row disagree with its neighbours.
  const clearedByDomain = new Map<string, number>();
  for (const r of rows) {
    const toolStatus = r.tool_request_id ? statuses.get(r.tool_request_id) ?? null : null;
    const step = nextStep(
      {
        domain_key: r.domain_key,
        title: r.title,
        product_state: r.product_state,
        proven_by_hand_at: r.proven_by_hand_at,
        matched_feature_key: r.matched_feature_key,
      },
      {
        screen_status: r.screen_request_id ? statuses.get(r.screen_request_id) ?? null : null,
        tool_status: toolStatus,
      },
      1,
    );
    if (countsTowardGate(step.stage)) {
      clearedByDomain.set(r.domain_key, (clearedByDomain.get(r.domain_key) ?? 0) + 1);
    }
  }

  const candidates = rows.map((r) => {
    const rung = rungByDomain[r.domain_key];
    const gateSize = GATE_SIZE_BY_RUNG[rung ?? 'R0'];
    const screen_request_status = r.screen_request_id
      ? statuses.get(r.screen_request_id) ?? null
      : null;
    const tool_request_status = r.tool_request_id
      ? statuses.get(r.tool_request_id) ?? null
      : null;

    return {
      id: String(r.id),
      domain_key: r.domain_key,
      title: r.title,
      source: r.source,
      source_note: r.source_note,
      product_state: r.product_state,
      matched_feature_key: r.matched_feature_key,
      proven_by_hand_at: iso(r.proven_by_hand_at),
      screen_request_id: r.screen_request_id,
      screen_request_status,
      tool_request_id: r.tool_request_id,
      tool_request_status,
      step: nextStep(
        {
          domain_key: r.domain_key,
          title: r.title,
          product_state: r.product_state,
          proven_by_hand_at: r.proven_by_hand_at,
          matched_feature_key: r.matched_feature_key,
        },
        { screen_status: screen_request_status, tool_status: tool_request_status },
        gateSize,
        clearedByDomain.get(r.domain_key) ?? 0,
        rung,
      ),
    };
  });

  return {
    candidates,
    scoped_to_domains: scoped,
    reason: candidates.length === 0
      ? `No candidates have been put on the list yet for ${scoped.join(', ')}. An empty list `
        + 'means nobody has proposed anything, not that nothing qualifies.'
      : `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} across `
        + `${scoped.length} domain${scoped.length === 1 ? '' : 's'} you own.`,
  };
}

export interface CreateCandidateInput {
  readonly domain_key: string;
  readonly title: string;
  readonly source: CandidateSource;
  readonly source_note?: string | null;
}

/**
 * Put a candidate on the list.
 *
 * `findOrCreate` on `(domain_key, title)` rather than a plain create, because the list is seeded
 * repeatedly and the unique index would otherwise turn a re-seed into a 500. The caller is told
 * which happened so a page can say "already on the list" rather than claiming a new one.
 */
export async function createCandidate(
  input: CreateCandidateInput,
): Promise<{ candidate: AgentDomainCandidate; created: boolean }> {
  const [candidate, created] = await AgentDomainCandidate.findOrCreate({
    where: { domain_key: input.domain_key, title: input.title },
    defaults: {
      domain_key: input.domain_key,
      title: input.title,
      source: input.source,
      source_note: input.source_note ?? null,
      product_state: 'unchecked',
      matched_feature_key: null,
      proven_by_hand_at: null,
      screen_request_id: null,
      tool_request_id: null,
    } as never,
  });
  return { candidate, created };
}

/** Record what the front door said about this candidate. */
export async function setProductState(
  id: string,
  domainKeys: ReadonlyArray<string>,
  product_state: CandidateProductState,
  matched_feature_key: string | null,
): Promise<AgentDomainCandidate | null> {
  const row = await findOwned(id, domainKeys);
  if (!row) return null;
  await row.update({
    product_state,
    // The CHECK constraint refuses a matched feature on an unchecked row, so the write is cleaned
    // here rather than left to fail at the database with a constraint name in the response.
    matched_feature_key: product_state === 'unchecked' ? null : matched_feature_key,
    updated_at: new Date(),
  });
  return row;
}

/** Record that the builder has done this by hand, in the app, with evidence. */
export async function markProvenByHand(
  id: string,
  domainKeys: ReadonlyArray<string>,
  at: Date,
): Promise<AgentDomainCandidate | null> {
  const row = await findOwned(id, domainKeys);
  if (!row) return null;
  await row.update({ proven_by_hand_at: at, updated_at: new Date() });
  return row;
}

/**
 * The row, but only if it is in a domain the caller owns.
 *
 * Scoped at the QUERY, not after the fetch. A find-then-compare would read another builder's row
 * into memory before deciding, and the difference shows up the first time somebody logs the
 * object before the check.
 */
async function findOwned(
  id: string,
  domainKeys: ReadonlyArray<string>,
): Promise<AgentDomainCandidate | null> {
  const scoped = domainKeys.filter(Boolean);
  if (scoped.length === 0) return null;
  return AgentDomainCandidate.findOne({
    where: { id, domain_key: { [Op.in]: scoped as string[] } },
  });
}
