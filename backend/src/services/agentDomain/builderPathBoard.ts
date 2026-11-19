/**
 * The owner's view: every builder's candidates, what is waiting on Ali, and the gap board.
 *
 * ## Why this is a different read from `agent-domain-candidates-mine`
 *
 * The self-scoped route answers "what is mine". This answers "where is everyone", which is a
 * question only the owner has, and `agent-domains-mine`'s own header records the split that makes
 * both safe: *"Section access decides whether you may ask; ownership decides what comes back."*
 * So this one is `requireAdmin` and returns all ten domains, and the self-scoped one stays
 * `dashboard` and returns the caller's.
 *
 * ## The gap board has two halves and they are not the same thing
 *
 * `screenGaps()` reads the PRODUCT CATALOG: features where the endpoints exist and nobody built a
 * screen. Those are gaps whether or not any builder has hit one, and they are Ali's queue
 * regardless.
 *
 * The `not_built` candidates read the BUILDERS' lists: capabilities somebody wants that the
 * product cannot do at all. Those are scope sheets owed by builders, not screens owed by Ali.
 *
 * Merging them into one number would make the board say "17 gaps" where some are Ali's to close
 * and some are nobody's yet. They are counted apart, under the same grouping, so the total is
 * readable without being a single misleading figure.
 */

import { Op } from 'sequelize';
import AgentDomainCandidate from '../../models/AgentDomainCandidate';
import AgentDomainChangeRequest from '../../models/AgentDomainChangeRequest';
import { AGENT_DOMAIN_KEYS } from './agentDomainRegistry';
import { type ProductFeature, screenGaps } from './productFeatureCatalog';
import { nextStep } from './candidateFlow';
import { countsTowardGate, isOwnerTurn } from './candidateStages';
import { GATE_SIZE_BY_RUNG } from './builderPath';
import type { AgentChangeRequestStatus } from './agentChangeRequest';

export interface BoardCandidate {
  readonly id: string;
  readonly domain_key: string;
  readonly title: string;
  readonly source: string;
  readonly product_state: string;
  readonly stage: string;
  readonly turn: 'builder' | 'owner' | 'nobody';
  readonly action: string;
  readonly blocked_reason: string | null;
}

export interface BoardBuilder {
  readonly domain_key: string;
  readonly candidates: BoardCandidate[];
  readonly waiting_on_you: number;
  readonly theirs_to_move: number;
  readonly cleared_the_gate: number;
  readonly gate_size: number;
  /** Said in words so an empty row cannot be read as a builder who has stalled. */
  readonly note: string;
}

export interface GapGroup {
  readonly product_area: string;
  readonly screens_owed: ProductFeature[];
  readonly scope_sheets_owed: BoardCandidate[];
  readonly total: number;
}

export interface BuilderPathBoard {
  readonly builders: BoardBuilder[];
  readonly gap_board: GapGroup[];
  readonly summary: {
    readonly domains: number;
    readonly candidates: number;
    readonly waiting_on_you: number;
    readonly screens_owed: number;
    readonly scope_sheets_owed: number;
  };
  /** Why the board looks the way it does. Never omitted. */
  readonly reason: string;
}

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
 * The whole board.
 *
 * Every domain in the registry appears, even one with no candidates, because a domain missing from
 * the list is indistinguishable from a domain nobody has looked at. An absent row is the kind of
 * silence this board exists to remove.
 */
export async function builderPathBoard(): Promise<BuilderPathBoard> {
  const rows = await AgentDomainCandidate.findAll({
    order: [['domain_key', 'ASC'], ['created_at', 'ASC'], ['title', 'ASC']],
  });

  const statuses = await statusesFor(
    rows.flatMap((r) => [r.screen_request_id, r.tool_request_id].filter(Boolean) as string[]),
  );

  const stepFor = (r: typeof rows[number], cleared: number) => nextStep(
    {
      domain_key: r.domain_key,
      title: r.title,
      product_state: r.product_state,
      proven_by_hand_at: r.proven_by_hand_at,
      matched_feature_key: r.matched_feature_key,
    },
    {
      screen_status: r.screen_request_id ? statuses.get(r.screen_request_id) ?? null : null,
      tool_status: r.tool_request_id ? statuses.get(r.tool_request_id) ?? null : null,
    },
    // R0's gate for every domain, because all 443 capability records name `autonomy:R0`. When one
    // advances this reads its rung; until then a larger guess would overstate how far along it is.
    GATE_SIZE_BY_RUNG.R0,
    cleared,
  );

  const byDomain = new Map<string, typeof rows>();
  for (const key of AGENT_DOMAIN_KEYS) byDomain.set(key, [] as unknown as typeof rows);
  for (const r of rows) {
    if (!byDomain.has(r.domain_key)) byDomain.set(r.domain_key, [] as unknown as typeof rows);
    (byDomain.get(r.domain_key) as typeof rows[number][]).push(r);
  }

  const builders: BoardBuilder[] = [...byDomain.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([domain_key, domainRows]) => {
      const cleared = domainRows.filter((r) => countsTowardGate(stepFor(r, 0).stage)).length;
      const candidates: BoardCandidate[] = domainRows.map((r) => {
        const step = stepFor(r, cleared);
        return {
          id: String(r.id),
          domain_key: r.domain_key,
          title: r.title,
          source: r.source,
          product_state: r.product_state,
          stage: step.stage,
          turn: step.turn,
          action: step.action,
          blocked_reason: step.blocked_reason,
        };
      });
      const waiting = candidates.filter((c) => c.turn === 'owner').length;
      return {
        domain_key,
        candidates,
        waiting_on_you: waiting,
        theirs_to_move: candidates.filter((c) => c.turn === 'builder').length,
        cleared_the_gate: cleared,
        gate_size: GATE_SIZE_BY_RUNG.R0,
        note: candidates.length === 0
          ? 'No candidates on this list yet. Nobody has proposed anything for this domain, which '
            + 'is different from a builder who has stalled.'
          : `${candidates.length} candidate${candidates.length === 1 ? '' : 's'}, `
            + `${waiting} waiting on you.`,
      };
    });

  // ── the gap board ──────────────────────────────────────────────────────────────────────
  const gaps = screenGaps();
  const notBuilt = builders.flatMap((b) => b.candidates)
    .filter((c) => c.product_state === 'not_built');

  const areas = [...new Set([
    ...gaps.map((g) => g.domain_key),
    ...notBuilt.map((c) => c.domain_key),
  ])].sort();

  const gap_board: GapGroup[] = areas.map((product_area) => {
    const screens = gaps.filter((g) => g.domain_key === product_area);
    const sheets = notBuilt.filter((c) => c.domain_key === product_area);
    return {
      product_area,
      screens_owed: screens,
      scope_sheets_owed: sheets,
      total: screens.length + sheets.length,
    };
  });

  const allCandidates = builders.flatMap((b) => b.candidates);
  const waitingOnYou = builders.reduce((n, b) => n + b.waiting_on_you, 0);

  return {
    builders,
    gap_board,
    summary: {
      domains: builders.length,
      candidates: allCandidates.length,
      waiting_on_you: waitingOnYou,
      screens_owed: gaps.length,
      scope_sheets_owed: notBuilt.length,
    },
    reason: allCandidates.length === 0
      ? 'No candidate has been put on any list yet. Every domain below is listed so you can see '
        + 'that the silence is uniform rather than one builder having stalled.'
      : `${allCandidates.length} candidates across ${builders.length} domains. `
        + `${waitingOnYou} are waiting on you; the rest are not blocked on you.`,
  };
}

/** Whether a stage is one the owner must clear. Re-exported so the route can label a row. */
export { isOwnerTurn };
