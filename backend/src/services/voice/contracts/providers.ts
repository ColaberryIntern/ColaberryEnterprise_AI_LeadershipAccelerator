/**
 * Provider interfaces (VS1.3). Direct engines split carrier transport from the conversation engine;
 * the legacy Synthflow adapter implements VoiceProvider as one bundle.
 *
 * Only the Voice Gateway may call dispatch(): it alone mints an AuthorizedDispatch after policy and
 * the atomic reservation. A static architecture test (VS1.6) fails the build if anything else
 * imports a provider's dispatch.
 */
import type { AuthorizedDispatch, CanonicalCallEvent, DispatchResult, ProviderHealth, ProviderStatus, VerifiedProviderEvent, VoiceEngine } from './schemas';

export interface VoiceProvider {
  readonly engine: VoiceEngine;
  dispatch(input: AuthorizedDispatch): Promise<DispatchResult>;
  cancel(providerCallId: string): Promise<void>;
  getStatus(providerCallId: string): Promise<ProviderStatus>;
  normalizeEvent(input: VerifiedProviderEvent): Promise<CanonicalCallEvent[]>;
  health(): Promise<ProviderHealth>;
}

/** Carrier transport (Twilio): places/ends calls and reports carrier status. */
export interface CarrierAdapter {
  placeCall(input: AuthorizedDispatch, twimlUrl: string): Promise<DispatchResult>;
  hangup(providerCallId: string): Promise<void>;
  getStatus(providerCallId: string): Promise<ProviderStatus>;
  normalizeStatusCallback(input: VerifiedProviderEvent): CanonicalCallEvent[];
  health(): Promise<ProviderHealth>;
}

/** Conversation engine bound to a live call's media/text channel. */
export interface ConversationEngine {
  readonly engine: Exclude<VoiceEngine, 'synthflow_legacy'>;
  /** Returns the TwiML that connects the call to this engine's WebSocket. */
  buildConnectTwiml(callId: string, sessionToken: string): string;
  health(): Promise<ProviderHealth>;
}
