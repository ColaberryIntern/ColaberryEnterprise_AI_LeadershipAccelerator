/**
 * Voice WebSocket endpoints: Twilio ConversationRelay on /api/voice-ws/relay (VS2.3) and Twilio Media
 * Streams on /api/voice-ws/stream (VS2.4). nginx forwards /api/voice-ws/ with upgrade headers.
 *
 * The upgrade is refused before any WebSocket exists unless ALL hold:
 *   - a voice flag is on (else 404: the endpoint does not exist),
 *   - TWILIO_AUTH_TOKEN, VOICE_WS_BASE_URL are configured (else 403 ConfigMissing, fail closed),
 *   - X-Twilio-Signature validates for the URL Twilio connected to. Twilio documents a signature on
 *     the handshake but not the exact URL form, so both forms of OUR configured URL are accepted:
 *     wss://host/path?query and https://host/path?query, each also with a trailing slash on the path
 *     (Twilio's security page advises that for Media Streams handshakes). All name only our own
 *     host; the session ref travels in the first message, single-use, never in the URL.
 * The single-use session ref, account and CallSid are then checked on the first (setup) message.
 *
 * Node hands EVERY upgrade to this listener once it exists, with its own error handling detached. So
 * the socket gets an error handler first, and an upgrade nobody owns is answered 404 here. A path
 * outside the voice prefix is left alone only when another upgrade listener is registered.
 */
import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer } from 'ws';
import { loadVoiceConfig } from '../voiceConfig';
import { computeTwilioSignature, isValidTwilioSignature } from '../twilio/twilioSignature';
import { twilioAuthToken } from '../twilio/twilioCredentials';
import { RelayConnection, type RelayDeps } from './conversationRelayEngine';
import { RealtimeBridge, type RealtimeDeps } from './realtime/openaiRealtimeEngine';

export const RELAY_PATH = '/api/voice-ws/relay';
export const STREAM_PATH = '/api/voice-ws/stream';
const MAX_PAYLOAD = 64 * 1024;

export const VOICE_WS_PREFIX = '/api/voice-ws/';

/**
 * Which handler owns an upgrade. 'other' is left untouched for other upgrade listeners; an unknown
 * path under the voice prefix is refused 404 here, because nobody else will answer it and an
 * unanswered upgrade hangs until the client times out (seen in the VS2.6 production check).
 */
export function classifyUpgradePath(path: string): 'relay' | 'stream' | 'unknown_voice' | 'other' {
  if (path === RELAY_PATH) return 'relay';
  if (path === STREAM_PATH) return 'stream';
  return path.startsWith(VOICE_WS_PREFIX) || path === VOICE_WS_PREFIX.slice(0, -1) ? 'unknown_voice' : 'other';
}

export type UpgradeDecision ={ accept: true } | { accept: false; status: 403 | 404; errorClass: string };

/** Pure decision for one upgrade request. */
export function decideUpgrade(req: Pick<IncomingMessage, 'url' | 'headers'>, env: Record<string, string | undefined> = process.env): UpgradeDecision {
  const c = loadVoiceConfig(env);
  if (!c.valid || !(c.VOICE_STUDIO_ENABLED || c.VOICE_TEST_ENABLED)) return { accept: false, status: 404, errorClass: 'NotEnabled' };
  const token = twilioAuthToken(env);
  if (!token || !c.VOICE_WS_BASE_URL) return { accept: false, status: 403, errorClass: 'ConfigMissing' };
  const sig = req.headers['x-twilio-signature'];
  const given = Array.isArray(sig) ? sig[0] : sig;
  const host = new URL(c.VOICE_WS_BASE_URL).hostname;
  const url = req.url || '';
  const qi = url.indexOf('?');
  const path = qi < 0 ? url : url.slice(0, qi);
  const q = qi < 0 ? '' : url.slice(qi);
  const paths = path.endsWith('/') ? [path] : [path, `${path}/`];
  const candidates = paths.flatMap((p) => [`wss://${host}${p}${q}`, `https://${host}${p}${q}`]);
  const ok = candidates.some((u) => isValidTwilioSignature(token, u, {}, given));
  return ok ? { accept: true } : { accept: false, status: 403, errorClass: 'TwilioSignatureInvalid' };
}

/** Test helper: the signature Twilio would send for a handshake to `url`. */
export const signHandshake = (token: string, url: string): string => computeTwilioSignature(token, url, {});

function refuse(socket: Duplex, status: 403 | 404): void {
  socket.write(`HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Not Found'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export interface VoiceWsDeps { relay: () => RelayDeps; stream: () => RealtimeDeps }

export function attachVoiceWsServer(server: Server, deps: VoiceWsDeps, log: (line: Record<string, unknown>) => void): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => { socket.destroy(); }); // a reset by the peer must never reach the process
    const path = (req.url || '').split('?')[0];
    const kind = classifyUpgradePath(path);
    if (kind === 'other') {
      if (server.listenerCount('upgrade') <= 1) refuse(socket, 404);
      return;
    }
    if (kind === 'unknown_voice') {
      log({ level: 'warn', service: 'voice-studio', event: 'voice_ws_upgrade_refused', outcome: 'failure', error_class: 'UnknownPath', status: 404 });
      refuse(socket, 404);
      return;
    }
    const d = decideUpgrade(req);
    if (!d.accept) {
      log({ level: 'warn', service: 'voice-studio', event: 'voice_ws_upgrade_refused', outcome: 'failure', error_class: d.errorClass, status: d.status });
      refuse(socket, d.status);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const sock = { send: (t: string) => { if (ws.readyState === ws.OPEN) ws.send(t); }, close: (code?: number) => ws.close(code) };
      // A failure on one call ends that call, never the process.
      const fail = (e: unknown) => {
        log({ level: 'error', service: 'voice-studio', event: 'voice_ws_handler_failed', outcome: 'failure', error_class: (e as { name?: string })?.name || 'HandlerError' });
        ws.close(1011);
      };
      try {
        if (path === RELAY_PATH) {
          const conn = new RelayConnection(sock, deps.relay());
          ws.on('message', (data: Buffer) => { conn.onMessage(data).catch(fail); });
          ws.on('close', () => conn.onClose());
        } else {
          const bridge = new RealtimeBridge(sock, deps.stream());
          ws.on('message', (data: Buffer) => { bridge.onTwilio(data).catch(fail); });
          ws.on('close', () => bridge.onTwilioClose());
        }
      } catch (e) {
        fail(e);
      }
      ws.on('error', (e: Error) => log({ level: 'warn', service: 'voice-studio', event: 'voice_ws_socket_error', outcome: 'failure', error_class: e.name || 'SocketError' }));
    });
  });
  return wss;
}
