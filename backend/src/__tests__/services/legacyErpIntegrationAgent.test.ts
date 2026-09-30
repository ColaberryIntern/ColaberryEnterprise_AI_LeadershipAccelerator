import { retrieveData, clearTokenCache, resetCircuit } from '../../services/integration/legacyErpClient';
import { runLegacyErpIntegrationAgent } from '../../services/integration/legacyErpIntegrationAgent';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../models/AuditLog', () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}) },
}));

// The push runner in this module imports the ABAC service; mock it so this retrieval
// suite doesn't pull the DB/models graph at import time (retrieval never calls it).
jest.mock('../../services/agentAuthorizationService', () => ({
  authorizeAgentAction: jest.fn().mockResolvedValue({
    allowed: true, enforced: false, reason: 'ok',
    requiresApproval: false, level: 'act_audited', wouldDeny: false, mode: 'shadow',
  }),
}));

jest.mock('../../config/env', () => ({
  env: {
    vaErpTokenUrl: 'https://api.va.gov/oauth2/token',
    vaErpClientId: 'test-client-id',
    vaErpClientSecret: 'test-client-secret',
    vaErpRequestTimeoutMs: 5000,
    vaErpMaxRetries: 0,
    vaErpModuleConfigJson: JSON.stringify([
      { name: 'IFCAP', baseUrl: 'https://api.va.gov/erp/ifcap', endpoints: ['/vendors'] },
    ]),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenResponse(expiresIn = 3600) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ access_token: 'test-token', token_type: 'Bearer', expires_in: expiresIn }),
  } as unknown as Response);
}

function dataResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  } as unknown as Response);
}

function errorResponse(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: `HTTP ${status}`,
  } as unknown as Response);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  clearTokenCache();
  resetCircuit('IFCAP');
  resetCircuit('FMS');
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('retrieveData — happy path', () => {
  it('fetches OAuth token, retrieves data, and writes audit log', async () => {
    const records = [{ id: 1, name: 'Vendor A' }, { id: 2, name: 'Vendor B' }];
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(dataResponse(records) as unknown as Response);

    const result = await retrieveData('https://api.va.gov/erp/ifcap', {
      module: 'IFCAP',
      endpoint: '/vendors',
      correlationId: 'corr-001',
    });

    expect(result.recordCount).toBe(2);
    expect(result.module).toBe('IFCAP');
    expect(result.endpoint).toBe('/vendors');
    expect(result.correlationId).toBe('corr-001');
    expect(result.data).toEqual(records);

    const AuditLog = require('../../models/AuditLog').default;
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'erp_data_retrieval',
        entity_type: 'legacy_erp_module',
        new_values: expect.objectContaining({
          module: 'IFCAP',
          endpoint: '/vendors',
          correlationId: 'corr-001',
          outcome: 'success',
          recordCount: 2,
        }),
      }),
    );
  });

  it('reuses cached token on second call', async () => {
    const records = [{ id: 1 }];
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(dataResponse(records) as unknown as Response)
      .mockResolvedValueOnce(dataResponse(records) as unknown as Response);

    await retrieveData('https://api.va.gov/erp/ifcap', { module: 'IFCAP', endpoint: '/vendors', correlationId: 'c1' });
    await retrieveData('https://api.va.gov/erp/ifcap', { module: 'IFCAP', endpoint: '/vendors', correlationId: 'c2' });

    // fetch called 3 times: 1 token + 2 data calls (NOT 4 — token was cached)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('counts non-array responses as 1 record', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(dataResponse({ total: 42 }) as unknown as Response);

    const result = await retrieveData('https://api.va.gov/erp/ifcap', {
      module: 'IFCAP', endpoint: '/summary', correlationId: 'c3',
    });
    expect(result.recordCount).toBe(1);
  });
});

// ─── Failure path ─────────────────────────────────────────────────────────────

describe('retrieveData — failure path', () => {
  it('throws and logs audit entry when ERP returns 500', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(errorResponse(503) as unknown as Response);

    await expect(
      retrieveData('https://api.va.gov/erp/ifcap', {
        module: 'IFCAP', endpoint: '/vendors', correlationId: 'c4',
      }),
    ).rejects.toMatchObject({ errorClass: 'UpstreamUnavailable' });

    const AuditLog = require('../../models/AuditLog').default;
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        new_values: expect.objectContaining({ outcome: 'failure', errorClass: 'UpstreamUnavailable' }),
      }),
    );
  });

  it('throws AuthError when OAuth token endpoint fails', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401) as unknown as Response);

    await expect(
      retrieveData('https://api.va.gov/erp/ifcap', {
        module: 'IFCAP', endpoint: '/vendors', correlationId: 'c5',
      }),
    ).rejects.toMatchObject({ errorClass: 'AuthError' });
  });

  it('opens circuit after 3 consecutive failures', async () => {
    // Fail 3 times to open the circuit. The OAuth token is fetched once and
    // cached (expires_in: 3600s), so only the first iteration issues a token
    // request — later iterations only need a data-call mock queued.
    for (let i = 0; i < 3; i++) {
      if (i === 0) {
        mockFetch
          .mockResolvedValueOnce(tokenResponse() as unknown as Response)
          .mockResolvedValueOnce(errorResponse(500) as unknown as Response);
      } else {
        mockFetch.mockResolvedValueOnce(errorResponse(500) as unknown as Response);
      }
      await expect(
        retrieveData('https://api.va.gov/erp/ifcap', {
          module: 'IFCAP', endpoint: '/vendors', correlationId: `fail-${i}`,
        }),
      ).rejects.toBeDefined();
    }

    // 4th call: circuit is OPEN, no fetch should fire
    const callsBefore = mockFetch.mock.calls.length;
    await expect(
      retrieveData('https://api.va.gov/erp/ifcap', {
        module: 'IFCAP', endpoint: '/vendors', correlationId: 'blocked',
      }),
    ).rejects.toMatchObject({ errorClass: 'CircuitOpenError' });

    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe('retrieveData — idempotency', () => {
  it('same correlationId can be called twice without side effects beyond audit log entries', async () => {
    const records = [{ id: 1 }];
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(dataResponse(records) as unknown as Response)
      .mockResolvedValueOnce(dataResponse(records) as unknown as Response);

    const req = { module: 'IFCAP', endpoint: '/vendors', correlationId: 'idem-001' };
    const r1 = await retrieveData('https://api.va.gov/erp/ifcap', req);
    const r2 = await retrieveData('https://api.va.gov/erp/ifcap', req);

    expect(r1.recordCount).toBe(r2.recordCount);

    const AuditLog = require('../../models/AuditLog').default;
    // Two audit log entries, both with the same correlationId
    expect(AuditLog.create).toHaveBeenCalledTimes(2);
  });
});

// ─── Agent runner ─────────────────────────────────────────────────────────────

describe('runLegacyErpIntegrationAgent', () => {
  it('returns success result with entities_processed count', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(dataResponse([{ id: 1 }]) as unknown as Response);

    const result = await runLegacyErpIntegrationAgent();

    expect(result.agent_name).toBe('LegacyErpIntegrationAgent');
    expect(result.entities_processed).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.actions_taken[0].result).toBe('success');
  });

  it('records failed action when retrieval throws', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(errorResponse(503) as unknown as Response);

    const result = await runLegacyErpIntegrationAgent();

    expect(result.errors).toHaveLength(1);
    expect(result.actions_taken[0].result).toBe('failed');
    expect(result.entities_processed).toBe(0);
  });
});
