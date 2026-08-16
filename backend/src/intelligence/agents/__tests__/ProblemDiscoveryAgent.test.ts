/**
 * Regression guard for T001 (cory-engine ticket auto-resolve run) — the only change
 * made to ProblemDiscoveryAgent.ts is adding the `export` keyword to
 * detectAgentFailures/detectConversionDrops/detectErrorSpikes so a new resolver module
 * can call the SAME detection logic autonomousEngine.ts uses, instead of re-implementing
 * the SQL a second time. This file did not have a test before; this suite exists to
 * prove discoverProblems()'s own behavior (dedup, aggregation, return shape) is
 * genuinely unchanged by that edit, not to test the SQL detectors themselves (those are
 * exercised against live data by the resolver's own dry-run in production, per this
 * run's execution-contract.md).
 */
import { getVectorMemory } from '../../memory/vectorMemory';

jest.mock('../../../config/database', () => ({
  sequelize: { query: jest.fn().mockRejectedValue(new Error('no db in unit test')) },
}));

const mockAiAgentFindAll = jest.fn();
jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: { findAll: (...args: any[]) => mockAiAgentFindAll(...args) },
}));

const mockMemorySearch = jest.fn();
jest.mock('../../memory/vectorMemory', () => ({
  getVectorMemory: jest.fn(() => ({ search: mockMemorySearch, store: jest.fn() })),
}));

jest.mock('../agentRegistry', () => ({ registerAgent: jest.fn() }));

import {
  discoverProblems,
  detectAgentFailures,
  detectConversionDrops,
  detectErrorSpikes,
} from '../ProblemDiscoveryAgent';

beforeEach(() => {
  jest.clearAllMocks();
  mockAiAgentFindAll.mockResolvedValue([]);
  mockMemorySearch.mockResolvedValue([]);
});

describe('T001 — export-only change is a pure regression guard', () => {
  it('the three detector functions are now real exports (the whole point of T001)', () => {
    expect(typeof detectAgentFailures).toBe('function');
    expect(typeof detectConversionDrops).toBe('function');
    expect(typeof detectErrorSpikes).toBe('function');
  });

  it('discoverProblems() still returns an empty array when nothing is detected — unchanged happy path', async () => {
    const problems = await discoverProblems();
    expect(problems).toEqual([]);
  });

  it('discoverProblems() still surfaces a real agent_failure problem end to end — the export did not change dispatch, aggregation, or shape', async () => {
    mockAiAgentFindAll.mockResolvedValue([
      { id: 'agent-1', agent_name: 'SomeAgent', error_count: 12, last_error: 'boom', last_error_at: new Date() },
    ]);

    const problems = await discoverProblems();

    expect(problems).toHaveLength(1);
    expect(problems[0].type).toBe('agent_failure');
    expect(problems[0].entity_type).toBe('agent');
    expect(problems[0].entity_id).toBe('agent-1');
    expect(problems[0].description).toBe('Agent "SomeAgent" is in error state: boom');
  });

  it('discoverProblems() still dedups against a recent, highly-similar memory match within the 2h window — unchanged dedup behavior', async () => {
    mockAiAgentFindAll.mockResolvedValue([
      { id: 'agent-1', agent_name: 'SomeAgent', error_count: 12, last_error: 'boom', last_error_at: new Date() },
    ]);
    mockMemorySearch.mockResolvedValue([
      { similarity: 0.95, created_at: new Date(Date.now() - 30 * 60 * 1000) }, // 30 min ago
    ]);

    const problems = await discoverProblems();
    expect(problems).toEqual([]);
  });

  it('a memory search failure does not swallow a real detected problem — unchanged fail-open behavior', async () => {
    mockAiAgentFindAll.mockResolvedValue([
      { id: 'agent-1', agent_name: 'SomeAgent', error_count: 1, last_error: 'boom', last_error_at: new Date() },
    ]);
    mockMemorySearch.mockRejectedValue(new Error('memory unavailable'));

    const problems = await discoverProblems();
    expect(problems).toHaveLength(1);
  });
});
