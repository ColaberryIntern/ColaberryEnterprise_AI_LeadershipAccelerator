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
import { endSession, languageSwitch, parseRelayMessage, SUPPORTED_LANGUAGES, textToken, type RelayInbound } from './relayProtocol';
import type { ToolBroker } from './toolBroker';
import type { VoiceProfile } from './voiceProfiles';
import { TRANSFER_REASON } from '../transfer/humanTransfer';

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
  /**
   * VS3.2: called ONCE when the session ends, with the plain-text transcript (what the caller said
   * and what the agent actually spoke, cut at interruptions). Post-call stores it on the call's
   * communication log. Never logged.
   */
  onTranscript?: (callId: string, transcript: string) => void;
}

export const MAX_TRANSCRIPT_LINES = 400;

export const MAX_TOOL_ROUNDS = 2;
export const MAX_HISTORY = 24;
export const MAX_MALFORMED = 10;
/** Messages that arrive while the session reference is still being checked wait here (VS4.1). */
export const MAX_EARLY_MESSAGES = 20;
const SORRY = 'Sorry, I had trouble with that. Could you say it again?';
const SAFE_DECLINE = "I can't help with that one, but a teammate can follow up.";

export class RelayConnection {
  private handle: SessionHandle | null = null;
  private broker: ToolBroker | null = null;
  private callId: string | null = null;
  private history: VoiceMessage[] = [];
  private malformed = 0;
  private settingUp = false;
  private early: RelayInbound[] = [];
  private closed = false;
  private lang: string | null = null;
  private readonly transcript: string[] = [];
  private transcriptSent = false;
  /** VS3.2: a transfer_to_human tool returned the transfer control in the current answer. */
  private pendingTransfer = false;
  private handedOff = false;
  /** What the agent said in the current answer, for the transcript (spoken resets per tool round). */
  private turnSaid = '';

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
      else if (m.type !== 'setup' && this.settingUp) { if (this.early.length < MAX_EARLY_MESSAGES) this.early.push(m); }
      else if (m.type !== 'setup') this.shutdown('message_before_setup', 1008);
      return;
    }
    await this.live(m);
  }

  private async live(m: RelayInbound): Promise<void> {
    if (this.closed) return;
    switch (m.type) {
      case 'prompt':
        if (m.last && m.voicePrompt.trim()) {
          this.switchLanguage(m.lang);
          await this.callerTurn(m.voicePrompt);
        }
        break;
      case 'dtmf': await this.callerTurn(`(The caller pressed ${m.digit} on the keypad.)`); break;
      case 'interrupt': this.interrupt(m.utteranceUntilInterrupt); break;
      case 'error': this.log('warn', 'voice_relay_provider_error', { error_class: 'RelayProviderError' }); break;
      default: break; // info, or a second setup: ignored
    }
  }

  /** The caller is speaking a different supported language: switch Relay's recognition and voice once. */
  private switchLanguage(lang: string | undefined): void {
    const current = this.lang ?? this.d.profile.language;
    if (!lang || lang === current || !SUPPORTED_LANGUAGES.has(lang)) return;
    this.lang = lang;
    this.t.send(languageSwitch(lang));
    this.log('info', 'voice_relay_language_switched', { lang });
  }

  /** The socket closed (caller hung up, network, Twilio ended). */
  onClose(): void {
    this.closed = true;
    this.handle?.close('socket_closed');
    this.emitTranscript();
  }

  private line(speaker: 'Agent' | 'Caller', text: string): void {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t && this.transcript.length < MAX_TRANSCRIPT_LINES) this.transcript.push(`${speaker}: ${t}`);
  }

  /** Hand the transcript over once, however the session ended. */
  private emitTranscript(): void {
    if (this.transcriptSent || !this.callId || !this.d.onTranscript) return;
    this.transcriptSent = true;
    try { this.d.onTranscript(this.callId, this.transcript.join('\n')); } catch (e) {
      this.log('warn', 'voice_relay_transcript_sink_failed', { error_class: (e as { name?: string })?.name || 'SinkError' });
    }
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
    if (this.closed) return; // the caller hung up while we were checking (VS4.1): open nothing
    const opened = this.d.worker.open(v.claims.callId, this.d.profile.versionId);
    if (!opened.ok) return this.shutdown(`session_refused_${opened.reason}`, 1013);
    this.callId = v.claims.callId;
    this.handle = opened.handle;
    this.broker = this.d.broker();
    this.handle.dispatch({ type: 'connected' });
    this.handle.dispatch({ type: 'greeting_done' }); // Twilio speaks the TwiML welcomeGreeting itself
    this.history.push({ role: 'assistant', content: this.d.profile.greeting });
    this.line('Agent', this.d.profile.greeting);
    this.handle.onEnd((reason) => {
      this.emitTranscript();
      if (this.closed || this.handedOff) return; // a transfer already sent its own end
      this.t.send(endSession());
      this.log('info', 'voice_relay_end_sent', { reason });
    });
    this.log('info', 'voice_relay_session_started', { profile: this.d.profile.versionId });
    // Started in arrival order, not awaited one by one: a later interrupt must be able to cut an earlier answer.
    await Promise.all(this.early.splice(0).map((e) => this.live(e)));
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
    this.line('Caller', text);
    await this.answer(h);
  }

  /**
   * The caller talked over the agent. Usually the model finished streaming long before Twilio
   * finished SPEAKING it, so the session is already back in listening: there is nothing to cancel,
   * but history must still be cut back to what the caller actually heard (regression caught by a
   * mutation test). When an answer is still in flight, cancel it too.
   */
  private interrupt(heard: string): void {
    const h = this.handle!;
    const state = h.snapshot().state;
    if (state === 'speaking' || state === 'thinking' || state === 'greeting' || state === 'interrupted') {
      h.dispatch({ type: 'interrupt' });
      h.dispatch({ type: 'interrupt_handled' });
    }
    const said = heard.trim();
    const last = this.history[this.history.length - 1];
    if (last?.role === 'assistant' && typeof last.content === 'string') last.content = said || '(interrupted)';
    else if (said) this.push({ role: 'assistant', content: said });
    // The transcript keeps only what the caller heard, like the history.
    const tail = this.transcript[this.transcript.length - 1];
    if (tail?.startsWith('Agent: ')) {
      if (said) this.transcript[this.transcript.length - 1] = `Agent: ${said.replace(/\s+/g, ' ')} (interrupted)`;
      else this.transcript.pop();
    } else if (said) this.line('Agent', `${said} (interrupted)`);
  }

  /** One answer: up to MAX_TOOL_ROUNDS tool rounds, streamed, abandoned the moment it goes stale. */
  private async answer(h: SessionHandle): Promise<void> {
    const turnId = h.snapshot().turnId;
    const genId = h.snapshot().generationId + 1;
    const local = new AbortController();
    const signal = AbortSignal.any([h.generationSignal(), local.signal]);
    let started = false;
    let spoken = '';
    this.turnSaid = ''; // everything said this answer, across tool rounds (spoken resets per round)
    const start = (): boolean => {
      if (started) return h.accepts(turnId, genId);
      started = h.dispatch({ type: 'generation_started', generationId: genId }).ok;
      return started;
    };
    const say = (delta: string, last: boolean): boolean => {
      if (!start()) return false;
      this.t.send(textToken(delta, last));
      spoken += delta;
      this.turnSaid += delta;
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
      const results = await Promise.all(r.toolCalls.map(async (c) => {
        h.toolStarted(c.id, c.name);
        const out = await this.broker!.run(c.id, c.name, c.input);
        h.toolFinished(c.id, out.committed, out.errorClass);
        if (out.errorClass) this.log('warn', 'voice_tool_failed', { tool: c.name, error_class: out.errorClass });
        return { type: 'tool_result' as const, tool_use_id: c.id, content: out.content, is_error: out.isError, control: out.control };
      }));
      // The tool round enters history ATOMICALLY and only if this answer is still current. While the
      // tool ran, the caller may have spoken (a new turn) or interrupted: their message is already in
      // history, and a tool_use separated from its tool_result is a 400 from the API on every later
      // turn (verifier attempt 1). A stale round is dropped; the tool run itself was still recorded.
      if (signal.aborted || (started && !h.accepts(turnId, genId))) return;
      if (results.some((x) => x.control === 'transfer')) this.pendingTransfer = true;
      this.push({ role: 'assistant', content: r.assistantContent });
      this.push({ role: 'user', content: results.map(({ control: _c, ...rest }) => rest) });
      spoken = ''; // already in history inside assistantContent; do not add it twice
    }
    say(SORRY, true);
    this.finishAnswer(h, genId, spoken);
  }

  private finishAnswer(h: SessionHandle, genId: number, spoken: string): void {
    if (spoken.trim()) this.push({ role: 'assistant', content: spoken.trim() });
    this.line('Agent', this.turnSaid);
    this.turnSaid = '';
    h.dispatch({ type: 'generation_done', generationId: genId });
    if (this.pendingTransfer && !this.handedOff) {
      // Hand the call to a person: Twilio finishes speaking, then requests our <Connect action> URL.
      this.handedOff = true;
      this.t.send(endSession(JSON.stringify({ reason: TRANSFER_REASON })));
      this.log('info', 'voice_relay_handoff_sent', { reason: TRANSFER_REASON });
      h.close('transfer_to_human');
    }
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
