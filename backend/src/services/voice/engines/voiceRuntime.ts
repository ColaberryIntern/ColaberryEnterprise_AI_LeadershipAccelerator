/**
 * Voice runtime wiring (VS2.3): the production dependencies for the engines, built lazily so a
 * process with every voice flag off creates nothing (no worker, no Anthropic client, no timers).
 *
 *   - One SessionWorker per process, with SIGTERM drain (20 s deadline).
 *   - Tool runs are written to voice_tool_runs idempotently (ON CONFLICT on (call_id, idempotency_key)),
 *     with up to 3 attempts and backoff, so a committed action survives a brief database blip
 *     (carry from VS2.2). After that it is logged as voice_tool_record_lost for manual triage.
 *   - The answer TwiML for a call depends on its engine (voice_calls.engine). Engine B joins in VS2.4.
 */
import type { Server } from 'http';
import { performance } from 'perf_hooks';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { getAvailableSlots } from '../../calendarService';
import { admissionsCalendar } from '../../calendarTarget';
import { loadVoiceConfig } from '../voiceConfig';
import { installSigtermDrain, SessionWorker, type WorkerDeps } from '../session/sessionWorker';
import { mintToken } from '../twilio/correlationToken';
import { consumeToken } from '../twilio/voiceCallStore';
import { createClaudeVoiceLlm } from './claudeVoiceLlm';
import type { RelayDeps } from './conversationRelayEngine';
import { buildRelayTwiml } from './relayProtocol';
import { nextOpenSlotsTool, ToolBroker } from './toolBroker';
import { TEST_PROFILE } from './voiceProfiles';
import { attachVoiceWsServer, RELAY_PATH } from './voiceWsServer';

const HANGUP = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
const log = (line: Record<string, unknown>): void => {
  (line.level === 'error' || line.level === 'warn' ? console.warn : console.log)(JSON.stringify({ timestamp: new Date().toISOString(), service: 'voice-studio', ...line }));
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Idempotent tool-run insert with bounded retry. Exported for tests. */
export async function persistToolRun(callId: string, rec: { toolCallId: string; name: string; turnId: number; committed: boolean; afterClose: boolean },
  exec: (sql: string, replacements: Record<string, unknown>) => Promise<unknown> = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.INSERT }),
  attempts = 3, backoffMs = 200): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await exec(
        `INSERT INTO voice_tool_runs (tenant_id, call_id, turn_index, tool_name, idempotency_key, auth_decision, status, ended_at)
         SELECT c.tenant_id, c.id, :turn, :name, :key, 'allowed', :status, NOW() FROM voice_calls c WHERE c.id = :callId
         ON CONFLICT (call_id, idempotency_key) DO NOTHING`,
        { callId, turn: rec.turnId, name: rec.name, key: rec.toolCallId, status: rec.committed ? 'committed' : 'completed' },
      );
      return true;
    } catch (e) {
      if (i === attempts) {
        log({ level: 'error', event: 'voice_tool_record_lost', outcome: 'failure', error_class: (e as { name?: string })?.name || 'DatabaseError', call_id: callId, tool_call_id: rec.toolCallId, committed: rec.committed, after_close: rec.afterClose });
        return false;
      }
      await sleep(backoffMs * 2 ** (i - 1));
    }
  }
  return false;
}

let worker: SessionWorker | null = null;
function getWorker(): SessionWorker {
  if (worker) return worker;
  const deps: WorkerDeps = {
    now: () => performance.now(),
    log,
    // Carrier-side reconcile (ask Twilio what happened) arrives with the Test Lab reconciler (VS2.5).
    reconcile: async (s) => { log({ level: 'warn', event: 'voice_reconcile_needed', outcome: 'partial', call_id: s.callId, state: s.state }); },
    recordTool: (callId, rec) => { void persistToolRun(callId, rec); },
  };
  worker = new SessionWorker(deps);
  installSigtermDrain(worker, process, 20_000);
  return worker;
}

async function callMatches(callId: string, callSid: string): Promise<boolean> {
  const rows = await sequelize.query<{ provider_call_id: string | null }>('SELECT provider_call_id FROM voice_calls WHERE id = :callId', { replacements: { callId }, type: QueryTypes.SELECT });
  return rows.length === 1 && (rows[0].provider_call_id === null || rows[0].provider_call_id === callSid);
}

export function relayDeps(): RelayDeps {
  const c = loadVoiceConfig();
  return {
    worker: getWorker(),
    llm: createClaudeVoiceLlm(c.VOICE_ENGINE_A_MODEL),
    broker: () => new ToolBroker([nextOpenSlotsTool(() => getAvailableSlots(14, admissionsCalendar()))]),
    profile: TEST_PROFILE,
    accountSid: () => process.env.TWILIO_ACCOUNT_SID || undefined,
    consumeSessionRef: consumeToken,
    callMatches,
    now: () => Date.now(),
    log,
  };
}

/** The answer TwiML for a connected call, by its engine. Unknown or unsupported engine: hang up. */
export async function connectTwimlFor(callId: string): Promise<string> {
  const c = loadVoiceConfig();
  const rows = await sequelize.query<{ engine: string }>('SELECT engine FROM voice_calls WHERE id = :callId', { replacements: { callId }, type: QueryTypes.SELECT });
  if (rows[0]?.engine === 'conversation_relay' && c.VOICE_WS_BASE_URL) {
    return buildRelayTwiml({
      wsUrl: new URL(RELAY_PATH, c.VOICE_WS_BASE_URL).toString(),
      sessionRef: mintToken(callId, 'session', 120),
      welcomeGreeting: TEST_PROFILE.greeting,
      language: TEST_PROFILE.language,
      voice: c.VOICE_RELAY_VOICE,
    });
  }
  log({ level: 'warn', event: 'voice_connect_unsupported_engine', outcome: 'skipped', error_class: 'UnsupportedEngine', call_id: callId, engine: rows[0]?.engine ?? null });
  return HANGUP;
}

/** Called once at boot with the HTTP server. Cheap when voice is off: the upgrade handler only reads config per request. */
export function installVoiceRuntime(server: Server): void {
  attachVoiceWsServer(server, relayDeps, log);
}
