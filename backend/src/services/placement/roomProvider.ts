import { getMeetingProvider } from '../communityRooms/meetingProvider';
import { zoomApiRequest } from '../zoom/zoomApiClient';
import type { ZoomStoredSettings } from '../zoom/zoomMeetingSettings';
import type { UpdateZoomMeetingInput } from '../zoomService';
import { checkRecordingScopes, type ScopeCheck } from './zoomScopePreflight';

/**
 * Career Prep v27, CP9.1: the interview room's meeting, behind one small interface (kit F5). An adapter over the shared
 * MeetingProvider (Zoom by default) and zoomService.updateMeeting, so the provider can change without touching the
 * consent rules in roomService.ts.
 *
 *   create         ALWAYS recording off (`autoRecording: 'none'`): the input type has no recording field at all, so no
 *                  caller can ask for anything else. Returns what Zoom stored for recording, when it said (a fresh
 *                  create); null = cannot tell (a replayed or reconciled create), which roomService reads back later.
 *   setRecording   PATCH the meeting's auto_recording. roomService.applyConsent is its only caller asking for recording
 *                  ON (a test scans the source for that), and only at n of n consent, after canSetRecording.
 *   recording      the read-back: GET /meetings/{id}, its settings.auto_recording mapped to 'on' / 'off'; anything we
 *                  cannot read (an error, a missing field) is null = cannot tell, which roomService treats as unsafe.
 *   joinUrl        the provider's current join link for a meeting (the room routes hand out the STORED one).
 *   canSetRecording  the Zoom scope preflight (zoomScopePreflight.ts): both the update and the read scope.
 * The transcript arrives with the replay (CP9.2, T24, through zoomTranscripts.ts).
 * zoomService is loaded only when a recording change is made: it pulls in the app's models, and the booking path
 * (bookingConfirm.ts) must not load them just to create a room.
 */
export type RecordingMode = NonNullable<UpdateZoomMeetingInput['autoRecording']>;
export type RecordingSeen = 'on' | 'off' | null;

export interface RoomCreateInput { interviewId: string; startsAt: Date; minutes: number; company: string | null }
export interface CreatedRoom { providerEventId: string; joinUrl: string; recording: RecordingSeen }

export interface RoomProvider {
  create(input: RoomCreateInput): Promise<CreatedRoom>;
  setRecording(meetingId: string, mode: RecordingMode): Promise<void>;
  recording(meetingId: string): Promise<RecordingSeen>;
  joinUrl(meetingId: string): Promise<string | null>;
  canSetRecording(): Promise<ScopeCheck>;
}

/** Pure: Zoom's auto_recording ('none' / 'local' / 'cloud') as on / off; anything else is cannot tell. */
export function recordingFrom(settings: ZoomStoredSettings | null | undefined): RecordingSeen {
  const v = settings?.auto_recording;
  if (typeof v !== 'string' || !v.trim()) return null;
  return v === 'none' ? 'off' : 'on';
}

const errClass = (e: unknown) => ((e as Error)?.name && (e as Error).name !== 'Error' ? (e as Error).name : 'UpstreamUnavailable');

export const roomProvider: RoomProvider = {
  async create(input) {
    const made = await getMeetingProvider().createMeeting({
      title: `Interview: ${input.company?.trim() || 'employer'} and a Refactored candidate`, description: 'Booked on hire.refactored.ai',
      startAt: input.startsAt, endAt: new Date(input.startsAt.getTime() + input.minutes * 60_000),
      requestId: `placement-interview-${input.interviewId}-${input.startsAt.toISOString()}`, autoRecording: 'none',
    });
    if (!made.providerEventId || !made.joinUrl) throw Object.assign(new Error('provider returned no meeting'), { name: 'ContractViolation' });
    return { providerEventId: made.providerEventId, joinUrl: made.joinUrl, recording: recordingFrom(made.storedSettings) };
  },
  async setRecording(meetingId, mode) {
    const { updateMeeting } = await import('../zoomService');
    await updateMeeting(meetingId, { autoRecording: mode });
  },
  async recording(meetingId) {
    try {
      const m = await zoomApiRequest<{ settings?: ZoomStoredSettings } | undefined>('GET', `/meetings/${encodeURIComponent(meetingId)}`);
      return recordingFrom(m?.settings);
    } catch (err) {
      console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'placement_room_readback_failed',
        outcome: 'failure', error_class: errClass(err), context: { meeting_id: meetingId } }));
      return null;
    }
  },
  joinUrl: (meetingId) => getMeetingProvider().getJoinUrl(meetingId),
  canSetRecording: () => checkRecordingScopes(),
};
