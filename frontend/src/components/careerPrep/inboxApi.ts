import portalApi from '../../utils/portalApi';

/**
 * Career Prep v27, CP6.1 (kit F2): the student's job-search inbox. Everything is the signed-in student's own; the server
 * computes the health and the setup steps, so the sheet only shows what it is told.
 */
export type InboxHealth = 'setup' | 'broken' | 'quiet' | 'untested' | 'healthy';
export interface InboxView {
  address: string | null; health: InboxHealth; healthLabel: string;
  verifiedAt: string | null; forwardingConfirmedAt: string | null; lastReceivedAt: string | null; lastTestAt: string | null; lastTestMs: number | null;
  receivedThisMonth: number;
  steps: { create: boolean; added: boolean; forwarding: boolean; tested: boolean };
}
export interface ReceivedItem { messageId: string; receivedAt: string; fromName: string | null; subject: string | null; category: string | null; confidence: number | null; outcome: string | null }

const BASE = '/api/portal/career-prep/inbox';
export const CENTRAL_INBOX = 'c_interviews@colaberry.com';

export async function fetchInboxApi(): Promise<InboxView> {
  return (await portalApi.get(BASE)).data.inbox;
}
export async function saveInboxApi(address: string): Promise<InboxView> {
  return (await portalApi.put(BASE, { address })).data.inbox;
}
export async function fetchReceivedApi(): Promise<ReceivedItem[]> {
  return (await portalApi.get(`${BASE}/received`)).data.items;
}
