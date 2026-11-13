import api from '../utils/api';

/**
 * Admin review of the headline a candidate proposed in their Hire studio. The live headline on
 * hire.refactored.ai changes only when an admin approves the exact text shown here; the server
 * answers 409 if the candidate changed it in the meantime.
 */

export interface HeadlineDraft {
  readonly enrollmentId: string;
  readonly name: string;
  readonly slug: string | null;
  /** What Hire shows today. */
  readonly live: string | null;
  readonly draft: string;
  readonly updatedAt: string;
}

export type HeadlineDecision = 'approve' | 'reject';

export async function fetchHeadlineDrafts(): Promise<HeadlineDraft[]> {
  return (await api.get('/api/admin/career/hire-headline-drafts')).data.drafts ?? [];
}

export async function decideHeadline(enrollmentId: string, decision: HeadlineDecision, draft: string): Promise<void> {
  await api.post(`/api/admin/career/hire-headline-drafts/${encodeURIComponent(enrollmentId)}`, { decision, draft });
}
