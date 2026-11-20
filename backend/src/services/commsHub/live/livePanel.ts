import { sequelize } from '../../../config/database';
import CommsHubEvent from '../../../models/CommsHubEvent';
import { runProducerCommand } from '../../broadcast/broadcastCommandService';
import { resolveLiveInput } from '../../broadcast/broadcastInputBinding';
import { describeProducerCommands, type CommandAvailability, type ProducerCommand } from '../../broadcast/broadcastStateMachine';
import { readCloudflareStreamConfig, readLiveInput } from '../../broadcast/providers/cloudflareStreamProvider';
import { logActivity, type Actor } from '../activityLog';
import { expandOccurrences } from '../eventRecurrence';
import { ensureOccurrenceForCommunityEvent, LiveRefusedError } from './eventOccurrence';

/**
 * The event editor's Live panel (CH5.2): Prepare stream, the Zoom push details, Go live, End.
 * It calls the broadcast services directly (admins are not routed through the portal's staff
 * check) and leaves every state rule to the broadcast state machine; this file adds only the
 * Communications Hub's own rules:
 * - ONE LIVE AT A TIME. Every hub stream uses the one shared Cloudflare live input. The per-room
 *   active index does not cover occurrences without a room, so the guard is on the input itself:
 *   an occurrence of ANY source that is backstage, live or reconnecting on the same input holds
 *   it, and Prepare / Go live are refused naming that event.
 * - "Prepare stream" creates the date's occurrence (CH5.1) and opens backstage, because provider
 *   health is only observed for backstage/live/reconnecting occurrences (broadcastHealthLoop).
 * - "Go live" sends mark_content_started then go_live: the state machine requires both, and
 *   refuses go_live until the provider reports the stream ready.
 * - The event follows the broadcast: live while live; when it ends, a series goes back to
 *   scheduled if it has dates left, a one-off becomes ended.
 * The stream key is fetched server-side on request, returned only to comms_hub holders, and never
 * logged or stored.
 */
export class LivePanelError extends Error {
  constructor(message: string, public readonly status: number, public readonly reason: string) { super(message); }
}

const ACTIVE = ['backstage', 'live', 'reconnecting'];
export const PANEL_COMMANDS: ProducerCommand[] = ['enter_backstage', 'return_to_scheduled', 'go_live', 'end'];

export interface PanelOccurrence {
  id: string; editorial_state: string; provider_health: string; version: number;
  scheduled_start_at: string | null; content_started_at: string | null; ended_at: string | null;
}
export interface LivePanelView {
  input_configured: boolean;
  occurrence: PanelOccurrence | null;
  commands: CommandAvailability[];
  /** Another broadcast holding the shared input right now (its title), or null. */
  input_held_by: { occurrence_id: string; title: string; state: string } | null;
}

interface Row { id: string; editorial_state: string; provider_health: string; version: number | string; scheduled_start_at: Date | null; content_started_at: Date | null; ended_at: Date | null; end_reason: string | null }

const iso = (d: Date | string | null): string | null => (d ? new Date(d).toISOString() : null);

async function readOccurrence(id: string | null): Promise<Row | null> {
  if (!id) return null;
  const [rows] = await sequelize.query(
    `SELECT id, editorial_state, provider_health, version, scheduled_start_at, content_started_at, ended_at, end_reason
       FROM broadcast_occurrences WHERE id = :id`,
    { replacements: { id } },
  );
  return (rows as Row[])[0] ?? null;
}

/** Another occurrence (any source) on the shared input that is backstage, live or reconnecting. */
export async function inputHolder(exceptId: string | null): Promise<LivePanelView['input_held_by']> {
  const binding = resolveLiveInput();
  if (!binding.bound) return null;
  const [rows] = await sequelize.query(
    `SELECT id, title, editorial_state FROM broadcast_occurrences
      WHERE provider_session_id = :uid AND editorial_state IN (:active) AND (CAST(:except AS uuid) IS NULL OR id <> CAST(:except AS uuid))
      ORDER BY updated_at DESC LIMIT 1`,
    { replacements: { uid: binding.providerSessionId, active: ACTIVE, except: exceptId } },
  );
  const r = (rows as Array<{ id: string; title: string; editorial_state: string }>)[0];
  return r ? { occurrence_id: r.id, title: r.title, state: r.editorial_state } : null;
}

async function eventOr404(eventId: string): Promise<CommsHubEvent> {
  const e = await CommsHubEvent.findByPk(eventId);
  if (!e) throw new LivePanelError('That event was not found.', 404, 'not_found');
  return e;
}

export async function readLivePanel(eventId: string, nowMs: number = Date.now()): Promise<LivePanelView> {
  const e = await eventOr404(eventId);
  const row = await readOccurrence(e.broadcast_occurrence_id);
  const occurrence: PanelOccurrence | null = row ? {
    id: row.id, editorial_state: row.editorial_state, provider_health: row.provider_health, version: Number(row.version),
    scheduled_start_at: iso(row.scheduled_start_at), content_started_at: iso(row.content_started_at), ended_at: iso(row.ended_at),
  } : null;
  const commands = row
    ? describeProducerCommands({
      editorial_state: row.editorial_state as never, provider_health: row.provider_health as never, version: Number(row.version),
      content_started_at: row.content_started_at, ended_at: row.ended_at, end_reason: row.end_reason as never,
    }, nowMs).filter((c) => PANEL_COMMANDS.includes(c.command))
    : [];
  return { input_configured: resolveLiveInput().bound, occurrence, commands, input_held_by: await inputHolder(row?.id ?? null) };
}

function busy(holder: NonNullable<LivePanelView['input_held_by']>): LivePanelError {
  return new LivePanelError(`"${holder.title}" is ${holder.state === 'backstage' ? 'getting ready to stream' : 'live'} on the stream right now. Only one event can use it at a time; end that one first.`, 409, 'input_busy');
}

const NOT_READY = (): LivePanelError => new LivePanelError('The stream from Zoom is not reaching Cloudflare yet. Start streaming in Zoom with the details above, wait for "Stream ready", then Go live.', 409, 'not_ready');

async function command(occurrenceId: string, cmd: ProducerCommand, expectedVersion: number): Promise<{ version: number; noop: boolean; state: string }> {
  const r = await runProducerCommand({ occurrenceId, command: cmd, expectedVersion, isProducer: true });
  if (!r.ok) {
    if (r.error_class === 'ProviderNotReady') throw NOT_READY();
    if (r.error_class === 'VersionConflict') throw new LivePanelError('This changed in another window. The panel has been refreshed; try again.', 409, 'version_conflict');
    throw new LivePanelError(`That cannot be done now (${r.reason ?? r.error_class ?? 'refused'}).`, r.status ?? 409, r.error_class ?? 'refused');
  }
  return { version: Number(r.occurrence!.version), noop: r.noop === true, state: r.occurrence!.editorial_state };
}

/** Prepare stream: the date's occurrence, then backstage (so the provider's health is watched). */
export async function prepareLive(eventId: string, at: Date | null, actor: Actor, now: Date = new Date()): Promise<LivePanelView> {
  const e = await eventOr404(eventId);
  try {
    const ensured = await ensureOccurrenceForCommunityEvent(e, at, now);
    const holder = await inputHolder(ensured.occurrenceId);
    if (holder) throw busy(holder);
    const row = await readOccurrence(ensured.occurrenceId);
    if (row && row.editorial_state === 'scheduled') await command(row.id, 'enter_backstage', Number(row.version));
    await logActivity(actor, 'live.prepared', 'broadcast', ensured.occurrenceId, { event_id: e.id, starts_at: ensured.startsAt.toISOString(), outcome: ensured.outcome, access_mode: ensured.accessMode });
  } catch (err) {
    if (err instanceof LiveRefusedError) throw new LivePanelError(err.message, 409, err.reason);
    throw err;
  }
  return readLivePanel(e.id, now.getTime());
}

/** Whether the series has a date after this occurrence. */
function hasLaterDate(e: CommsHubEvent, afterMs: number): boolean {
  return expandOccurrences(e.starts_at, e.ends_at, e.repeat_rule).some((o) => o.starts_at.getTime() > afterMs);
}

/** Go live, End, or back to scheduled, on the event's occurrence; the event's status follows. */
export async function runLiveCommand(eventId: string, cmd: 'go_live' | 'end' | 'return_to_scheduled', expectedVersion: number, actor: Actor, now: Date = new Date()): Promise<LivePanelView> {
  const e = await eventOr404(eventId);
  const row = await readOccurrence(e.broadcast_occurrence_id);
  if (!row) throw new LivePanelError('Prepare the stream first.', 409, 'not_prepared');
  if (Number(row.version) !== expectedVersion) throw new LivePanelError('This changed in another window. The panel has been refreshed; try again.', 409, 'version_conflict');
  if (cmd === 'go_live') {
    const holder = await inputHolder(row.id);
    if (holder) throw busy(holder);
    let version = Number(row.version);
    if (!row.content_started_at && row.editorial_state !== 'live') {
      // Checked here too, so nothing (not even the content mark) is written while the stream is not ready.
      if (row.provider_health !== 'ready') throw NOT_READY();
      version = (await command(row.id, 'mark_content_started', version)).version;
    }
    const r = await command(row.id, 'go_live', version);
    if (!r.noop) {
      await e.update({ status: 'live' });
      await logActivity(actor, 'live.went_live', 'broadcast', row.id, { event_id: e.id });
    }
  } else {
    const r = await command(row.id, cmd, Number(row.version));
    if (!r.noop && cmd === 'end') {
      const started = row.scheduled_start_at ? new Date(row.scheduled_start_at).getTime() : now.getTime();
      await e.update({ status: hasLaterDate(e, started) ? 'scheduled' : 'ended' });
      await logActivity(actor, 'live.ended', 'broadcast', row.id, { event_id: e.id });
    } else if (!r.noop) {
      await logActivity(actor, 'live.back_to_scheduled', 'broadcast', row.id, { event_id: e.id });
    }
  }
  return readLivePanel(e.id, now.getTime());
}

/** The Zoom push details for the shared input. Returned to the caller only; never logged or stored. */
export async function readIngest(eventId: string): Promise<{ rtmps_url: string; stream_key: string }> {
  await eventOr404(eventId);
  const binding = resolveLiveInput();
  const config = readCloudflareStreamConfig();
  if (!binding.bound || !config) throw new LivePanelError('No live stream input is set up on this server.', 409, 'no_live_input');
  try {
    const input = await readLiveInput(binding.providerSessionId, { config });
    return { rtmps_url: input.rtmpsUrl, stream_key: input.rtmpsStreamKey };
  } catch (err) {
    // Only the class: a provider error must never carry request or response bodies into a log.
    throw new LivePanelError('The stream details could not be read from Cloudflare right now. Try again in a minute.', 502, (err as { error_class?: string })?.error_class ?? 'provider_error');
  }
}
