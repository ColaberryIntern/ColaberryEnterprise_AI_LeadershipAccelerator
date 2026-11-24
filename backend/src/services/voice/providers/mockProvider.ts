/**
 * Mock voice provider (VS1.7): a VoiceProvider that records what it was asked to dial and never touches
 * the network. Used by voice:test:mock and by tests that must prove ZERO real calls.
 *
 * It lives under providers/ so the architecture test treats it like any provider: only the gateway may
 * import it. Outcomes are scripted so the gateway's accepted / refused / unknown paths can all be driven.
 */
import type { AuthorizedDispatch, CanonicalCallEvent, DispatchResult, ProviderHealth, ProviderStatus, VerifiedProviderEvent } from '../contracts/schemas';
import type { VoiceProvider } from '../contracts/providers';

export type MockOutcome = 'accepted' | 'refused' | 'unknown' | 'hang';

export interface MockVoiceProvider extends VoiceProvider {
  /** Every dispatch the gateway authorized, in order. The destination is kept only in memory. */
  readonly dispatched: AuthorizedDispatch[];
  /** Always 0: this provider has no network path. Asserted by tests and voice:test:mock. */
  readonly realCalls: 0;
}

export function createMockProvider(script: MockOutcome[] = ['accepted']): MockVoiceProvider {
  const dispatched: AuthorizedDispatch[] = [];
  let i = 0;
  return {
    engine: 'conversation_relay',
    dispatched,
    realCalls: 0,
    async dispatch(input: AuthorizedDispatch): Promise<DispatchResult> {
      dispatched.push(input);
      const outcome = script[Math.min(i++, script.length - 1)];
      if (outcome === 'hang') return new Promise<DispatchResult>(() => undefined);
      if (outcome === 'refused') return { outcome: 'refused', callId: input.callId, errorClass: 'MockRefused', retryable: false, detail: 'mock refused' };
      if (outcome === 'unknown') return { outcome: 'unknown', callId: input.callId, errorClass: 'MockUnknown', detail: 'mock unknown' };
      return { outcome: 'accepted', callId: input.callId, providerCallId: `MOCK-${dispatched.length}`, acceptedAt: new Date().toISOString() };
    },
    async cancel(): Promise<void> { /* nothing to cancel */ },
    async getStatus(callId: string): Promise<ProviderStatus> {
      return { providerCallId: `MOCK-${callId}`, state: 'completed', observedAt: new Date().toISOString() };
    },
    async normalizeEvent(_input: VerifiedProviderEvent): Promise<CanonicalCallEvent[]> { return []; },
    async health(): Promise<ProviderHealth> { return { provider: 'mock', ok: true, checkedAt: new Date().toISOString() }; },
  };
}
