import { google } from 'googleapis';
import { env } from '../../config/env';

// Meeting provider adapter (spec §11). Keeps Google Meet for the first release
// but behind a stable interface so LiveKit/Jitsi can be evaluated later without
// touching room/booking logic. Reuses the existing service-account + domain-wide
// delegation auth pattern from meetingService/calendarService (Meet-link creation
// requires the impersonated subject).

export interface CreateMeetingInput {
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timezone?: string;
  attendeeEmails?: string[];
  // Stable id used as the conference createRequest id so retries do not spawn
  // duplicate conferences (idempotency at the provider layer).
  requestId: string;
}

export interface MeetingResult {
  providerEventId: string;
  joinUrl: string | null;
}

export interface MeetingAttendance {
  email: string;
  joinedAt?: string;
  durationMinutes?: number;
}

export interface MeetingProvider {
  readonly name: string;
  createMeeting(input: CreateMeetingInput): Promise<MeetingResult>;
  updateMeeting(providerEventId: string, patch: Partial<CreateMeetingInput>): Promise<void>;
  cancelMeeting(providerEventId: string): Promise<void>;
  getJoinUrl(providerEventId: string): Promise<string | null>;
  getAttendance(providerEventId: string): Promise<MeetingAttendance[]>;
  getRecording(providerEventId: string): Promise<string | null>;
  supportsEmbedded(): boolean;
  supportsBreakouts(): boolean;
}

const DEFAULT_TZ = 'America/Chicago';
const CALL_TIMEOUT_MS = 20_000;

function timeoutError(): Error {
  return Object.assign(new Error('Google Calendar request timed out'), { error_class: 'TimeoutError' });
}

// Fail-first: every outbound Google call is bounded so a hung request cannot
// wedge the outbox worker.
async function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(timeoutError()), CALL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export class GoogleMeetAdapter implements MeetingProvider {
  readonly name = 'google_meet';

  private calendarClient() {
    if (!env.googleServiceAccountEmail || !env.googlePrivateKey) {
      throw Object.assign(new Error('Google Calendar not configured'), { error_class: 'ConfigError' });
    }
    // Impersonate the calendar owner when configured — required for Meet-link
    // creation via domain-wide delegation (same rule as calendarService).
    const auth = new google.auth.JWT({
      email: env.googleServiceAccountEmail,
      key: env.googlePrivateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      ...(env.googleCalendarOwnerEmail ? { subject: env.googleCalendarOwnerEmail } : {}),
    });
    return google.calendar({ version: 'v3', auth });
  }

  async createMeeting(input: CreateMeetingInput): Promise<MeetingResult> {
    const calendar = this.calendarClient();
    const tz = input.timezone || DEFAULT_TZ;
    const event = await withTimeout(
      calendar.events.insert({
        calendarId: env.googleCalendarId || 'primary',
        conferenceDataVersion: 1,
        sendNotifications: false,
        requestBody: {
          summary: input.title,
          description: input.description || '',
          start: { dateTime: input.startAt.toISOString(), timeZone: tz },
          end: { dateTime: input.endAt.toISOString(), timeZone: tz },
          attendees: (input.attendeeEmails || []).map((email) => ({ email })),
          conferenceData: {
            createRequest: {
              requestId: input.requestId,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
      })
    );
    const joinUrl =
      event.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
      event.data.hangoutLink ||
      null;
    return { providerEventId: event.data.id || '', joinUrl };
  }

  async updateMeeting(providerEventId: string, patch: Partial<CreateMeetingInput>): Promise<void> {
    const calendar = this.calendarClient();
    const tz = patch.timezone || DEFAULT_TZ;
    await withTimeout(
      calendar.events.patch({
        calendarId: env.googleCalendarId || 'primary',
        eventId: providerEventId,
        requestBody: {
          ...(patch.title ? { summary: patch.title } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.startAt ? { start: { dateTime: patch.startAt.toISOString(), timeZone: tz } } : {}),
          ...(patch.endAt ? { end: { dateTime: patch.endAt.toISOString(), timeZone: tz } } : {}),
        },
      })
    );
  }

  async cancelMeeting(providerEventId: string): Promise<void> {
    const calendar = this.calendarClient();
    await withTimeout(
      calendar.events.delete({ calendarId: env.googleCalendarId || 'primary', eventId: providerEventId })
    );
  }

  async getJoinUrl(providerEventId: string): Promise<string | null> {
    const calendar = this.calendarClient();
    const event = await withTimeout(
      calendar.events.get({ calendarId: env.googleCalendarId || 'primary', eventId: providerEventId })
    );
    return (
      event.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
      event.data.hangoutLink ||
      null
    );
  }

  // Google Meet attendance/recording require the Reports API + Workspace admin;
  // not wired for the first release. Attendance is reconciled from join-intent
  // events instead (see roomBookingService.joinBooking).
  async getAttendance(): Promise<MeetingAttendance[]> {
    return [];
  }

  async getRecording(): Promise<string | null> {
    return null;
  }

  supportsEmbedded(): boolean {
    return false;
  }

  supportsBreakouts(): boolean {
    return false;
  }
}

const PROVIDERS: Record<string, MeetingProvider> = {
  google_meet: new GoogleMeetAdapter(),
};

// Factory — default to Google Meet. Unknown providers fall back to Meet (the only
// implemented provider this release) rather than throwing, so a stray value in a
// booking row never breaks the outbox.
export function getMeetingProvider(name?: string | null): MeetingProvider {
  return PROVIDERS[name || 'google_meet'] || PROVIDERS.google_meet;
}
