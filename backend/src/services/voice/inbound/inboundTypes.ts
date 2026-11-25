import type { CalledNumber } from './inboundPlan';

/** What opening an inbound call needs. No caller number: it is never stored. */
export interface CallSession { callSid: string; number: CalledNumber; engine: 'conversation_relay'; testMode: boolean }
