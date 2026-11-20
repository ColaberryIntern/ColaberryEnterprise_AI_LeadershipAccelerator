import type { HubEvent, HubEventInput, HubEventType, HubHost, HubPlacement, HubRepeat } from '../../../../services/commsHubApi';

/**
 * The event form's state and rules (CH3.2). Pure, so the rules are tested without rendering.
 * Date and times are the Central wall clock exactly as typed; the server converts them.
 */
export interface EventFormState {
  title: string;
  event_type: HubEventType;
  audienceKind: 'all_members' | 'cohorts';
  cohort_ids: string[];
  date: string;
  start_time: string;
  end_time: string;
  repeat: 'none' | HubRepeat['freq'];
  repeat_until: string;
  join_url: string;
  registration_url: string;
  hosts: HubHost[];
  description: string;
  placement: HubPlacement;
}

export type FormErrors = Partial<Record<keyof EventFormState | 'form', string>>;

export function emptyForm(): EventFormState {
  return {
    title: '', event_type: 'session', audienceKind: 'all_members', cohort_ids: [], date: '', start_time: '', end_time: '',
    repeat: 'none', repeat_until: '', join_url: '', registration_url: '', hosts: [], description: '',
    placement: { calendar: true, events_page: true, campus_rail: true },
  };
}

export function fromEvent(ev: HubEvent): EventFormState {
  return {
    title: ev.title, event_type: ev.event_type,
    audienceKind: ev.audience.kind, cohort_ids: ev.audience.kind === 'cohorts' ? ev.audience.cohort_ids : [],
    date: ev.central.date, start_time: ev.central.start_time, end_time: ev.central.end_time ?? '',
    repeat: ev.repeat_rule?.freq ?? 'none', repeat_until: ev.repeat_rule?.until ?? '',
    join_url: ev.join_url ?? '', registration_url: ev.registration_url ?? '', hosts: ev.hosts,
    description: ev.description ?? '', placement: ev.placement,
  };
}

const isUrl = (s: string): boolean => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s.trim());

export function validate(f: EventFormState): FormErrors {
  const e: FormErrors = {};
  if (!f.title.trim()) e.title = 'Give the event a title.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) e.date = 'Choose the date.';
  if (!/^\d{2}:\d{2}$/.test(f.start_time)) e.start_time = 'Choose the start time (Central).';
  if (f.end_time && f.start_time && f.end_time <= f.start_time) e.end_time = 'The end time must be after the start time.';
  if (f.repeat !== 'none') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.repeat_until)) e.repeat_until = 'Choose the last date it repeats.';
    else if (f.date && f.repeat_until < f.date) e.repeat_until = 'The last date must be on or after the first date.';
  }
  if (f.audienceKind === 'cohorts' && f.cohort_ids.length === 0) e.cohort_ids = 'Pick at least one cohort, or choose all open cohorts.';
  if (f.join_url.trim() && !isUrl(f.join_url)) e.join_url = 'Paste the full link, starting with https://';
  if (f.join_url.trim().length > 500) e.join_url = 'That link is too long (500 characters at most).';
  if (f.registration_url.trim() && !isUrl(f.registration_url)) e.registration_url = 'Paste the full link, starting with https://';
  if (f.hosts.some((h) => !h.name.trim())) e.hosts = 'Every host needs a name, or remove the empty row.';
  return e;
}

export function toInput(f: EventFormState, status: 'draft' | 'scheduled'): HubEventInput {
  const blank = (s: string): string | null => (s.trim() ? s.trim() : null);
  return {
    title: f.title.trim(), event_type: f.event_type,
    audience: f.audienceKind === 'all_members' ? { kind: 'all_members' } : { kind: 'cohorts', cohort_ids: f.cohort_ids },
    date: f.date, start_time: f.start_time, end_time: blank(f.end_time),
    repeat: f.repeat === 'none' ? null : { freq: f.repeat, until: f.repeat_until },
    join_url: blank(f.join_url), registration_url: blank(f.registration_url),
    hosts: f.hosts.map((h) => (h.role?.trim() ? { name: h.name.trim(), role: h.role.trim() } : { name: h.name.trim() })),
    description: blank(f.description), placement: f.placement, status,
  };
}
