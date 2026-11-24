/**
 * Voice WebSocket endpoint (VS2.3): accepts Twilio ConversationRelay connections on
 * /api/voice-ws/relay (nginx forwards /api/voice-ws/ with upgrade headers).
 *
 * The upgrade is refused before any WebSocket exists unless ALL hold:
 *   - a voice flag is on (else 404: the endpoint does not exist),
 *   - TWILIO_AUTH_TOKEN, VOICE_WS_BASE_URL are configured (else 403 ConfigMissing, fail closed),
 *   - X-Twilio-Signature validates for the URL Twilio connected to. Twilio documents a signature on
 *     the handshake but not the exact URL form, so both forms of OUR configured URL are accepted:
 *     wss://host/path?query and https://host/path?query. Both name only our own host; the query
 *     carries nothing secret (the session ref is in the setup message, single-use).
 * The single-use session ref, account and CallSid are then checked on the first (setup) message.
 *
 * Upgrades for any other path are left alone (no other handler exists today; nothing is destroyed).
 */
import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer } from 'ws';
import { loadVoiceConfig } from '../voiceConfig';
import { computeTwilioSignature, isValidTwilioSignature } from '../twilio/twilioSignature';
import { twilioAuthToken } from '../twilio/twilioCredentials';
import { RelayConnection, type RelayDeps } from './conversationRelayEngine';

export const RELAY_PATH = '/api/voice-ws/relay';
const MAX_PAYLOAD = 64 * 1024;

export type UpgradeDecision = { accept: true } | { accept: false; status: 403 | 404; errorClass: string };

/** Pure decision for one upgrade request. */
export function decideUpgrade(req: Pick<IncomingMessage, 'url' | 'headers'>, env: Record<string, string | undefined> = process.env): UpgradeDecision {
  const c = loadVoiceConfig(env);
  if (!c.valid || !(c.VOICE_STUDIO_ENABLED || c.VOICE_TEST_ENABLED)) return { accept: false, status: 404, errorClass: 'NotEnabled' };
  const token = twilioAuthToken(env);
  if (!token || !c.VOICE_WS_BASE_URL) return { accept: false, status: 403, errorClass: 'ConfigMissing' };
  const sig = req.headers['x-twilio-signature'];
  const given = Array.isArray(sig) ? sig[0] : sig;
  const host = new URL(c.VOICE_WS_BASE_URL).hostname;
  const pathAndQuery = req.url || '';
  const ok = [`wss://${host}${pathAndQuery}`, `https://${host}${pathAndQuery}`].some((u) => isValidTwilioSignature(token, u, {}, given));
  return ok ? { accept: true } : { accept: false, status: 403, errorClass: 'TwilioSignatureInvalid' };
}

/** Test helper: the signature Twilio would send for a handshake to `url`. */
export const signHandshake = (token: string, url: string): string => computeTwilioSignature(token, url, {});

function refuse(socket: Duplex, status: 403 | 404): void {
  socket.write(`HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Not Found'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function attachVoiceWsServer(server: Server, deps: () => RelayDeps, log: (line: Record<string, unknown>) => void): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url || '').split('?')[0];
    if (path !== RELAY_PATH) return;
    const d = decideUpgrade(req);
    if (!d.accept) {
      log({ level: 'warn', service: 'voice-studio', event: 'voice_ws_upgrade_refused', outcome: 'failure', error_class: d.errorClass, status: d.status });
      refuse(socket, d.status);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = new RelayConnection({ send: (t) => { if (ws.readyState === ws.OPEN) ws.send(t); }, close: (code) => ws.close(code) }, deps());
      ws.on('message', (data: Buffer) => { void conn.onMessage(data); });
      ws.on('close', () => conn.onClose());
      ws.on('error', (e: Error) => log({ level: 'warn', service: 'voice-studio', event: 'voice_ws_socket_error', outcome: 'failure', error_class: e.name || 'SocketError' }));
    });
  });
  return wss;
}
