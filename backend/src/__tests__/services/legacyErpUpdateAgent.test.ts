import { pushUpdate, clearTokenCache, resetCircuit } from '../../services/integration/legacyErpClient';
import { runLegacyErpPushAgent } from '../../services/integration/legacyErpIntegrationAgent';
import type { ErpUpdateRequest } from '../../services/integration/types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../models/AuditLog', () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}) },
}));

jest.mock('../../config/env', () => ({
  env: {
    vaErpTokenUrl: 'https://api.va.gov/oauth2/token',
    vaErpClientId: 'test-client-id',
    vaErpClientSecret: 'test-client-secret',
    vaErpRequestTimeoutMs: 5000,
    vaErpMaxRetries: 0,
    vaErpModuleConfigJson: JSON.stringify([
      {
        name: 'IFCAP',
        baseUrl: 'https://api.va.gov/erp/ifcap',
        endpoints: ['/vendors'],
        allowedRoles: ['integration_agent', 'admin'],
        requiredFields: ['id', 'name'],
      },
    ]),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.va.gov/erp/ifcap';

function tokenResponse() {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600 }),
  } as unknown as Response);
}

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: `HTTP ${status}`,
    json: () => Promise.resolve(data),
  } as unknown as Response);
}

function emptyResponse(status = 204) {
  return Promise.resolve({
    ok: true,
    status,
    json: () => Promise.resolve(null),
  } as unknown as Response);
}

function errorResponse(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: `HTTP ${status}`,
  } as unknown as Response);
}

const baseRequest = (): ErpUpdateRequest => ({
  module: 'IFCAP',
  endpoint: '/vendors/42',
  method: 'PUT',
  payload: { id: '42', name: 'Updated Vendor' },
  callerRole: 'integration_agent',
  correlationId: 'corr-update-001',
});

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  clearTokenCache();
  resetCircuit('IFCAP');
});

// ─── REQ-003: Role check ──────────────────────────────────────────────────────

describe('pushUpdate — role check (REQ-003)', () => {
  it('throws AuthorizationError when caller role is not permitted', async () => {
    await expect(
      pushUpdate(BASE_URL, { ...baseRequest(), callerRole: 'read_only' }, { allowedRoles: ['admin'] }),
    ).rejects.toMatchObject({ errorClass: 'AuthorizationError' });

    // No fetch should fire — rejected before HTTP call
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('proceeds when caller role is in allowedRoles', async () => {
    const current = { id: '42', name: 'Old Vendor' };
    const updated = { id: '42', name: 'Updated Vendor' };
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)   // token
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response)  // GET snapshot
      .mockResolvedValueOnce(jsonResponse(updated) as unknown as Response); // PUT (token is cached, not re-fetched)

    const result = await pushUpdate(BASE_URL, baseRequest(), { allowedRoles: ['integration_agent'] });
    expect(result.module).toBe('IFCAP');
  });

  it('proceeds when allowedRoles is empty (open access)', async () => {
    const current = { id: '42', name: 'Old Vendor' };
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response)
      .mockResolvedValueOnce(jsonResponse({ id: '42', name: 'Updated Vendor' }) as unknown as Response);

    const result = await pushUpdate(BASE_URL, { ...baseRequest(), callerRole: 'any_role' }, {});
    expect(result.rolledBack).toBe(false);
  });
});

// ─── Payload validation ───────────────────────────────────────────────────────

describe('pushUpdate — payload validation', () => {
  it('throws ValidationError when required field is missing', async () => {
    await expect(
      pushUpdate(
        BASE_URL,
        { ...baseRequest(), payload: { id: '42' } },   // missing 'name'
        { requiredFields: ['id', 'name'] },
      ),
    ).rejects.toMatchObject({ errorClass: 'ValidationError' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('passes validation when all required fields present', async () => {
    const current = { id: '42', name: 'Old' };
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response)
      .mockResolvedValueOnce(jsonResponse({ id: '42', name: 'New' }) as unknown as Response);

    const result = await pushUpdate(
      BASE_URL,
      { ...baseRequest(), payload: { id: '42', name: 'New' } },
      { requiredFields: ['id', 'name'] },
    );
    expect(result.newValues).toEqual({ id: '42', name: 'New' });
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('pushUpdate — happy path', () => {
  it('captures old_values from GET snapshot and new_values from PUT response', async () => {
    const current = { id: '42', name: 'Old Vendor', status: 'active' };
    const updated = { id: '42', name: 'Updated Vendor', status: 'active' };
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response)  // GET snapshot
      .mockResolvedValueOnce(jsonResponse(updated) as unknown as Response); // PUT

    const result = await pushUpdate(BASE_URL, baseRequest(), {});

    expect(result.oldValues).toEqual(current);
    expect(result.newValues).toEqual(updated);
    expect(result.rolledBack).toBe(false);
    expect(result.rollbackSucceeded).toBeNull();

    const AuditLog = require('../../models/AuditLog').default;
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'erp_data_push',
        entity_type: 'legacy_erp_module',
        old_values: current,
        new_values: expect.objectContaining({
          outcome: 'success',
          module: 'IFCAP',
          callerRole: 'integration_agent',
        }),
      }),
    );
  });

  it('handles 204 No Content response with null newValues', async () => {
    const current = { id: '42', name: 'Old' };
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response)
      .mockResolvedValueOnce(emptyResponse() as unknown as Response);

    const result = await pushUpdate(BASE_URL, baseRequest(), {});
    expect(result.newValues).toBeNull();
    expect(result.rolledBack).toBe(false);
  });

  it('proceeds with null oldValues when GET snapshot fails', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(errorResponse(503) as unknown as Response)   // snapshot GET fails
      .mockResolvedValueOnce(jsonResponse({ id: '42', name: 'Updated' }) as unknown as Response);  // token cached, not re-fetched

    const result = await pushUpdate(BASE_URL, baseRequest(), {});
    expect(result.oldValues).toBeNull();
    expect(result.newValues).toEqual({ id: '42', name: 'Updated' });
  });
});

// ─── Rollback ─────────────────────────────────────────────────────────────────

describe('pushUpdate — rollback mechanism', () => {
  it('attempts compensating PUT with oldValues when push fails and snapshot exists', async () => {
    const current = { id: '42', name: 'Old Vendor' };
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response)   // GET snapshot
      .mockResolvedValueOnce(errorResponse(500) as unknown as Response)      // PUT fails
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response);  // rollback PUT (token cached, not re-fetched)

    await expect(pushUpdate(BASE_URL, baseRequest(), {})).rejects.toBeDefined();

    const AuditLog = require('../../models/AuditLog').default;
    const rollbackCall = AuditLog.create.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { new_values?: { outcome?: string } }).new_values?.outcome === 'rollback',
    );
    expect(rollbackCall).toBeDefined();
    expect((rollbackCall[0] as { new_values: { rollbackSucceeded: boolean } }).new_values.rollbackSucceeded).toBe(true);
  });

  it('logs rollback=false when no snapshot available', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(errorResponse(500) as unknown as Response)  // GET snapshot fails
      .mockResolvedValueOnce(errorResponse(500) as unknown as Response); // PUT fails (token cached, not re-fetched)

    await expect(pushUpdate(BASE_URL, baseRequest(), {})).rejects.toBeDefined();

    const AuditLog = require('../../models/AuditLog').default;
    const failureCall = AuditLog.create.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { new_values?: { outcome?: string } }).new_values?.outcome === 'failure',
    );
    expect(failureCall).toBeDefined();
  });
});

// ─── POST non-retry ───────────────────────────────────────────────────────────

describe('pushUpdate — POST is not retried', () => {
  it('fires POST exactly once even when upstream returns 503', async () => {
    const current = { id: '42', name: 'Old' };
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response)  // GET snapshot
      .mockResolvedValueOnce(errorResponse(503) as unknown as Response);    // POST fails once

    await expect(
      pushUpdate(BASE_URL, { ...baseRequest(), method: 'POST' }, {}),
    ).rejects.toMatchObject({ errorClass: 'UpstreamUnavailable' });

    // Only 3 calls: token + snapshot GET + POST (no retry). Filter on the
    // vendor endpoint specifically -- the OAuth token fetch is also a POST,
    // to a different URL, and would otherwise be double-counted here.
    const postCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) =>
        (c[1] as { method?: string })?.method === 'POST' &&
        (c[0] as string) !== 'https://api.va.gov/oauth2/token',
    );
    expect(postCalls).toHaveLength(1);
  });
});

// ─── Circuit breaker ──────────────────────────────────────────────────────────

describe('pushUpdate — circuit breaker', () => {
  it('throws CircuitOpenError without firing fetch when circuit is OPEN', async () => {
    // Open the circuit with 3 consecutive failures. The OAuth token is fetched
    // once and cached for the rest of the test, so only the first iteration
    // needs a token mock queued.
    for (let i = 0; i < 3; i++) {
      if (i === 0) {
        mockFetch
          .mockResolvedValueOnce(tokenResponse() as unknown as Response)
          .mockResolvedValueOnce(errorResponse(500) as unknown as Response)   // snapshot
          .mockResolvedValueOnce(errorResponse(500) as unknown as Response);  // PUT
      } else {
        mockFetch
          .mockResolvedValueOnce(errorResponse(500) as unknown as Response)   // snapshot
          .mockResolvedValueOnce(errorResponse(500) as unknown as Response);  // PUT
      }
      await expect(pushUpdate(BASE_URL, { ...baseRequest(), correlationId: `f${i}` }, {})).rejects.toBeDefined();
    }

    const callsBefore = mockFetch.mock.calls.length;
    await expect(
      pushUpdate(BASE_URL, { ...baseRequest(), correlationId: 'blocked' }, {}),
    ).rejects.toMatchObject({ errorClass: 'CircuitOpenError' });
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });
});

// ─── Agent runner ─────────────────────────────────────────────────────────────

describe('runLegacyErpPushAgent', () => {
  it('returns success result with entities_processed count', async () => {
    const current = { id: '1', name: 'Old' };
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response)
      .mockResolvedValueOnce(jsonResponse({ id: '1', name: 'New' }) as unknown as Response);

    const result = await runLegacyErpPushAgent([
      { ...baseRequest(), module: 'IFCAP', endpoint: '/vendors/1', payload: { id: '1', name: 'New' } },
    ]);

    expect(result.agent_name).toBe('LegacyErpIntegrationAgent');
    expect(result.entities_processed).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.actions_taken[0].action).toBe('erp_data_pushed');
    expect(result.actions_taken[0].result).toBe('success');
  });

  it('records failed action on push error', async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(errorResponse(500) as unknown as Response)   // snapshot
      .mockResolvedValueOnce(errorResponse(500) as unknown as Response);  // PUT (token cached, not re-fetched)

    const result = await runLegacyErpPushAgent([baseRequest()]);

    expect(result.errors).toHaveLength(1);
    expect(result.actions_taken[0].action).toBe('erp_data_push_failed');
    expect(result.entities_processed).toBe(0);
  });

  it('records failed action on AuthorizationError', async () => {
    const result = await runLegacyErpPushAgent([
      { ...baseRequest(), callerRole: 'unauthorized_role' },
    ]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('AuthorizationError');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
