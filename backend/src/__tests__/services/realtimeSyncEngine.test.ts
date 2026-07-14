import {
  syncPlatformChange,
  emitPlatformChange,
  startRealtimeSync,
} from '../../services/integration/realtimeSyncEngine';
import { clearTokenCache, resetCircuit } from '../../services/integration/legacyErpClient';
import { startLegacyErpRealtimeSyncAgent } from '../../services/integration/legacyErpIntegrationAgent';
import type { PlatformChangeEvent } from '../../services/integration/types';

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

// ABAC chokepoint — default to shadow "allow" so most tests exercise the sync path;
// individual tests override with mockResolvedValueOnce to exercise the held-for-approval path.
jest.mock('../../services/agentAuthorizationService', () => ({
  authorizeAgentAction: jest.fn().mockResolvedValue({
    allowed: true, enforced: false, reason: 'ok',
    requiresApproval: false, level: 'act_audited', wouldDeny: false, mode: 'shadow',
  }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODULE_CONFIGS = [
  {
    name: 'IFCAP',
    baseUrl: 'https://api.va.gov/erp/ifcap',
    endpoints: ['/vendors'],
    allowedRoles: ['integration_agent', 'admin'],
    requiredFields: ['id', 'name'],
  },
];

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

function errorResponse(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: `HTTP ${status}`,
  } as unknown as Response);
}

const baseEvent = (): PlatformChangeEvent => ({
  module: 'IFCAP',
  endpoint: '/vendors/42',
  method: 'PUT',
  changeType: 'update',
  payload: { id: '42', name: 'Updated Vendor' },
  callerRole: 'integration_agent',
  correlationId: 'corr-rt-001',
});

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  clearTokenCache();
  resetCircuit('IFCAP');
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('syncPlatformChange — happy path', () => {
  it('syncs on the first attempt and logs a success audit entry', async () => {
    const current = { id: '42', name: 'Old Vendor' };
    const updated = { id: '42', name: 'Updated Vendor' };
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response)  // GET snapshot
      .mockResolvedValueOnce(jsonResponse(updated) as unknown as Response); // PUT

    const result = await syncPlatformChange(baseEvent(), MODULE_CONFIGS);

    expect(result.synced).toBe(true);
    expect(result.heldForApproval).toBe(false);
    expect(result.attempts).toBe(1);

    const AuditLog = require('../../models/AuditLog').default;
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'erp_realtime_sync',
        entity_type: 'legacy_erp_module',
        new_values: expect.objectContaining({
          module: 'IFCAP',
          changeType: 'update',
          outcome: 'success',
          attempts: 1,
        }),
      }),
    );
  });
});

// ─── ABAC hold ────────────────────────────────────────────────────────────────

describe('syncPlatformChange — ABAC approval gate', () => {
  it('does not call fetch and logs a held audit entry when authorization denies', async () => {
    const { authorizeAgentAction } = require('../../services/agentAuthorizationService');
    (authorizeAgentAction as jest.Mock).mockResolvedValueOnce({
      allowed: false, enforced: true, reason: 'requires_approval:erp_write',
      requiresApproval: true, level: 'act_audited', wouldDeny: true, mode: 'enforce',
    });

    const result = await syncPlatformChange(baseEvent(), MODULE_CONFIGS);

    expect(result.synced).toBe(false);
    expect(result.heldForApproval).toBe(true);
    expect(result.attempts).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();

    const AuditLog = require('../../models/AuditLog').default;
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        new_values: expect.objectContaining({ outcome: 'held', requiresApproval: true }),
      }),
    );
  });
});

// ─── Retry ────────────────────────────────────────────────────────────────────

describe('syncPlatformChange — retry', () => {
  it('retries once and succeeds on the second attempt', async () => {
    const updated = { id: '42', name: 'Updated Vendor' };
    mockFetch
      // attempt 1: token + snapshot fails + PUT fails. Snapshot failing means
      // oldValues stays null, so pushUpdate does NOT attempt a compensating
      // rollback (that would be a 4th fetch call) -- keeps this deterministic.
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(errorResponse(503) as unknown as Response)
      .mockResolvedValueOnce(errorResponse(503) as unknown as Response)
      // attempt 2: snapshot + PUT succeed (token still cached)
      .mockResolvedValueOnce(jsonResponse({ id: '42', name: 'Old Vendor' }) as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(updated) as unknown as Response);

    const result = await syncPlatformChange(baseEvent(), MODULE_CONFIGS, 2);

    expect(result.synced).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('gives up after maxAttempts and logs a failure audit entry', async () => {
    mockFetch
      // attempt 1: token + snapshot fails + PUT fails (no rollback -- see note above)
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(errorResponse(503) as unknown as Response)
      .mockResolvedValueOnce(errorResponse(503) as unknown as Response)
      // attempt 2 (token cached, not re-fetched)
      .mockResolvedValueOnce(errorResponse(503) as unknown as Response)
      .mockResolvedValueOnce(errorResponse(503) as unknown as Response);

    const result = await syncPlatformChange(baseEvent(), MODULE_CONFIGS, 2);

    expect(result.synced).toBe(false);
    expect(result.heldForApproval).toBe(false);
    expect(result.attempts).toBe(2);

    const AuditLog = require('../../models/AuditLog').default;
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        new_values: expect.objectContaining({ outcome: 'failure', attempts: 2 }),
      }),
    );
  });
});

// ─── Event bus wiring ─────────────────────────────────────────────────────────

describe('emitPlatformChange / startRealtimeSync — event bus wiring', () => {
  it('synchronizes an emitted change and unsubscribe stops further syncs', async () => {
    const current = { id: '42', name: 'Old Vendor' };
    const updated = { id: '42', name: 'Updated Vendor' };
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(updated) as unknown as Response);

    const results: Array<{ synced: boolean }> = [];
    const done = new Promise<void>(resolve => {
      const unsubscribe = startRealtimeSync(MODULE_CONFIGS, {
        maxAttempts: 1,
        onSyncResult: result => {
          results.push(result);
          unsubscribe();
          resolve();
        },
      });
    });

    emitPlatformChange(baseEvent());
    await done;

    expect(results).toHaveLength(1);
    expect(results[0].synced).toBe(true);

    // Unsubscribed — a further emit must not trigger another fetch.
    const callsBefore = mockFetch.mock.calls.length;
    emitPlatformChange(baseEvent());
    await new Promise(resolve => setImmediate(resolve));
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });
});

// ─── Agent runner wiring ──────────────────────────────────────────────────────

describe('startLegacyErpRealtimeSyncAgent', () => {
  it('subscribes using the parsed module config and returns a working unsubscribe function', async () => {
    const current = { id: '42', name: 'Old Vendor' };
    const updated = { id: '42', name: 'Updated Vendor' };
    mockFetch
      .mockResolvedValueOnce(tokenResponse() as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(current) as unknown as Response)
      .mockResolvedValueOnce(jsonResponse(updated) as unknown as Response);

    const done = new Promise<void>(resolve => {
      const unsubscribe = startLegacyErpRealtimeSyncAgent({
        maxAttempts: 1,
        onSyncResult: () => {
          unsubscribe();
          resolve();
        },
      });
    });

    emitPlatformChange(baseEvent());
    await done;

    expect(mockFetch).toHaveBeenCalled();
  });
});
