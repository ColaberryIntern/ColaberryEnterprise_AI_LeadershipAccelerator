/**
 * Engine A connection (VS2.3): one Twilio ConversationRelay WebSocket = one live call.
 * Relay does speech-to-text and ElevenLabs text-to-speech; this module only exchanges text.
 *
 * Lifecycle:
 *   1. setup: the single-use session ref (from <Parameter name="ref">) must verify (purpose session),
 *      be unused, match OUR account, and name a call whose CallSid matches. Anything else ends the
 *      socket before a session exists. Twilio already spoke the AI-disclosure greeting (TwiML).
 *   2. prompt (final): a caller turn. Any answer in flight is canceled first (state machine).
 *   3. The answer streams from Claude token by token. Tokens are sent only while the session still
 *      accepts this (turn, generation); an interrupt or newer turn makes every later token stale.
 *   4. interrupt: cancel the generation and keep, as the assistant's history, only what the caller
 *      actually heard (utteranceUntilInterrupt). The canceled generation never resumes.
 *   5. Tools: through the broker (validated, idempotent per tool-call id, timed out), at most
 *      MAX_TOOL_ROUNDS per answer, each recorded via the worker even if the caller hangs up.
 *   6. End: the worker's onEnd (max duration, timeout, drain) sends Twilio `end`; a socket close
 *      closes the session. Ten malformed frames close the socket (Twilio's own rule, mirrored).
 *
 * Never logged: transcripts, prompts, phone numbers. Logs carry call id, event, error class.
 */
import type { SessionHandle, SessionWorker } from '../session/sessionWorker';
import type { TokenClaims } from '../twilio/correlationToken';
import { verifyToken } from '../twilio/correlationToken';
import type { VoiceLlm, VoiceMessage } from './claudeVoiceLlm';
import { endSession, parseRelayMessage, textToken, type RelayInbound } from './relayProtocol';
import type { ToolBroker } from './toolBroker';
import type { VoiceProfile } from './voiceProfiles';

export interface RelayTransport { send(text: string): void; close(code?: number): void }

export interface RelayDeps {
  worker: SessionWorker;
  llm: VoiceLlm;
  broker: () => ToolBroker;
  profile: VoiceProfile;
  accountSid: () => string | undefined;
  consumeSessionRef: (claims: TokenClaims) => Promise<'consumed' | 'replay' | 'unknown_call'>;
  /** Does this callId's voice_calls row carry this CallSid (or none yet)? */
  callMatches: (callId: string, callSid: string) => Promise<boolean>;
  now: () => number;
  log: (line: Record<string, unknown>) => void;
}

export const MAX_TOOL_ROUNDS = 2;
export const MAX_HISTORY = 24;
export const MAX_MALFORMED = 10;
const SORRY = 'Sorry, I had trouble with that. Could you say it again?';
const SAFE_DECLINE = "I can't help with that one, but a teammate can follow up.";

export class RelayConnection {
  private handle: SessionHandle | null = null;
  private broker: ToolBroker | null = null;
  private callId: string | null = null;
  private history: VoiceMessage[] = [];
  private malformed = 0;
  private settingUp = false;
  private closed = false;

  constructor(private readonly t: RelayTransport, private readonly d: RelayDeps) {}

  /** Feed one raw frame. Never throws. */
  async onMessage(raw: string | Buffer): Promise<void> {
    if (this.closed) return; // nothing is processed after the socket was closed (by either side)
    const p = parseRelayMessage(raw);
    if (!p.ok) {
      this.log('warn', 'voice_relay_frame_rejected', { error_class: p.errorClass });
      if (++this.malformed >= MAX_MALFORMED) this.shutdown('too_many_malformed_frames', 1007);
      return;
    }
    const m = p.msg;
    if (!this.handle) {
      if (m.type === 'setup' && !this.settingUp) await this.setup(m);
      else if (m.type !== 'setup') this.shutdown('message_before_setup', 1008);
      return;
    }
    switch (m.type) {
      case 'prompt': if (m.last && m.voicePrompt.trim()) await this.callerTurn(m.voicePrompt); break;
      case 'dtmf': await this.callerTurn(`(The caller pressed ${m.digit} on the keypad.)`); break;
      case 'interrupt': this.interrupt(m.utteranceUntilInterrupt); break;
      case 'error': this.log('warn', 'voice_relay_provider_error', { error_class: 'RelayProviderError' }); break;
      default: break; // info, or a second setup: ignored
    }
  }

  /** The socket closed (caller hung up, network, Twilio ended). */
  onClose(): void {
    this.closed = true;
    this.handle?.close('socket_closed');
  }

  private async setup(m: Extract<RelayInbound, { type: 'setup' }>): Promise<void> {
    this.settingUp = true;
    const v = verifyToken(m.customParameters.ref, 'session', this.d.now());
    if (!v.ok) return this.shutdown(`session_ref_${v.reason}`, 1008);
    if (m.accountSid !== this.d.accountSid()) return this.shutdown('account_mismatch', 1008);
    try {
      const used = await this.d.consumeSessionRef(v.claims);
      if (used !== 'consumed') return this.shutdown(used === 'replay' ? 'session_ref_replayed' : 'unknown_call', 1008);
      if (!(await this.d.callMatches(v.claims.callId, m.callSid))) return this.shutdown('call_sid_mismatch', 1008);
    } catch (e) {
      this.log('error', 'voice_relay_setup_failed', { error_class: (e as { name?: string })?.name || 'DatabaseError' });
      return this.shutdown('setup_lookup_failed', 1011);
    }
    const opened = this.d.worker.open(v.claims.callId, this.d.profile.versionId);
    if (!opened.ok) return this.shutdown(`session_refused_${opened.reason}`, 1013);
    this.callId = v.claims.callId;
    this.handle = opened.handle;
    this.broker = this.d.broker();
    this.handle.dispatch({ type: 'connected' });
    this.handle.dispatch({ type: 'greeting_done' }); // Twilio speaks the TwiML welcomeGreeting itself
    this.history.push({ role: 'assistant', content: this.d.profile.greeting });
    this.handle.onEnd((reason) => {
      if (this.closed) return;
      this.t.send(endSession());
      this.log('info', 'voice_relay_end_sent', { reason });
    });
    this.log('info', 'voice_relay_session_started', { profile: this.d.profile.versionId });
  }

  private push(msg: VoiceMessage): void {
    this.history.push(msg);
    // Bounded context. Never start on a tool_result (it would orphan the tool_use it answers).
    while (this.history.length > MAX_HISTORY || (this.history[0]?.role === 'user' && Array.isArray(this.history[0].content))) this.history.shift();
    if (this.history[0]?.role === 'assistant') this.history.unshift({ role: 'user', content: '(call connected)' });
  }

  private async callerTurn(text: string): Promise<void> {
    const h = this.handle!;
    const r = h.dispatch({ type: 'caller_turn' });
    if (!r.ok) return;
    this.push({ role: 'user', content: text });
    await this.answer(h);
  }

  private interrupt(heard: string): void {
    const h = this.handle!;
    if (!h.dispatch({ type: 'interrupt' }).ok) return;
    // History keeps only what the caller actually heard of the canceled answer.
    const last = this.history[this.history.length - 1];
    if (last?.role === 'assistant' && typeof last.content === 'string') last.content = heard.trim() || '(interrupted)';
    else if (heard.trim()) this.push({ role: 'assistant', content: heard.trim() });
    h.dispatch({ type: 'interrupt_handled' });
  }

  /** One answer: up to MAX_TOOL_ROUNDS tool rounds, streamed, abandoned the moment it goes stale. */
  private async answer(h: SessionHandle): Promise<void> {
    const turnId = h.snapshot().turnId;
    const genId = h.snapshot().generationId + 1;
    const local = new AbortController();
    const signal = AbortSignal.any([h.generationSignal(), local.signal]);
    let started = false;
    let spoken = '';
    const start = (): boolean => {
      if (started) return h.accepts(turnId, genId);
      started = h.dispatch({ type: 'generation_started', generationId: genId }).ok;
      return started;
    };
    const say = (delta: string, last: boolean): boolean => {
      if (!start()) return false;
      this.t.send(textToken(delta, last));
      spoken += delta;
      if (!last && h.addChars(delta.length)) { local.abort(); this.t.send(textToken('', true)); }
      return true;
    };

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const r = await this.d.llm.streamTurn({
        system: this.d.profile.system, messages: this.history, tools: round < MAX_TOOL_ROUNDS ? this.broker!.defs() : [],
        signal, onText: (delta) => { if (!signal.aborted) say(delta, false); },
      });
      if (local.signal.aborted && started) return this.finishAnswer(h, genId, spoken); // length cut: close politely
      if (signal.aborted || (started && !h.accepts(turnId, genId))) return; // interrupted or superseded: never resumes
      if (!r.ok) {
        this.log('warn', 'voice_llm_turn_failed', { error_class: r.errorClass });
        say(SORRY, true);
        return this.finishAnswer(h, genId, spoken);
      }
      if (r.stopReason === 'refusal') { say(SAFE_DECLINE, true); return this.finishAnswer(h, genId, spoken); }
      if (r.stopReason !== 'tool_use' || r.toolCalls.length === 0) { say('', true); return this.finishAnswer(h, genId, spoken); }
      this.push({ role: 'assistant', content: r.assistantContent });
      spoken = ''; // already in history inside assistantContent; do not add it twice
      const results = await Promise.all(r.toolCalls.map(async (c) => {
        h.toolStarted(c.id, c.name);
        const out = await this.broker!.run(c.id, c.name, c.input);
        h.toolFinished(c.id, out.committed);
        if (out.errorClass) this.log('warn', 'voice_tool_failed', { tool: c.name, error_class: out.errorClass });
        return { type: 'tool_result' as const, tool_use_id: c.id, content: out.content, is_error: out.isError };
      }));
      this.push({ role: 'user', content: results });
      if (signal.aborted || (started && !h.accepts(turnId, genId))) return;
    }
    say(SORRY, true);
    this.finishAnswer(h, genId, spoken);
  }

  private finishAnswer(h: SessionHandle, genId: number, spoken: string): void {
    if (spoken.trim()) this.push({ role: 'assistant', content: spoken.trim() });
    h.dispatch({ type: 'generation_done', generationId: genId });
  }

  private shutdown(reason: string, code: number): void {
    this.log(code === 1000 ? 'info' : 'warn', 'voice_relay_closed_by_server', { reason, error_class: code === 1000 ? undefined : 'RelaySessionRejected' });
    this.closed = true;
    this.handle?.close(reason);
    this.t.close(code);
  }

  private log(level: string, event: string, extra: Record<string, unknown>): void {
    this.d.log({ level, service: 'voice-studio', event, call_id: this.callId, outcome: level === 'info' ? 'success' : 'failure', ...extra });
  }
}
