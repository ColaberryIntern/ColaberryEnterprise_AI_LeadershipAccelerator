/**
 * Voice AI Studio webhook routes (VS2.1). Mounted in server.ts next to webhookRoutes, before the JSON
 * parser and the auth catch-all. Each route parses its own urlencoded body (Twilio's format; repeated
 * keys become arrays, which the signature check handles).
 *
 * VOICE_ROUTE_TABLE is the declared contract: the route-table test asserts every route on this router
 * is listed, every route is Twilio-signed, and none takes a destination phone number from its caller.
 * Twilio's own To/From fields are signed carrier data, used only for validation, never persisted.
 */
import express, { Router } from 'express';
import { defaultVoiceWebhookDeps, makeVoiceWebhookHandlers, type VoiceWebhookDeps } from '../controllers/voiceTwilioWebhookController';

export interface VoiceRouteSpec { method: 'post'; path: string; auth: 'twilio_signature'; acceptsDestinationNumber: false }

export const VOICE_ROUTE_TABLE: readonly VoiceRouteSpec[] = [
  { method: 'post', path: '/api/webhook/voice/twilio/status', auth: 'twilio_signature', acceptsDestinationNumber: false },
  { method: 'post', path: '/api/webhook/voice/twilio/twiml', auth: 'twilio_signature', acceptsDestinationNumber: false },
  { method: 'post', path: '/api/webhook/voice/twilio/inbound', auth: 'twilio_signature', acceptsDestinationNumber: false },
];

export function buildVoiceWebhookRouter(deps: VoiceWebhookDeps = defaultVoiceWebhookDeps()): Router {
  const router = Router();
  const h = makeVoiceWebhookHandlers(deps);
  const body = express.urlencoded({ extended: false, limit: '64kb' });
  router.post('/api/webhook/voice/twilio/status', h.gate, body, h.verifyTwilio, h.status);
  router.post('/api/webhook/voice/twilio/twiml', h.gate, body, h.verifyTwilio, h.twiml);
  router.post('/api/webhook/voice/twilio/inbound', h.gate, body, h.verifyTwilio, h.inbound);
  return router;
}

export default buildVoiceWebhookRouter();
