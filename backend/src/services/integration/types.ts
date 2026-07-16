export interface ErpModuleConfig {
  name: string;
  baseUrl: string;
  endpoints: string[];
  allowedRoles?: string[];      // REQ-003: roles permitted to push updates
  requiredFields?: string[];    // field-presence check before push
}

export interface ErpRetrievalRequest {
  module: string;
  endpoint: string;
  params?: Record<string, string>;
  correlationId: string;
}

export interface ErpRetrievalResult {
  module: string;
  endpoint: string;
  correlationId: string;
  recordCount: number;
  data: unknown;
  durationMs: number;
}

export interface ErpUpdateRequest {
  module: string;
  endpoint: string;
  method: 'PUT' | 'PATCH' | 'POST';
  payload: Record<string, unknown>;
  callerRole: string;           // REQ-003: role of the calling agent / user
  correlationId: string;
}

export interface ErpUpdateResult {
  module: string;
  endpoint: string;
  correlationId: string;
  method: string;
  oldValues: unknown;           // TBI: state before update (GET snapshot)
  newValues: unknown;           // TBI: state after update (response body)
  rolledBack: boolean;
  rollbackSucceeded: boolean | null;  // null = no rollback attempted
  durationMs: number;
}

export interface PlatformChangeEvent {
  module: string;
  endpoint: string;
  method: 'PUT' | 'PATCH' | 'POST';
  changeType: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  callerRole: string;           // REQ-003: role attributed to the change
  correlationId: string;
}

export interface RealtimeSyncResult {
  module: string;
  endpoint: string;
  correlationId: string;
  synced: boolean;
  heldForApproval: boolean;
  attempts: number;
  durationMs: number;
}

export interface OAuthTokenCache {
  accessToken: string;
  expiresAt: number;
  tokenType: string;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerState {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
}
