import { Request, Response } from 'express';
import { readContentRules, readOfferPolicies } from '../services/growthJourney/reads/contentReads';
import { readScoreSnapshots, readTransitions } from '../services/growthJourney/reads/decisionReadsAdmin';
import { readOwnership, readQueuePolicies } from '../services/growthJourney/reads/handoffPolicyReads';
import { readExperiments } from '../services/growthJourney/experiments/liftRead';
import { readShadowRuns } from '../services/growthJourney/reads/shadowRunsRead';
import {
  contentRulesQuerySchema,
  experimentsQuerySchema,
  offerPoliciesQuerySchema,
  ownershipQuerySchema,
  queuePoliciesQuerySchema,
  shadowRunsQuerySchema,
  snapshotsQuerySchema,
  transitionsQuerySchema,
} from '../schemas/growthJourneySchema';
import { serveRead } from './growthJourneyController';

/**
 * The journey's inspect reads (Phase 6, T607): what a decision was taken on,
 * what it changed, whether the crons ran, what the brand is allowed to offer,
 * what content has been approved, and who is holding a person right now.
 *
 * Eight handlers, each three lines, over the ONE `serveRead` every journey read
 * shares (moved to `growthJourneyController.ts` by this task). That helper owns
 * the parse, the scope narrowing, the 403 and the single 500 body; a handler's
 * only job is to name its schema, its log event and its read.
 *
 * Each `event` string is distinct, because the log line is the only place the
 * five hundred bodies differ - the response says `Journey read failed` for all
 * thirteen routes, and the event says which one.
 *
 * The shadow-runs handler is the one that ignores `scope`: its table has no
 * `brand_id`, so there is nothing to narrow. See `shadowRunsRead.ts` for why
 * that is deliberate rather than an oversight, and why the read takes no
 * `brandIds` argument at all instead of accepting one it would drop.
 */

export async function getJourneySnapshotsHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, snapshotsQuerySchema, 'journey_snapshots_read_failed', async (query, scope) => ({
    ...(await readScoreSnapshots({ brandIds: scope.brandIds, subjectRef: query.subject_ref, limit: query.limit, offset: query.offset })),
    scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: null },
  }));
}

export async function getJourneyTransitionsHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, transitionsQuerySchema, 'journey_transitions_read_failed', async (query, scope) => ({
    ...(await readTransitions({ brandIds: scope.brandIds, programId: scope.programId, subjectRef: query.subject_ref, limit: query.limit, offset: query.offset })),
    scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: scope.programId },
  }));
}

export async function getJourneyShadowRunsHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, shadowRunsQuerySchema, 'journey_shadow_runs_read_failed', async (query, scope) => ({
    ...(await readShadowRuns({ windowDays: query.window_days, agent: query.agent, result: query.result, limit: query.limit, offset: query.offset })),
    // No `brand_id`: the table has none, and echoing one would claim a filter that never ran.
    scope: { tenant_id: scope.tenantId, brand_id: null, program_id: null },
  }));
}

export async function getJourneyOfferPoliciesHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, offerPoliciesQuerySchema, 'journey_offer_policies_read_failed', async (query, scope) => ({
    ...(await readOfferPolicies({
      brandIds: scope.brandIds, offerFamily: query.offer_family, decision: query.decision,
      status: query.status, limit: query.limit, offset: query.offset,
    })),
    scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: null },
  }));
}

export async function getJourneyContentRulesHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, contentRulesQuerySchema, 'journey_content_rules_read_failed', async (query, scope) => ({
    ...(await readContentRules({
      brandIds: scope.brandIds, offerFamily: query.offer_family, approvalStatus: query.approval_status,
      limit: query.limit, offset: query.offset,
    })),
    scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: null },
  }));
}

export async function getJourneyQueuePoliciesHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, queuePoliciesQuerySchema, 'journey_queue_policies_read_failed', async (query, scope) => ({
    ...(await readQueuePolicies({
      brandIds: scope.brandIds, policyType: query.policy_type, ownerQueue: query.owner_queue,
      limit: query.limit, offset: query.offset,
    })),
    scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: null },
  }));
}

/**
 * The holdout policies in scope and what each has measured (T608).
 *
 * A read, like its seven siblings: it reports the policy an operator wrote and the arithmetic
 * `computeLift` derives from the decision rows. It cannot create, pause or change an experiment -
 * a policy row is written deliberately, outside this surface.
 */
export async function getJourneyExperimentsHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, experimentsQuerySchema, 'journey_experiments_read_failed', async (query, scope) => ({
    ...(await readExperiments({ brandIds: scope.brandIds, windowDays: query.window_days })),
    scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: null },
  }));
}

export async function getJourneyOwnershipHandler(req: Request, res: Response): Promise<void> {
  await serveRead(req, res, ownershipQuerySchema, 'journey_ownership_read_failed', async (query, scope) => ({
    ...(await readOwnership({ brandIds: scope.brandIds, limit: query.limit, offset: query.offset })),
    scope: { tenant_id: scope.tenantId, brand_id: scope.brandId, program_id: null },
  }));
}
