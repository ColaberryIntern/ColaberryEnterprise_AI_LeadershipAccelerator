import portalApi from '../utils/portalApi';

/**
 * Client for the participant internship endpoints.
 *
 * Note what is absent: no function here takes an application id. The server
 * derives it from the session, so there is no id for this client to hold, pass,
 * or get wrong.
 */

export type InternshipCardState =
  | 'none'
  | 'eligible'
  | 'started'
  | 'interview_choice'
  | 'call_scheduled'
  | 'interview_in_progress'
  | 'under_review'
  | 'information_requested'
  | 'approved_documents_pending'
  | 'documents_uploaded'
  | 'payment_pending'
  | 'activation_pending'
  | 'active'
  | 'rejected'
  | 'waitlisted';

export interface InternshipStatus {
  card_state: InternshipCardState;
  render: boolean;
  may_pulse: boolean;
  actionable: boolean;
  title: string;
  cta: string | null;
  application: null | {
    id: string;
    state: string;
    interview_channel: 'form' | 'phone' | null;
    submitted_at: string | null;
    is_terminal: boolean;
  };
}

export async function fetchInternshipStatus(): Promise<InternshipStatus> {
  const { data } = await portalApi.get<InternshipStatus>('/api/portal/internship/status');
  return data;
}

export async function startInternshipApplication(): Promise<{ application_id: string; state: string; created: boolean }> {
  const { data } = await portalApi.post('/api/portal/internship/application', {});
  return data;
}

/** Group A only. The server rejects anything else, including a stray API key. */
export async function saveInternshipIntake(values: Record<string, unknown>): Promise<InternshipStatus> {
  const { data } = await portalApi.put<InternshipStatus>('/api/portal/internship/intake', values);
  return data;
}

export async function selectInternshipChannel(channel: 'form' | 'phone'): Promise<InternshipStatus> {
  const { data } = await portalApi.post<InternshipStatus>('/api/portal/internship/interview/channel', { channel });
  return data;
}

export async function dismissInternshipCard(days = 14): Promise<void> {
  await portalApi.post('/api/portal/internship/card/dismiss', { days });
}

/**
 * Fire-and-forget analytics. Deliberately swallows its own errors: a metrics
 * call that rejects must never surface as a broken card, and an unhandled
 * rejection in a render effect is exactly how that happens.
 */
export function recordInternshipCardImpression(cardState: string): void {
  portalApi.post('/api/portal/internship/card/impression', { card_state: cardState })
    .catch(() => { /* analytics is best-effort */ });
}

export function recordInternshipCardOpened(cardState: string): void {
  portalApi.post('/api/portal/internship/card/opened', { card_state: cardState })
    .catch(() => { /* analytics is best-effort */ });
}
