/**
 * Engine B bridge (VS2.4): one Twilio Media Stream (bidirectional <Connect><Stream>) <-> one OpenAI
 * Realtime session. Audio is mu-law 8 kHz both ways and passes through unchanged (audio/pcmu).
 *
 * Setup: the start message's single-use session ref, our account and the CallSid must check out
 * before a session or a model connection exists (same rules as Engine A). The model connection is
 * opened right away; caller audio that arrives first waits in a BOUNDED prebuffer (oldest dropped).
 *
 * Playback truth comes from Twilio marks: after every audio chunk we send a mark named
 * "<item_id>|<ms sent so far>"; Twilio echoes it when that audio has PLAYED. On barge-in
 * (input_audio_buffer.speech_started) the bridge clears Twilio's buffer, truncates the assistant item
 * at the last PLAYED millisecond (never at what was merely sent), and cancels the response. Marks
 * Twilio returns because of the clear arrive after the truncation was already computed, and that
 * item is never truncated again (the next answer is a new item), so they cannot inflate it.
 *
 * Staleness mirrors Engine A: audio is forwarded only from the current response while the session
 * accepts its (turn, generation). Tool calls go through the broker; every call gets its
 * function_call_output (so the model's conversation stays valid), but a follow-up answer is only
 * requested while that answer is still current.
 *
 * Never logged: audio, transcripts, phone numbers.
 */
import type { SessionHandle, SessionWorker } from '../../session/sessionWorker';
import type { TokenClaims } from '../../twilio/correlationToken';
import { verifyToken } from '../../twilio/correlationToken';
import type { ToolBroker } from '../toolBroker';
import type { VoiceProfile } from '../voiceProfiles';
import { mulawBase64DurationMs } from './mulaw';
import { appendAudio, functionOutput, parseRealtimeEvent, responseCancel, responseCreate, sessionUpdate, truncateItem, userText, type RealtimeServerEvent } from './realtimeProtocol';
import { clearOut, markOut, mediaOut, parseStreamMessage, type StreamInbound } from './streamProtocol';

export interface SocketLike { send(text: string): void; close(code?: number): void }
export interface ModelHandlers { onMessage(raw: string | Buffer): void; onClose(reason: string): void }

export interface RealtimeDeps {
  worker: SessionWorker;
  broker: () => ToolBroker;
  profile: VoiceProfile;
  voice?: string;
  accountSid: () => string | undefined;
  consumeSessionRef: (claims: TokenClaims) => Promise<'consumed' | 'replay' | 'unknown_call'>;
  callMatches: (callId: string, callSid: string) => Promise<boolean>;
  connectModel: (h: ModelHandlers) => SocketLike;
  /** VS4.3: false while the provider's circuit is open. The call is refused before a session exists. */
  modelAvailable?: () => boolean;
  now: () => number;
  log: (line: Record<string, unknown>) => void;
}

export const MAX_PREBUFFER_FRAMES = 150; // ~3 s of 20 ms frames
export const MAX_MALFORMED_FRAMES = 10;
/** Follow-up answers after tool calls, per caller turn and per call (VS4.2: a caller must not be able to loop paid answers). */
export const MAX_TOOL_FOLLOW_UPS_PER_TURN = 3;
export const MAX_TOOL_CALLS_PER_CALL = 20;
const MAX_TRACKED_ITEMS = 50;
/** The answer is over. 'incomplete' = cut by the length limit; 'cancelled' is ours and handled where we cancel. */
const ENDED: ReadonlySet<string> = new Set(['completed', 'incomplete', 'failed']);

export class RealtimeBridge {
  private handle: SessionHandle | null = null;
  private broker: ToolBroker | null = null;
  private model: SocketLike | null = null;
  private callId: string | null = null;
  private streamSid = '';
  private ready = false;
  private prebuffer: string[] = [];
  private dropped = 0;
  private malformed = 0;
  private closed = false;
  private settingUp = false;
  // Response and playback tracking
  private greetingResponse: string | null = null;
  private greetingRequested = false;
  private current: { id: string; turnId: number; genId: number; active: boolean } | null = null;
  private followUpOf: { turnId: number; genId: number } | null = null;
  private followUps = { turnId: -1, n: 0 };
  private toolCalls = 0;
  private currentItem: string | null = null;
  private readonly sentMs = new Map<string, number>();
  private readonly playedMs = new Map<string, number>();
  /** Function-call ids already handled: a redelivered call is ignored (the tool ran and was recorded once). */
  private readonly handledCalls = new Set<string>();
  /** Tool calls still running, per response id: that response's response.done does not end the answer. */
  private readonly toolsInFlight = new Map<string, number>();

  constructor(private readonly twilio: SocketLike, private readonly d: RealtimeDeps) {}

  /** A verified call is attached (the single-use reference was accepted). */
  get established(): boolean { return this.handle !== null; }

  // ---------------- Twilio side ----------------
  async onTwilio(raw: string | Buffer): Promise<void> {
    if (this.closed) return;
    const p = parseStreamMessage(raw);
    if (!p.ok) {
      this.log('warn', 'voice_stream_frame_rejected', { error_class: p.errorClass });
      if (++this.malformed >= MAX_MALFORMED_FRAMES) this.shutdown('too_many_malformed_frames', 1007);
      return;
    }
    const m = p.msg;
    if (!this.handle) {
      if (m.event === 'start' && !this.settingUp) await this.start(m);
      else if (this.settingUp) {
        // Twilio streams audio from the moment it connects, so frames arrive while the session reference
        // is still being checked: keep them (VS4.1; they used to end the call).
        if (m.event === 'media') this.callerAudio(m.media.payload);
        else if (m.event === 'stop') this.teardown('twilio_stop');
      } else if (m.event !== 'connected' && m.event !== 'start') this.shutdown('message_before_start', 1008);
      return;
    }
    switch (m.event) {
      case 'media': this.callerAudio(m.media.payload); break;
      case 'mark': this.markPlayed(m.mark.name); break;
      case 'dtmf': this.keypad(m.dtmf.digit); break;
      case 'stop': this.teardown('twilio_stop'); break;
      default: break;
    }
  }

  onTwilioClose(): void { this.teardown('twilio_socket_closed'); }

  private async start(m: Extract<StreamInbound, { event: 'start' }>): Promise<void> {
    this.settingUp = true;
    const s = m.start;
    const v = verifyToken(s.customParameters.ref, 'session', this.d.now());
    if (!v.ok) return this.shutdown(`session_ref_${v.reason}`, 1008);
    if (s.accountSid !== this.d.accountSid()) return this.shutdown('account_mismatch', 1008);
    try {
      const used = await this.d.consumeSessionRef(v.claims);
      if (used !== 'consumed') return this.shutdown(used === 'replay' ? 'session_ref_replayed' : 'unknown_call', 1008);
      if (!(await this.d.callMatches(v.claims.callId, s.callSid))) return this.shutdown('call_sid_mismatch', 1008);
    } catch (e) {
      this.log('error', 'voice_stream_setup_failed', { error_class: (e as { name?: string })?.name || 'DatabaseError' });
      return this.shutdown('setup_lookup_failed', 1011);
    }
    if (this.closed) return; // the caller hung up while we were checking (VS4.1): open nothing, least of all a paid model connection
    if (this.d.modelAvailable && !this.d.modelAvailable()) return this.shutdown('model_unavailable', 1013);
    const opened = this.d.worker.open(v.claims.callId, this.d.profile.versionId);
    if (!opened.ok) return this.shutdown(`session_refused_${opened.reason}`, 1013);
    this.callId = v.claims.callId;
    this.streamSid = m.streamSid;
    this.handle = opened.handle;
    this.broker = this.d.broker();
    this.handle.onEnd((reason) => this.teardown(`session_${reason}`));
    try {
      this.model = this.d.connectModel({ onMessage: (raw) => { this.onModel(raw).catch((e: Error) => { this.log('error', 'voice_realtime_handler_failed', { error_class: e?.name || 'HandlerError' }); this.teardown('handler_failed'); }); }, onClose: (reason) => this.onModelClose(reason) });
    } catch (e) {
      this.log('error', 'voice_realtime_connect_failed', { error_class: (e as { name?: string })?.name || 'ConnectError' });
      return this.teardown('model_unavailable');
    }
    this.model.send(sessionUpdate({ instructions: this.d.profile.system, voice: this.d.voice, tools: this.broker.defs() }));
    this.log('info', 'voice_stream_session_started', { profile: this.d.profile.versionId });
  }

  private callerAudio(payload: string): void {
    if (this.ready && this.model) { this.model.send(appendAudio(payload)); return; }
    this.prebuffer.push(payload);
    if (this.prebuffer.length > MAX_PREBUFFER_FRAMES) {
      this.prebuffer.shift();
      if (this.dropped++ === 0) this.log('warn', 'voice_stream_prebuffer_overflow', { error_class: 'PrebufferOverflow' });
    }
  }

  private markPlayed(name: string): void {
    const sep = name.lastIndexOf('|');
    if (sep < 0) return;
    const item = name.slice(0, sep);
    const ms = Number(name.slice(sep + 1));
    const sent = this.sentMs.get(item);
    if (!Number.isFinite(ms) || sent === undefined) return; // only audio we sent can have been played
    this.playedMs.set(item, Math.max(this.playedMs.get(item) ?? 0, Math.min(ms, sent)));
  }

  private keypad(digit: string): void {
    if (!this.ready || !this.model) return;
    this.newCallerTurn();
    this.model.send(userText(`(The caller pressed ${digit} on the keypad.)`));
    this.model.send(responseCreate());
  }

  // ---------------- Model side ----------------
  private async onModel(raw: string | Buffer): Promise<void> {
    if (this.closed || !this.handle) return;
    const p = parseRealtimeEvent(raw);
    if (!p.ok) { this.log('warn', 'voice_realtime_event_rejected', { error_class: p.errorClass }); return; }
    if (!p.ev) return;
    await this.handleModelEvent(p.ev);
  }

  private async handleModelEvent(ev: RealtimeServerEvent): Promise<void> {
    const h = this.handle!;
    switch (ev.type) {
      case 'session.updated': {
        if (this.ready) return;
        this.ready = true;
        for (const f of this.prebuffer.splice(0)) this.model!.send(appendAudio(f));
        h.dispatch({ type: 'connected' });
        this.greetingRequested = true;
        this.model!.send(responseCreate(`Greet the caller with exactly these words and nothing else: "${this.d.profile.greeting}"`));
        return;
      }
      case 'input_audio_buffer.speech_started': this.bargeIn(); return;
      case 'response.created': this.responseStarted(ev.response.id); return;
      case 'response.output_audio.delta': this.audioOut(ev.response_id, ev.item_id, ev.delta); return;
      case 'response.function_call_arguments.done': await this.toolCall(ev.call_id, ev.name, ev.arguments, ev.response_id); return;
      case 'response.done': this.responseDone(ev.response.id, ev.response.status); return;
      case 'error': this.log('warn', 'voice_realtime_error', { error_class: `Realtime_${ev.error.type ?? 'error'}`, code: ev.error.code ?? null }); return;
      default: return;
    }
  }

  private responseStarted(id: string): void {
    const h = this.handle!;
    if (this.greetingRequested && !this.greetingResponse) { this.greetingResponse = id; this.current = { id, turnId: h.snapshot().turnId, genId: 0, active: true }; return; }
    if (this.followUpOf) { this.current = { id, ...this.followUpOf, active: true }; this.followUpOf = null; return; }
    if (h.snapshot().state === 'listening') h.dispatch({ type: 'caller_turn' }); // VAD answered without our speech_started (or after a thinking timeout)
    const genId = h.snapshot().generationId + 1;
    const r = h.dispatch({ type: 'generation_started', generationId: genId });
    if (!r.ok) { this.model?.send(responseCancel(id)); return; }
    this.current = { id, turnId: h.snapshot().turnId, genId, active: true };
  }

  private isCurrent(responseId: string): boolean {
    const c = this.current;
    if (!c || c.id !== responseId) return false;
    if (responseId === this.greetingResponse) return this.handle!.snapshot().state === 'greeting' || this.handle!.snapshot().state === 'connecting';
    return this.handle!.accepts(c.turnId, c.genId);
  }

  private audioOut(responseId: string, itemId: string, delta: string): void {
    if (!this.isCurrent(responseId)) return; // stale: a canceled or superseded answer is never played
    this.currentItem = itemId;
    const total = (this.sentMs.get(itemId) ?? 0) + mulawBase64DurationMs(delta);
    this.sentMs.set(itemId, total);
    if (this.sentMs.size > MAX_TRACKED_ITEMS) { const k = this.sentMs.keys().next().value as string; this.sentMs.delete(k); this.playedMs.delete(k); }
    this.twilio.send(mediaOut(this.streamSid, delta));
    this.twilio.send(markOut(this.streamSid, `${itemId}|${total}`));
  }

  /** The caller started talking. Stop what is playing, keep only what was heard, cancel the answer. */
  private bargeIn(): void {
    const item = this.currentItem;
    const audible = item !== null && (this.sentMs.get(item) ?? 0) > (this.playedMs.get(item) ?? 0);
    if (audible && item) {
      this.twilio.send(clearOut(this.streamSid));
      this.model!.send(truncateItem(item, this.playedMs.get(item) ?? 0));
    }
    if (this.current?.active) this.model!.send(responseCancel(this.current.id));
    this.newCallerTurn();
  }

  private newCallerTurn(): void {
    const h = this.handle!;
    const st = h.snapshot().state;
    if (st === 'speaking' || st === 'thinking' || st === 'greeting') { h.dispatch({ type: 'interrupt' }); h.dispatch({ type: 'interrupt_handled' }); }
    else if (st === 'connecting') { h.dispatch({ type: 'connected' }); h.dispatch({ type: 'interrupt' }); h.dispatch({ type: 'interrupt_handled' }); }
    if (this.current) this.current.active = false;
    this.followUpOf = null;
    this.currentItem = null;
    h.dispatch({ type: 'caller_turn' });
  }

  private async toolCall(callId: string, name: string, args: string, responseId?: string): Promise<void> {
    const h = this.handle!;
    if (this.handledCalls.has(callId)) { this.log('warn', 'voice_tool_call_duplicate', { error_class: 'DuplicateToolCall', tool: name }); return; }
    if (this.handledCalls.size >= 200) this.handledCalls.delete(this.handledCalls.values().next().value as string);
    this.handledCalls.add(callId);
    const owner = this.current && (!responseId || this.current.id === responseId) ? { turnId: this.current.turnId, genId: this.current.genId } : null;
    // Registered SYNCHRONOUSLY, before the tool's I/O: on the real wire the response that made this
    // call reports response.done (completed) long before a calendar lookup returns. Without this the
    // answer was marked done, the session went back to listening, and the follow-up answer was never
    // requested: the caller heard silence (verifier attempt 1).
    const key = responseId ?? this.current?.id ?? '';
    this.toolsInFlight.set(key, (this.toolsInFlight.get(key) ?? 0) + 1);
    let input: unknown = {};
    try { input = args ? JSON.parse(args) : {}; } catch { input = { __unparseable: true }; } // the broker's schema rejects it with a speakable error
    h.toolStarted(callId, name);
    const out = ++this.toolCalls > MAX_TOOL_CALLS_PER_CALL
      ? { content: 'No more lookups are available on this call. Offer to have a teammate follow up.', isError: true, committed: false, errorClass: 'ToolLimitReached' }
      : await this.broker!.run(callId, name, input);
    const left = (this.toolsInFlight.get(key) ?? 1) - 1;
    if (left > 0) this.toolsInFlight.set(key, left); else this.toolsInFlight.delete(key);
    h.toolFinished(callId, out.committed, out.errorClass);
    if (out.errorClass) this.log('warn', 'voice_tool_failed', { tool: name, error_class: out.errorClass });
    if (this.closed || !this.model) return;
    this.model.send(functionOutput(callId, out.content)); // always: an unanswered call would corrupt the model's conversation
    // One follow-up per response, after its LAST tool call returns, and only while the answer is current.
    if (left > 0 || !owner || !h.accepts(owner.turnId, owner.genId)) return;
    if (this.followUps.turnId !== owner.turnId) this.followUps = { turnId: owner.turnId, n: 0 };
    if (++this.followUps.n > MAX_TOOL_FOLLOW_UPS_PER_TURN) {
      this.log('warn', 'voice_tool_follow_up_limit', { error_class: 'ToolLimitReached', tool: name });
      // Back to listening. If the response is still open, its own response.done does this.
      if (!this.current?.active) h.dispatch({ type: 'generation_done', generationId: owner.genId });
      return;
    }
    this.followUpOf = owner;
    this.model.send(responseCreate());
  }

  private responseDone(id: string, status?: string): void {
    const h = this.handle!;
    if (this.current?.id === id) this.current.active = false;
    if (id === this.greetingResponse) {
      if (h.snapshot().state === 'connecting') h.dispatch({ type: 'connected' });
      if (h.snapshot().state === 'greeting') h.dispatch({ type: 'greeting_done' });
      return;
    }
    // A response that made a tool call is not the end of the answer: its follow-up continues it.
    if (this.followUpOf || this.toolsInFlight.has(id) || !ENDED.has(status ?? '') || this.current?.id !== id) return;
    h.dispatch({ type: 'generation_done', generationId: this.current.genId });
  }

  private onModelClose(reason: string): void {
    if (this.closed) return;
    this.log('warn', 'voice_realtime_disconnected', { error_class: 'RealtimeDisconnected', reason });
    this.teardown('model_disconnected');
  }

  // ---------------- Lifecycle ----------------
  private teardown(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    try { this.model?.close(1000); } finally {
      this.twilio.close(1000); // ends <Connect><Stream>; with no further TwiML the call ends
      this.handle?.close(reason);
      this.prebuffer = [];
      this.log('info', 'voice_stream_closed', { reason });
    }
  }

  private shutdown(reason: string, code: number): void {
    this.log('warn', 'voice_stream_closed_by_server', { reason, error_class: 'StreamSessionRejected' });
    this.closed = true;
    this.handle?.close(reason);
    this.model?.close(1000);
    this.twilio.close(code);
  }

  private log(level: string, event: string, extra: Record<string, unknown>): void {
    this.d.log({ level, service: 'voice-studio', event, call_id: this.callId, outcome: level === 'info' ? 'success' : 'failure', ...extra });
  }
}
