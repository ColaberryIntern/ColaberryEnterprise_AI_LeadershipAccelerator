import { EventEmitter } from 'events';
import AuditLog from '../../models/AuditLog';
import { pushUpdate } from './legacyErpClient';
import { authorizeAgentAction } from '../agentAuthorizationService';
import type { ErpModuleConfig, PlatformChangeEvent, RealtimeSyncResult } from './types';

const AGENT_NAME = 'LegacyErpIntegrationAgent';

// Outer retry layer for a whole sync attempt (ABAC check + snapshot + write), separate
// from pushUpdate()'s own inner HTTP-level retry. Kept small and fixed -- compounding
// this with env.vaErpMaxRetries would let a single change trigger a retry storm against
// a legacy system. This layer exists for transient failures around the sync attempt
// itself (e.g. a snapshot read that fails independently of the write that follows it).
const DEFAULT_SYNC_MAX_ATTEMPTS = 2;

// Stand-in for "WebSocket or similar real-time communication protocol" (the ticket's own
// "or similar"). The VA ERP Integration Platform IS this backend -- there is no separate
// external client to hold a socket open for. Any part of the platform (a model hook, a
// route handler) calls emitPlatformChange() the moment data changes, and this module
// reacts in the same event loop, which satisfies "set up event listeners for changes"
// with zero added transport/infra. Swap the internals for a real WebSocket/pub-sub layer
// if a genuinely external subscriber shows up later -- the emit/listen contract below
// would not need to change at the call sites.
const changeBus = new EventEmitter();
const CHANGE_EVENT = 'platform-change';

export function emitPlatformChange(event: PlatformChangeEvent): void {
  changeBus.emit(CHANGE_EVENT, event);
}

async function writeRealtimeSyncAuditLog(
  event: PlatformChangeEvent,
  outcome: 'success' | 'failure' | 'held',
  detail: Record<string, unknown>,
): Promise<void> {
  await AuditLog.create({
    action: 'erp_realtime_sync',
    entity_type: 'legacy_erp_module',
    entity_id: null,
    admin_user_id: null,
    ip_address: null,
    old_values: null,
    new_values: {
      module: event.module,
      endpoint: event.endpoint,
      changeType: event.changeType,
      correlationId: event.correlationId,
      outcome,
      ...detail,
    },
  });
}

/**
 * Synchronize one platform-change event to its legacy ERP module. Routes through the same
 * ABAC chokepoint STORY-002 established (REQ-003 / TBI "AI proposes, human approves") --
 * a real-time trigger doesn't get to bypass the human-approval gate a manual push would hit.
 * Exported directly (not only reachable via the event bus) so it's testable the same way
 * pushUpdate() is: call it, await the result, assert on it -- no event-loop timing needed.
 */
export async function syncPlatformChange(
  event: PlatformChangeEvent,
  moduleConfigs: ErpModuleConfig[],
  maxAttempts: number = DEFAULT_SYNC_MAX_ATTEMPTS,
): Promise<RealtimeSyncResult> {
  const startMs = Date.now();
  const moduleConfig = moduleConfigs.find(m => m.name === event.module);

  const authz = await authorizeAgentAction({
    agentId: AGENT_NAME,
    agentName: AGENT_NAME,
    action: 'erp_realtime_sync',
    resourceType: 'legacy_erp_module',
    resourceId: event.module,
    context: { resourceType: 'legacy_erp_module' },
  });

  if (!authz.allowed) {
    await writeRealtimeSyncAuditLog(event, 'held', {
      requiresApproval: authz.requiresApproval,
      reason: authz.reason,
    });
    return {
      module: event.module,
      endpoint: event.endpoint,
      correlationId: event.correlationId,
      synced: false,
      heldForApproval: true,
      attempts: 0,
      durationMs: Date.now() - startMs,
    };
  }

  let lastError: Error & { errorClass?: string } = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pushUpdate(
        moduleConfig?.baseUrl ?? '',
        {
          module: event.module,
          endpoint: event.endpoint,
          method: event.method,
          payload: event.payload,
          callerRole: event.callerRole,
          correlationId: event.correlationId,
        },
        {
          allowedRoles: moduleConfig?.allowedRoles ?? [],
          requiredFields: moduleConfig?.requiredFields ?? [],
        },
      );

      await writeRealtimeSyncAuditLog(event, 'success', {
        attempts: attempt,
        durationMs: Date.now() - startMs,
      });

      return {
        module: event.module,
        endpoint: event.endpoint,
        correlationId: event.correlationId,
        synced: true,
        heldForApproval: false,
        attempts: attempt,
        durationMs: Date.now() - startMs,
      };
    } catch (err: unknown) {
      lastError = err as Error & { errorClass?: string };
      if (attempt < maxAttempts) {
        await new Promise<void>(resolve => setTimeout(resolve, 250 * Math.pow(2, attempt - 1)));
      }
    }
  }

  await writeRealtimeSyncAuditLog(event, 'failure', {
    attempts: maxAttempts,
    errorClass: lastError.errorClass ?? 'UnknownError',
    message: lastError.message,
  });

  return {
    module: event.module,
    endpoint: event.endpoint,
    correlationId: event.correlationId,
    synced: false,
    heldForApproval: false,
    attempts: maxAttempts,
    durationMs: Date.now() - startMs,
  };
}

export interface RealtimeSyncOptions {
  maxAttempts?: number;
  onSyncResult?: (result: RealtimeSyncResult) => void;
}

/**
 * Subscribe to platform-change events and synchronize each one in real time as it arrives.
 * Returns an unsubscribe function -- callers (and every test) MUST call it when done, or the
 * listener leaks across cases/requests.
 */
export function startRealtimeSync(
  moduleConfigs: ErpModuleConfig[],
  options: RealtimeSyncOptions = {},
): () => void {
  const maxAttempts = options.maxAttempts ?? DEFAULT_SYNC_MAX_ATTEMPTS;

  const listener = (event: PlatformChangeEvent): void => {
    void syncPlatformChange(event, moduleConfigs, maxAttempts).then(result => {
      options.onSyncResult?.(result);
    });
  };

  changeBus.on(CHANGE_EVENT, listener);
  return () => changeBus.off(CHANGE_EVENT, listener);
}
