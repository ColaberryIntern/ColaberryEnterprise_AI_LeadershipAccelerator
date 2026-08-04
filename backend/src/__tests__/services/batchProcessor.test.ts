jest.mock('../../models/AuditLog', () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}) },
}));

const mockEnv = { vaErpBatchSize: 10, vaErpBatchDelayMs: 0 };
jest.mock('../../config/env', () => ({ env: mockEnv }));

const mockRunLegacyErpPushAgent = jest.fn();
jest.mock('../../services/integration/legacyErpIntegrationAgent', () => ({
  runLegacyErpPushAgent: (...args: unknown[]) => mockRunLegacyErpPushAgent(...args),
}));

import { runLegacyErpBatchAgent } from '../../services/integration/batchProcessor';
import type { ErpUpdateRequest } from '../../services/integration/types';
import type { AgentExecutionResult } from '../../services/agents/types';

const update = (correlationId: string): ErpUpdateRequest => ({
  module: 'IFCAP',
  endpoint: `/vendors/${correlationId}`,
  method: 'PUT',
  payload: { id: correlationId, name: 'Vendor' },
  callerRole: 'integration_agent',
  correlationId,
});

function successResult(count: number): AgentExecutionResult {
  return {
    agent_name: 'LegacyErpIntegrationAgent',
    campaigns_processed: 0,
    actions_taken: Array.from({ length: count }, (_, i) => ({
      campaign_id: null,
      action: 'erp_data_pushed',
      reason: 'ok',
      confidence: 1,
      before_state: null,
      after_state: null,
      result: 'success' as const,
      entity_type: 'system' as const,
    })),
    errors: [],
    duration_ms: 5,
    entities_processed: count,
  };
}

function failureResult(errorCount: number): AgentExecutionResult {
  return {
    agent_name: 'LegacyErpIntegrationAgent',
    campaigns_processed: 0,
    actions_taken: [],
    errors: Array.from({ length: errorCount }, (_, i) => `IFCAP/vendors/${i}: [UpstreamUnavailable] failed`),
    duration_ms: 5,
    entities_processed: 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.vaErpBatchSize = 10;
  mockEnv.vaErpBatchDelayMs = 0;
});

describe('runLegacyErpBatchAgent — chunking', () => {
  it('splits updates into ceil(N/batchSize) batches and calls the push agent once per batch', async () => {
    const updates = Array.from({ length: 5 }, (_, i) => update(`c${i}`));
    mockRunLegacyErpPushAgent
      .mockResolvedValueOnce(successResult(2))
      .mockResolvedValueOnce(successResult(2))
      .mockResolvedValueOnce(successResult(1));

    const result = await runLegacyErpBatchAgent(updates, { batchSize: 2 });

    expect(mockRunLegacyErpPushAgent).toHaveBeenCalledTimes(3);
    expect(mockRunLegacyErpPushAgent).toHaveBeenNthCalledWith(1, [updates[0], updates[1]]);
    expect(mockRunLegacyErpPushAgent).toHaveBeenNthCalledWith(2, [updates[2], updates[3]]);
    expect(mockRunLegacyErpPushAgent).toHaveBeenNthCalledWith(3, [updates[4]]);
    expect(result.batches_processed).toBe(3);
    expect(result.batch_size).toBe(2);
    expect(result.entities_processed).toBe(5);
  });

  it('processes everything as one batch when updates fit within batchSize', async () => {
    const updates = [update('a'), update('b')];
    mockRunLegacyErpPushAgent.mockResolvedValueOnce(successResult(2));

    const result = await runLegacyErpBatchAgent(updates, { batchSize: 10 });

    expect(mockRunLegacyErpPushAgent).toHaveBeenCalledTimes(1);
    expect(result.batches_processed).toBe(1);
  });

  it('handles an empty update list with zero batches', async () => {
    const result = await runLegacyErpBatchAgent([], { batchSize: 5 });

    expect(mockRunLegacyErpPushAgent).not.toHaveBeenCalled();
    expect(result.batches_processed).toBe(0);
    expect(result.entities_processed).toBe(0);
  });

  it('falls back to env.vaErpBatchSize when no batchSize option is given', async () => {
    mockEnv.vaErpBatchSize = 3;
    const updates = Array.from({ length: 4 }, (_, i) => update(`c${i}`));
    mockRunLegacyErpPushAgent
      .mockResolvedValueOnce(successResult(3))
      .mockResolvedValueOnce(successResult(1));

    const result = await runLegacyErpBatchAgent(updates);

    expect(result.batch_size).toBe(3);
    expect(result.batches_processed).toBe(2);
  });
});

describe('runLegacyErpBatchAgent — resilience', () => {
  it('continues processing later batches after an earlier batch has failures', async () => {
    const updates = Array.from({ length: 4 }, (_, i) => update(`c${i}`));
    mockRunLegacyErpPushAgent
      .mockResolvedValueOnce(failureResult(2))
      .mockResolvedValueOnce(successResult(2));

    const result = await runLegacyErpBatchAgent(updates, { batchSize: 2 });

    expect(mockRunLegacyErpPushAgent).toHaveBeenCalledTimes(2);
    expect(result.errors).toHaveLength(2);
    expect(result.entities_processed).toBe(2);
  });
});

describe('runLegacyErpBatchAgent — audit logging', () => {
  it('writes one batch-level audit entry per batch with a summary', async () => {
    const updates = Array.from({ length: 3 }, (_, i) => update(`c${i}`));
    mockRunLegacyErpPushAgent
      .mockResolvedValueOnce(successResult(2))
      .mockResolvedValueOnce(failureResult(1));

    await runLegacyErpBatchAgent(updates, { batchSize: 2 });

    const AuditLog = require('../../models/AuditLog').default;
    expect(AuditLog.create).toHaveBeenCalledTimes(2);
    expect(AuditLog.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: 'erp_batch_processed',
      new_values: expect.objectContaining({
        batch_number: 1, total_batches: 2, batch_size: 2,
        entities_processed: 2, error_count: 0, outcome: 'success',
      }),
    }));
    expect(AuditLog.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: 'erp_batch_processed',
      new_values: expect.objectContaining({
        batch_number: 2, total_batches: 2, batch_size: 1,
        entities_processed: 0, error_count: 1, outcome: 'partial_failure',
      }),
    }));
  });
});
