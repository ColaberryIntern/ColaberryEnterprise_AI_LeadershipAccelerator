import { env } from '../../config/env';
import AuditLog from '../../models/AuditLog';
import type {
  ErpRetrievalRequest,
  ErpRetrievalResult,
  ErpUpdateRequest,
  ErpUpdateResult,
  OAuthTokenCache,
  CircuitBreakerState,
  CircuitState,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const CIRCUIT_OPEN_COOLDOWN_MS = 5 * 60_000;
const CIRCUIT_OPEN_THRESHOLD = 3;
const HALF_OPEN_SUCCESS_THRESHOLD = 2;

// ─── In-memory state ──────────────────────────────────────────────────────────

let tokenCache: OAuthTokenCache | null = null;
const circuitStates = new Map<string, CircuitBreakerState>();

// ─── OAuth 2.0 client credentials ────────────────────────────────────────────

export async function fetchOAuthToken(): Promise<OAuthTokenCache> {
  const { vaErpTokenUrl, vaErpClientId, vaErpClientSecret } = env;

  if (!vaErpTokenUrl || !vaErpClientId || !vaErpClientSecret) {
    throw Object.assign(new Error('VA ERP OAuth credentials not configured'), {
      errorClass: 'ConfigurationError',
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(vaErpTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: vaErpClientId,
        client_secret: vaErpClientSecret,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw Object.assign(
        new Error(`OAuth token fetch failed: ${response.status} ${response.statusText}`),
        { errorClass: 'AuthError' },
      );
    }

    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
      token_type: string;
    };

    return {
      accessToken: body.access_token,
      tokenType: body.token_type ?? 'Bearer',
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getToken(): Promise<OAuthTokenCache> {
  if (tokenCache && tokenCache.expiresAt - TOKEN_EXPIRY_BUFFER_MS > Date.now()) {
    return tokenCache;
  }
  tokenCache = await fetchOAuthToken();
  return tokenCache;
}

export function clearTokenCache(): void {
  tokenCache = null;
}

// ─── Circuit Breaker (in-memory) ─────────────────────────────────────────────

function getCircuitState(module: string): CircuitBreakerState {
  return circuitStates.get(module) ?? { state: 'CLOSED', consecutiveFailures: 0, openedAt: null };
}

function resolvedCircuitState(s: CircuitBreakerState): CircuitState {
  if (s.state !== 'OPEN') return s.state;
  if (s.openedAt !== null && Date.now() - s.openedAt >= CIRCUIT_OPEN_COOLDOWN_MS) {
    return 'HALF_OPEN';
  }
  return 'OPEN';
}

function recordSuccess(module: string): void {
  const s = getCircuitState(module);
  if (resolvedCircuitState(s) === 'HALF_OPEN') {
    // Track half-open probes using negative consecutiveFailures as a success counter
    const probeSuccesses = s.consecutiveFailures < 0 ? Math.abs(s.consecutiveFailures) + 1 : 1;
    if (probeSuccesses >= HALF_OPEN_SUCCESS_THRESHOLD) {
      circuitStates.set(module, { state: 'CLOSED', consecutiveFailures: 0, openedAt: null });
    } else {
      circuitStates.set(module, { ...s, state: 'HALF_OPEN', consecutiveFailures: -probeSuccesses });
    }
  } else {
    circuitStates.set(module, { state: 'CLOSED', consecutiveFailures: 0, openedAt: null });
  }
}

function recordFailure(module: string): void {
  const s = getCircuitState(module);
  const failures = Math.max(0, s.consecutiveFailures) + 1;
  if (failures >= CIRCUIT_OPEN_THRESHOLD || resolvedCircuitState(s) === 'HALF_OPEN') {
    circuitStates.set(module, { state: 'OPEN', consecutiveFailures: failures, openedAt: Date.now() });
  } else {
    circuitStates.set(module, { ...s, consecutiveFailures: failures });
  }
}

export function resetCircuit(module: string): void {
  circuitStates.delete(module);
}

// ─── Audit log ────────────────────────────────────────────────────────────────

async function writeAuditLog(
  request: ErpRetrievalRequest,
  outcome: 'success' | 'failure',
  detail: Record<string, unknown>,
): Promise<void> {
  await AuditLog.create({
    action: 'erp_data_retrieval',
    entity_type: 'legacy_erp_module',
    entity_id: null,
    admin_user_id: null,
    ip_address: null,
    old_values: null,
    new_values: {
      module: request.module,
      endpoint: request.endpoint,
      params: request.params ?? null,
      correlationId: request.correlationId,
      outcome,
      ...detail,
    },
  });
}

// ─── Core retrieval ───────────────────────────────────────────────────────────

export async function retrieveData(
  baseUrl: string,
  request: ErpRetrievalRequest,
): Promise<ErpRetrievalResult> {
  const circuit = getCircuitState(request.module);
  if (resolvedCircuitState(circuit) === 'OPEN') {
    const err = Object.assign(
      new Error(`Circuit breaker OPEN for module ${request.module}`),
      { errorClass: 'CircuitOpenError' },
    );
    await writeAuditLog(request, 'failure', { errorClass: 'CircuitOpenError' });
    throw err;
  }

  const { vaErpRequestTimeoutMs: timeoutMs, vaErpMaxRetries: maxRetries } = env;
  let lastError: Error & { errorClass?: string } = new Error('Unknown error');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startMs = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const token = await getToken();
      const url = new URL(request.endpoint, baseUrl);
      if (request.params) {
        for (const [k, v] of Object.entries(request.params)) {
          url.searchParams.set(k, v);
        }
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `${token.tokenType} ${token.accessToken}`,
          'X-Correlation-ID': request.correlationId,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errClass = response.status >= 500 ? 'UpstreamUnavailable' : 'ClientError';
        throw Object.assign(
          new Error(`ERP responded ${response.status} for ${request.module}${request.endpoint}`),
          { errorClass: errClass },
        );
      }

      const data: unknown = await response.json();
      const durationMs = Date.now() - startMs;
      const recordCount = Array.isArray(data) ? data.length : 1;

      recordSuccess(request.module);
      await writeAuditLog(request, 'success', { recordCount, durationMs, attempt });

      return {
        module: request.module,
        endpoint: request.endpoint,
        correlationId: request.correlationId,
        recordCount,
        data,
        durationMs,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const e = err as Error & { errorClass?: string };
      if (!e.errorClass) {
        e.errorClass = controller.signal.aborted ? 'TimeoutError' : 'UpstreamUnavailable';
      }
      lastError = e;

      const isRetryable = e.errorClass === 'TimeoutError' || e.errorClass === 'UpstreamUnavailable';
      if (!isRetryable || attempt === maxRetries) break;

      await new Promise<void>(resolve => setTimeout(resolve, 250 * Math.pow(2, attempt)));
    }
  }

  recordFailure(request.module);
  await writeAuditLog(request, 'failure', {
    errorClass: lastError.errorClass ?? 'UnknownError',
    message: lastError.message,
  });
  throw lastError;
}

// ─── Payload validation ───────────────────────────────────────────────────────

function validatePayload(
  payload: Record<string, unknown>,
  requiredFields: string[],
): void {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw Object.assign(new Error('Payload must be a non-null object'), {
      errorClass: 'ValidationError',
    });
  }
  for (const field of requiredFields) {
    if (!(field in payload) || payload[field] === undefined || payload[field] === null) {
      throw Object.assign(
        new Error(`Required field '${field}' missing or null in update payload`),
        { errorClass: 'ValidationError' },
      );
    }
  }
}

// ─── Update audit log ─────────────────────────────────────────────────────────

async function writeUpdateAuditLog(
  request: ErpUpdateRequest,
  outcome: 'success' | 'failure' | 'rollback',
  oldValues: unknown,
  newValues: unknown,
  detail: Record<string, unknown>,
): Promise<void> {
  await AuditLog.create({
    action: 'erp_data_push',
    entity_type: 'legacy_erp_module',
    entity_id: null,
    admin_user_id: null,
    ip_address: null,
    old_values: oldValues,
    new_values: {
      module: request.module,
      endpoint: request.endpoint,
      method: request.method,
      callerRole: request.callerRole,
      correlationId: request.correlationId,
      outcome,
      updatedData: newValues,
      ...detail,
    },
  });
}

// ─── Push update ──────────────────────────────────────────────────────────────

export async function pushUpdate(
  baseUrl: string,
  request: ErpUpdateRequest,
  options: { allowedRoles?: string[]; requiredFields?: string[] } = {},
): Promise<ErpUpdateResult> {
  const { allowedRoles = [], requiredFields = [] } = options;

  // REQ-003: role check — FAIL CLOSED. A module with no allowedRoles configured has
  // no authorized writers, so deny rather than fall through to open access. Callers
  // must pass the module's explicit ACL (the agent runner sources it from module config).
  if (allowedRoles.length === 0) {
    throw Object.assign(
      new Error(`No allowedRoles configured for ${request.module}; refusing push (fail-closed)`),
      { errorClass: 'AuthorizationError' },
    );
  }
  if (!allowedRoles.includes(request.callerRole)) {
    throw Object.assign(
      new Error(`Role '${request.callerRole}' is not permitted to push updates to ${request.module}`),
      { errorClass: 'AuthorizationError' },
    );
  }

  // Payload integrity check
  validatePayload(request.payload, requiredFields);

  // Circuit breaker
  const circuit = getCircuitState(request.module);
  if (resolvedCircuitState(circuit) === 'OPEN') {
    throw Object.assign(
      new Error(`Circuit breaker OPEN for module ${request.module}`),
      { errorClass: 'CircuitOpenError' },
    );
  }

  // TBI: GET snapshot before write (captures old_values for audit + enables rollback)
  let oldValues: unknown = null;
  try {
    const snapshot = await retrieveData(baseUrl, {
      module: request.module,
      endpoint: request.endpoint,
      correlationId: `${request.correlationId}-snapshot`,
    });
    oldValues = snapshot.data;
  } catch {
    // Non-fatal: proceed without rollback capability; audit old_values = null
  }

  const { vaErpRequestTimeoutMs: timeoutMs, vaErpMaxRetries: maxRetries } = env;
  // Only idempotent methods (PUT/PATCH) are retried; POST is fire-once
  const isIdempotent = request.method !== 'POST';
  const effectiveMaxRetries = isIdempotent ? maxRetries : 0;
  let lastError: Error & { errorClass?: string } = new Error('Unknown error');
  const startMs = Date.now();

  for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const token = await getToken();
      const url = new URL(request.endpoint, baseUrl);

      const response = await fetch(url.toString(), {
        method: request.method,
        headers: {
          Authorization: `${token.tokenType} ${token.accessToken}`,
          'X-Correlation-ID': request.correlationId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(request.payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errClass = response.status >= 500 ? 'UpstreamUnavailable' : 'ClientError';
        throw Object.assign(
          new Error(`ERP responded ${response.status} for ${request.method} ${request.module}${request.endpoint}`),
          { errorClass: errClass },
        );
      }

      const newValues: unknown = response.status === 204 ? null : await response.json();
      const durationMs = Date.now() - startMs;

      recordSuccess(request.module);
      await writeUpdateAuditLog(request, 'success', oldValues, newValues, { durationMs, attempt });

      return {
        module: request.module,
        endpoint: request.endpoint,
        correlationId: request.correlationId,
        method: request.method,
        oldValues,
        newValues,
        rolledBack: false,
        rollbackSucceeded: null,
        durationMs,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const e = err as Error & { errorClass?: string };
      if (!e.errorClass) {
        e.errorClass = controller.signal.aborted ? 'TimeoutError' : 'UpstreamUnavailable';
      }
      lastError = e;

      const isRetryable = isIdempotent &&
        (e.errorClass === 'TimeoutError' || e.errorClass === 'UpstreamUnavailable');
      if (!isRetryable || attempt === effectiveMaxRetries) break;

      await new Promise<void>(resolve => setTimeout(resolve, 250 * Math.pow(2, attempt)));
    }
  }

  // Push failed — attempt compensating rollback if we have a snapshot
  recordFailure(request.module);

  let rolledBack = false;
  let rollbackSucceeded: boolean | null = null;

  if (oldValues !== null) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const token = await getToken();
      const url = new URL(request.endpoint, baseUrl);

      const rbResponse = await fetch(url.toString(), {
        method: 'PUT',
        headers: {
          Authorization: `${token.tokenType} ${token.accessToken}`,
          'X-Correlation-ID': `${request.correlationId}-rollback`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(oldValues),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      rolledBack = true;
      rollbackSucceeded = rbResponse.ok;
    } catch {
      rolledBack = true;
      rollbackSucceeded = false;
    }

    await writeUpdateAuditLog(request, 'rollback', oldValues, null, {
      rollbackSucceeded,
      originalError: lastError.message,
      errorClass: lastError.errorClass ?? 'UnknownError',
    });
  } else {
    await writeUpdateAuditLog(request, 'failure', oldValues, null, {
      errorClass: lastError.errorClass ?? 'UnknownError',
      message: lastError.message,
    });
  }

  throw lastError;
}
