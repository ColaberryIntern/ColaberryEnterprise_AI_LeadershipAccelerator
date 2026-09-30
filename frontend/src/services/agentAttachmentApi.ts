import portalApi from '../utils/portalApi';

/**
 * Files a student hands to an agent (Cory, Reese) so it can look at them —
 * the client half of the read_attachments tool.
 *
 * Two-step by design: upload the bytes, then send the returned id with the
 * chat turn. That keeps the chat request small, lets one file be referenced by
 * more than one turn, and means the server checks ownership against a stored
 * row rather than trusting a request body.
 */

/** Kept in step with the server's agentAttachmentUpload filter. */
export const ACCEPTED_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
export const ACCEPT_ATTR = '.png,.jpg,.jpeg,.webp,.gif,.pdf';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TURN = 4;

export interface UploadedAttachment {
  id: string;
  name: string;
  mime: string;
  byte_size: number;
  /** Owner-scoped URL for rendering the student's own thumbnail. */
  url: string;
}

/** The shape a chat turn carries. */
export interface AttachmentRef {
  id: string;
  name?: string | null;
}

export async function uploadAgentAttachment(file: File): Promise<UploadedAttachment> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await portalApi.post<UploadedAttachment>('/api/portal/agent-attachments', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/**
 * Why a file was rejected before it ever left the browser, phrased for the
 * student. Returns null when the file is fine. Checking here rather than only
 * server-side means an oversized screenshot fails instantly instead of after a
 * 10MB round trip.
 */
export function rejectionReason(file: File): string | null {
  if (!ACCEPTED_ATTACHMENT_TYPES.includes(file.type)) {
    return `${file.name}: attach an image (PNG, JPG, WEBP, GIF) or a PDF.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name}: that file is over 10MB.`;
  }
  return null;
}
