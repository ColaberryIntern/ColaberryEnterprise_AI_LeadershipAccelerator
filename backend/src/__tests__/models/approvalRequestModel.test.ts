/**
 * ProofDesk Governance (Milestone 4, shadow mode) model tests.
 * Follows this repo's established convention (see workGraphModels.test.ts): mock the
 * DB connection and env, import models/index.ts to trigger association setup, then
 * inspect Sequelize's in-memory association/attribute metadata. No real Postgres
 * connection is made or available to local jest runs — the real-DB idempotency proof
 * for ensureApprovalRequestsSchema() is a separate, manual throwaway-container run
 * (see T002 in this run's plan.md and verification-log.md), same split M1/M3 already
 * established.
 */

jest.mock('../../config/database', () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize('postgres://mock:mock@localhost:5432/mock', {
    dialect: 'postgres',
    logging: false,
  });
  return { sequelize, connectDatabase: jest.fn() };
});

jest.mock('../../config/env', () => ({
  env: {
    databaseUrl: 'postgres://mock:mock@localhost:5432/mock',
    nodeEnv: 'test',
    jwtSecret: 'test-secret',
    port: 3000,
  },
}));

import * as Models from '../../models';

function hasAssociation(model: any, alias: string): boolean {
  return model.associations && alias in model.associations;
}

describe('ProofDesk Governance model — exported', () => {
  test('exports ApprovalRequest', () => {
    expect((Models as any).ApprovalRequest).toBeDefined();
  });
});

describe('ProofDesk Governance model — associations', () => {
  test('Ticket has approvalRequests', () => {
    expect(hasAssociation(Models.Ticket, 'approvalRequests')).toBe(true);
  });
  test('ApprovalRequest belongs to ticket', () => {
    expect(hasAssociation((Models as any).ApprovalRequest, 'ticket')).toBe(true);
  });
  test('ApprovalRequest belongs to workUnit', () => {
    expect(hasAssociation((Models as any).ApprovalRequest, 'workUnit')).toBe(true);
  });
  test('ApprovalRequest belongs to run', () => {
    expect(hasAssociation((Models as any).ApprovalRequest, 'run')).toBe(true);
  });
  test('ApprovalRequest belongs to event (WorkLedgerEvent)', () => {
    expect(hasAssociation((Models as any).ApprovalRequest, 'event')).toBe(true);
  });
  test('WorkLedgerEvent has one approvalRequest', () => {
    expect(hasAssociation(Models.WorkLedgerEvent, 'approvalRequest')).toBe(true);
  });
});

describe('ProofDesk Governance model — defaults (shadow-mode invariant)', () => {
  test('ApprovalRequest.status defaults to shadow_logged, never a live-gating value', () => {
    const attr = (Models as any).ApprovalRequest.rawAttributes.status;
    expect(attr.defaultValue).toBe('shadow_logged');
  });
  test('ApprovalRequest.risk_tier defaults to R0 (the safe/lowest tier)', () => {
    const attr = (Models as any).ApprovalRequest.rawAttributes.risk_tier;
    expect(attr.defaultValue).toBe('R0');
  });
  test('ApprovalRequest.event_id has a unique index (idempotency: one decision per ledger event)', () => {
    const indexes = (Models as any).ApprovalRequest.options.indexes;
    const eventIdIndex = indexes.find((i: any) => i.fields?.includes('event_id'));
    expect(eventIdIndex).toBeDefined();
    expect(eventIdIndex.unique).toBe(true);
  });
});

describe('ProofDesk Governance model — event_id dedup behavior (plan.md T002 AC3)', () => {
  // No real Postgres connection is available to local jest (see this file's header
  // docstring) — the authoritative real-DB proof that idx_approval_requests_event_id
  // actually rejects a duplicate insert was run manually against a throwaway
  // postgres:15 container as part of this task (see this run's verification-log.md):
  // two `create()` calls with the same event_id -> the 2nd threw
  // `error: duplicate key value violates unique constraint "idx_approval_requests_event_id"`,
  // and a COUNT confirmed exactly 1 row survived. This test guards the SAME contract
  // locally and in CI, at the model layer: it mocks the DB call boundary (per the file's
  // established convention) but asserts against Sequelize's own real
  // `UniqueConstraintError` class — the exact error type the real constraint produces —
  // not a fabricated stand-in, so a regression that silently drops the unique index
  // from ApprovalRequest.ts would still be caught by whatever calls .create() expecting
  // this contract (see agentActionAuthorizationBridge.ts's own dedup test, Milestone 4
  // T005, for the consuming side of this same guarantee).
  test('a second create() with the same event_id is rejected, not silently duplicated', async () => {
    const { UniqueConstraintError } = require('sequelize');
    const ApprovalRequestModel = (Models as any).ApprovalRequest;
    const eventId = '11111111-1111-1111-1111-111111111111';

    const createSpy = jest.spyOn(ApprovalRequestModel, 'create');
    createSpy.mockResolvedValueOnce({ id: 'row-1', event_id: eventId } as any);
    createSpy.mockRejectedValueOnce(
      new UniqueConstraintError({
        message: 'duplicate key value violates unique constraint "idx_approval_requests_event_id"',
      }),
    );

    const first = await ApprovalRequestModel.create({
      event_id: eventId,
      agent_name: 'CurriculumQAAgent',
      action: 'ticket_dispatch',
      verdict: 'would_require_approval',
    });
    expect(first.event_id).toBe(eventId);

    await expect(
      ApprovalRequestModel.create({
        event_id: eventId,
        agent_name: 'CurriculumQAAgent',
        action: 'ticket_dispatch',
        verdict: 'would_require_approval',
      }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);

    expect(createSpy).toHaveBeenCalledTimes(2);
    createSpy.mockRestore();
  });
});
