jest.mock('../../../config/database', () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize('postgres://mock:mock@localhost:5432/mock', {
    dialect: 'postgres',
    logging: false,
  });
  return { sequelize, connectDatabase: jest.fn() };
});

jest.mock('../../../config/env', () => ({
  env: {
    databaseUrl: 'postgres://mock:mock@localhost:5432/mock',
    nodeEnv: 'test',
    jwtSecret: 'test-secret',
    port: 3000,
  },
}));

import * as Models from '../../../models';
import { computeCostToProof } from '../../../services/outcomes/costToProofService';

const { TicketWorkUnit, AgentRun } = Models as any;

describe('computeCostToProof', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('happy path: done work units with linked AgentRun.duration_ms compute a correct average per capability', async () => {
    jest.spyOn(TicketWorkUnit, 'findAll').mockResolvedValue([
      { required_capability: 'curriculum.qa_check', assigned_run_id: 'run-1' },
      { required_capability: 'curriculum.qa_check', assigned_run_id: 'run-2' },
    ] as any);
    jest.spyOn(AgentRun, 'findAll').mockResolvedValue([
      { id: 'run-1', duration_ms: 1000 },
      { id: 'run-2', duration_ms: 3000 },
    ] as any);

    const result = await computeCostToProof();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      capability: 'curriculum.qa_check',
      verified_count: 2,
      avg_duration_to_proof_ms: 2000,
      status: 'sufficient_data',
    });
    expect(result[0].cost_usd_note).toMatch(/cost_usd is not populated/);
  });

  test('boundary: a capability with done work units but no linked AgentRun/duration_ms reports insufficient_data, not 0', async () => {
    jest.spyOn(TicketWorkUnit, 'findAll').mockResolvedValue([
      { required_capability: 'bug.platform_fix', assigned_run_id: null },
      { required_capability: 'bug.platform_fix', assigned_run_id: 'run-3' },
    ] as any);
    jest.spyOn(AgentRun, 'findAll').mockResolvedValue([{ id: 'run-3', duration_ms: null }] as any);

    const result = await computeCostToProof();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      capability: 'bug.platform_fix',
      verified_count: 2,
      avg_duration_to_proof_ms: null,
      status: 'insufficient_data',
    });
  });

  test('boundary: empty input returns [] cleanly, no crash, and never calls AgentRun.findAll unnecessarily', async () => {
    jest.spyOn(TicketWorkUnit, 'findAll').mockResolvedValue([] as any);
    const agentRunSpy = jest.spyOn(AgentRun, 'findAll').mockResolvedValue([] as any);

    await expect(computeCostToProof()).resolves.toEqual([]);
    expect(agentRunSpy).not.toHaveBeenCalled();
  });
});
