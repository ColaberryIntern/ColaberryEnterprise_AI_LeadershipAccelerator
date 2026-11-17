/**
 * capabilityBoardService — read the records the board derives from, and nothing else.
 *
 * AF11.10. The judgement is in `capabilityBoard.ts` and is pure; this module does the I/O, which
 * is the same split the rest of this subtree makes and the reason the five columns can be tested
 * without a database.
 *
 * ## IT READS. IT DOES NOT WRITE, AND IT ADDS NO STAGE COLUMN
 *
 * There is no `stage` to load because there is no `stage` stored. Every column is computed from
 * the detail, the package, the decision log, the build events and the grant — records that
 * already gate the work. The ticket's instruction is the whole design: *"A stage column would be
 * a second source of truth about where something is, and the first time it disagreed with the
 * grant table the board would be lying confidently."*
 *
 * ## FIVE QUERIES FOR THE WHOLE BOARD, not five per card
 *
 * Same rule as `loadDetails`: a board is read as a list by definition, so a per-card query is
 * N+1 by construction. Each read is one `IN` over the ids already in hand.
 */

import { QueryTypes, type Sequelize } from 'sequelize';
import AgentDomainChangeRequest from '../../models/AgentDomainChangeRequest';
import AgentDomainToolRequestDetail from '../../models/AgentDomainToolRequestDetail';
import AgentDomainToolRequestDecision from '../../models/AgentDomainToolRequestDecision';
import AgentDomainToolRequestBuildEvent from '../../models/AgentDomainToolRequestBuildEvent';
import AgentDomainToolGrant from '../../models/AgentDomainToolGrant';
import { loadPackages, readinessOf } from './toolRequestPackageService';
import { buildBoard, type Board, type BoardInput } from './capabilityBoard';

export interface LoadBoardArgs {
  readonly sequelize: Sequelize;
  readonly viewerEmail: string;
  readonly approverEmail: string;
  /** Optional: one domain's board rather than every domain's. */
  readonly domainKey?: string | null;
  readonly now?: Date;
}

const isoOf = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Every capability in flight, placed.
 *
 * Only `tool` requests. A change request is not a capability and putting one on this board would
 * make "how many capabilities are in flight" a number nobody could reconcile with the ladder.
 */
export async function loadCapabilityBoard(args: LoadBoardArgs): Promise<Board> {
  const now = args.now ?? new Date();
  const where: Record<string, unknown> = { kind: 'tool' };
  if (args.domainKey) where.domain_key = args.domainKey;

  const requests = await AgentDomainChangeRequest.findAll({ where });
  const ids = requests.map((r) => r.id);
  if (ids.length === 0) {
    return buildBoard({
      inputs: [], now, viewerEmail: args.viewerEmail, approverEmail: args.approverEmail,
    });
  }

  const [details, packages, decisions, events, grants] = await Promise.all([
    AgentDomainToolRequestDetail.findAll({ where: { change_request_id: ids } }),
    loadPackages(ids),
    AgentDomainToolRequestDecision.findAll({
      where: { change_request_id: ids },
      order: [['decided_at', 'DESC']],
    }),
    AgentDomainToolRequestBuildEvent.findAll({
      where: { change_request_id: ids },
      order: [['occurred_at', 'DESC']],
    }),
    AgentDomainToolGrant.findAll({ where: { change_request_id: ids } }),
  ]);

  const detailBy = new Map(details.map((d) => [d.change_request_id, d]));
  const decisionsBy = new Map<string, typeof decisions>();
  for (const d of decisions) {
    const list = decisionsBy.get(d.change_request_id) ?? [];
    list.push(d);
    decisionsBy.set(d.change_request_id, list);
  }
  const eventsBy = new Map<string, typeof events>();
  for (const e of events) {
    const list = eventsBy.get(e.change_request_id) ?? [];
    list.push(e);
    eventsBy.set(e.change_request_id, list);
  }
  const grantBy = new Map(
    grants.filter((g) => g.change_request_id).map((g) => [String(g.change_request_id), g]),
  );

  const inputs: BoardInput[] = requests.map((r) => {
    const pkg = packages.get(r.id) ?? null;
    const grant = grantBy.get(r.id) ?? null;
    return {
      change_request_id: r.id,
      domain_key: r.domain_key,
      title: r.title,
      status: String(r.status),
      requested_by_identity: String(r.requested_by_identity ?? ''),
      requested_at: isoOf(r.requested_at ?? r.created_at),
      readiness: readinessOf(pkg, now),
      decisions: (decisionsBy.get(r.id) ?? []).map((d) => ({
        verb: String(d.verb),
        decided_at: isoOf(d.decided_at) ?? '',
        decided_by_identity: String(d.decided_by_identity ?? ''),
      })),
      build_events: (eventsBy.get(r.id) ?? []).map((e) => ({
        event: String(e.event),
        occurred_at: isoOf(e.occurred_at) ?? '',
        actor_identity: String(e.actor_identity ?? ''),
      })),
      grant: grant
        ? { approved_at: isoOf(grant.approved_at) ?? '', tool_name: String(grant.tool_name) }
        : null,
      tried_in_product: detailBy.get(r.id)?.tried_in_product ?? null,
    };
  });

  return buildBoard({
    inputs, now, viewerEmail: args.viewerEmail, approverEmail: args.approverEmail,
  });
}

/**
 * Kalkidan's change request is the board's own acceptance check, and it is a CHANGE request.
 *
 * `01805c02-c561-441c-9019-6e1cb43ab8a2`, filed 13 Nov 2026, is the only request ever filed in
 * the programme and it has `kind = 'change'`, so the tool board above does not carry it. That is
 * correct and it is also exactly the kind of omission that makes a board quietly useless, so it
 * is reported alongside rather than folded in: an undecided request is an undecided request
 * whatever its kind, and the person waiting does not care which table it sits in.
 */
export async function loadUndecidedChangeRequests(
  sequelize: Sequelize,
  now: Date = new Date(),
): Promise<ReadonlyArray<{
  readonly id: string;
  readonly title: string;
  readonly domain_key: string;
  readonly requested_by_identity: string;
  readonly requested_at: string | null;
  readonly waiting_hours: number | null;
}>> {
  const rows = await sequelize.query<{
    id: string;
    title: string;
    domain_key: string;
    requested_by_identity: string;
    requested_at: Date | null;
    created_at: Date | null;
  }>(
    `SELECT r.id, r.title, r.domain_key, r.requested_by_identity, r.requested_at, r.created_at
       FROM agent_domain_change_requests r
      WHERE r.kind = 'change'
        AND r.status = 'submitted'
      ORDER BY COALESCE(r.requested_at, r.created_at) ASC`,
    { type: QueryTypes.SELECT },
  );
  return rows.map((r) => {
    const filed = isoOf(r.requested_at ?? r.created_at);
    const t = filed ? new Date(filed).getTime() : null;
    return {
      id: r.id,
      title: r.title,
      domain_key: r.domain_key,
      requested_by_identity: String(r.requested_by_identity ?? ''),
      requested_at: filed,
      waiting_hours: t === null ? null : Math.max(0, Math.floor((now.getTime() - t) / 3_600_000)),
    };
  });
}
