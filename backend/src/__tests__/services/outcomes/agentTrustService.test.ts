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
import { computeAgentTrustByCapability } from '../../../services/outcomes/agentTrustService';

const { TicketWorkUnit } = Models as any;

describe('computeAgentTrustByCapability', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('happy path: 2 distinct (agent, capability, risk_tier) triples compute correct per-triple rates', async () => {
    jest.spyOn(TicketWorkUnit, 'findAll').mockResolvedValue([
      { assigned_agent_name: 'CurriculumQAAgent', required_capability: 'curriculum.qa_check', risk_tier: 'R1', status: 'done' },
      { assigned_agent_name: 'CurriculumQAAgent', required_capability: 'curriculum.qa_check', risk_tier: 'R1', status: 'done' },
      { assigned_agent_name: 'CurriculumQAAgent', required_capability: 'curriculum.qa_check', risk_tier: 'R1', status: 'failed' },
      { assigned_agent_name: 'PlatformFixAgent', required_capability: 'bug.platform_fix', risk_tier: 'R3', status: 'done' },
      { assigned_agent_name: 'PlatformFixAgent', required_capability: 'bug.platform_fix', risk_tier: 'R3', status: 'failed' },
    ] as any);

    const result = await computeAgentTrustByCapability();

    expect(result).toHaveLength(2);
    const qa = result.find((r) => r.agent_name === 'CurriculumQAAgent')!;
    expect(qa).toMatchObject({
      capability: 'curriculum.qa_check',
      risk_tier: 'R1',
      total: 3,
      succeeded: 2,
      failed: 1,
      status: 'sufficient_data',
    });
    expect(qa.success_rate).toBeCloseTo(2 / 3);

    const fix = result.find((r) => r.agent_name === 'PlatformFixAgent')!;
    expect(fix).toMatchObject({
      capability: 'bug.platform_fix',
      risk_tier: 'R3',
      total: 2,
      succeeded: 1,
      failed: 1,
      status: 'sufficient_data',
    });
    expect(fix.success_rate).toBeCloseTo(0.5);
  });

  test('boundary: a triple with zero done/failed rows (all pending) is reported as insufficient_data with success_rate: null, never a fabricated rate', async () => {
    jest.spyOn(TicketWorkUnit, 'findAll').mockResolvedValue([
      { assigned_agent_name: 'CurriculumArchitectAgent', required_capability: 'curriculum.design_module', risk_tier: 'R2', status: 'pending' },
      { assigned_agent_name: 'CurriculumArchitectAgent', required_capability: 'curriculum.design_module', risk_tier: 'R2', status: 'in_progress' },
    ] as any);

    const result = await computeAgentTrustByCapability();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      agent_name: 'CurriculumArchitectAgent',
      capability: 'curriculum.design_module',
      risk_tier: 'R2',
      total: 0,
      succeeded: 0,
      failed: 0,
      success_rate: null,
      status: 'insufficient_data',
    });
  });

  test('boundary: empty TicketWorkUnit table (the real production state today — work units are opt-in) returns [] cleanly, no crash', async () => {
    jest.spyOn(TicketWorkUnit, 'findAll').mockResolvedValue([] as any);
    await expect(computeAgentTrustByCapability()).resolves.toEqual([]);
  });

  test('boundary: an unassigned work unit (assigned_agent_name null) is excluded rather than attributed to a fabricated agent', async () => {
    jest.spyOn(TicketWorkUnit, 'findAll').mockResolvedValue([
      { assigned_agent_name: null, required_capability: 'curriculum.qa_check', risk_tier: 'R1', status: 'done' },
    ] as any);

    await expect(computeAgentTrustByCapability()).resolves.toEqual([]);
  });
});
