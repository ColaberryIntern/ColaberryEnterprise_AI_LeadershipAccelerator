/**
 * ProofDesk Work Graph (Milestone 3) model tests.
 * Follows this repo's established convention (see models/associations.test.ts):
 * mock the DB connection and env, import models/index.ts to trigger association
 * setup, then inspect Sequelize's in-memory association/attribute metadata. No real
 * Postgres connection is made or available to local jest runs — the real-DB proof
 * for this schema is a separate, manual throwaway-container run (see T002 in this
 * run's plan.md and verification-log.md), same split M1/M2 already established.
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

describe('ProofDesk Work Graph models — exported', () => {
  test.each(['TicketWorkUnit', 'WorkUnitDependency', 'ResourceLease'])(
    'exports %s',
    (name) => {
      expect((Models as any)[name]).toBeDefined();
    }
  );
});

describe('ProofDesk Work Graph models — associations', () => {
  test('Ticket has workUnits', () => {
    expect(hasAssociation(Models.Ticket, 'workUnits')).toBe(true);
  });

  test('TicketWorkUnit belongs to ticket', () => {
    expect(hasAssociation(Models.TicketWorkUnit, 'ticket')).toBe(true);
  });

  test('TicketWorkUnit belongs to workContext', () => {
    expect(hasAssociation(Models.TicketWorkUnit, 'workContext')).toBe(true);
  });

  test('TicketWorkUnit belongs to assignedRun', () => {
    expect(hasAssociation(Models.TicketWorkUnit, 'assignedRun')).toBe(true);
  });

  test('TicketWorkUnit has dependencies (outgoing edges)', () => {
    expect(hasAssociation(Models.TicketWorkUnit, 'dependencies')).toBe(true);
  });

  test('TicketWorkUnit has dependents (incoming edges)', () => {
    expect(hasAssociation(Models.TicketWorkUnit, 'dependents')).toBe(true);
  });

  test('TicketWorkUnit has leases', () => {
    expect(hasAssociation(Models.TicketWorkUnit, 'leases')).toBe(true);
  });

  test('WorkUnitDependency belongs to workUnit', () => {
    expect(hasAssociation(Models.WorkUnitDependency, 'workUnit')).toBe(true);
  });

  test('WorkUnitDependency belongs to dependsOnWorkUnit', () => {
    expect(hasAssociation(Models.WorkUnitDependency, 'dependsOnWorkUnit')).toBe(true);
  });

  test('ResourceLease belongs to workUnit', () => {
    expect(hasAssociation(Models.ResourceLease, 'workUnit')).toBe(true);
  });

  test('ResourceLease belongs to run', () => {
    expect(hasAssociation(Models.ResourceLease, 'run')).toBe(true);
  });

  test('AgentRun has leases', () => {
    expect(hasAssociation(Models.AgentRun, 'leases')).toBe(true);
  });
});

describe('ProofDesk Work Graph models — attribute shapes match the schema', () => {
  test('TicketWorkUnit rawAttributes match ensureWorkGraphSchema.ts columns', () => {
    const attrs = Object.keys((Models.TicketWorkUnit as any).rawAttributes);
    expect(attrs).toEqual(
      expect.arrayContaining([
        'id', 'ticket_id', 'work_context_id', 'title', 'description',
        'required_capability', 'target_resource_scope', 'acceptance_criteria',
        'status', 'risk_tier', 'approval_policy', 'verification_contract',
        'eligible_parallelism', 'expected_output_refs', 'assigned_agent_name',
        'assigned_run_id', 'created_at', 'updated_at',
      ])
    );
  });

  test('WorkUnitDependency rawAttributes match ensureWorkGraphSchema.ts columns', () => {
    const attrs = Object.keys((Models.WorkUnitDependency as any).rawAttributes);
    expect(attrs).toEqual(
      expect.arrayContaining([
        'id', 'work_unit_id', 'depends_on_work_unit_id', 'dependency_type', 'created_at',
      ])
    );
  });

  test('ResourceLease rawAttributes match ensureWorkGraphSchema.ts columns', () => {
    const attrs = Object.keys((Models.ResourceLease as any).rawAttributes);
    expect(attrs).toEqual(
      expect.arrayContaining([
        'id', 'resource_key', 'work_unit_id', 'run_id', 'lease_owner', 'status',
        'acquired_at', 'expires_at', 'heartbeat_at', 'idempotency_key',
        'before_state_version', 'cancellation_token', 'released_at', 'created_at',
      ])
    );
  });

  test('ResourceLease.status default matches the schema default', () => {
    expect((Models.ResourceLease as any).rawAttributes.status.defaultValue).toBe('active');
  });

  test('TicketWorkUnit.status default matches the schema default', () => {
    expect((Models.TicketWorkUnit as any).rawAttributes.status.defaultValue).toBe('pending');
  });
});
