/**
 * Short-lived, viewer-bound URLs for attachment images.
 *
 * The problem this solves: an `<img>` tag cannot send an Authorization header,
 * so a participant-authenticated serve route can never render a thumbnail in
 * page HTML. Until now that meant a student's own screenshot vanished from
 * their DM history on reload while the message text stayed — the message
 * looked like it had lost its subject.
 *
 * The capability IS the token, because it has to be: nothing else travels with
 * an image request. Three things keep that honest —
 *   1. short TTL (default 1h) so a leaked URL dies quickly,
 *   2. the token names the VIEWER it was minted for, so a URL lifted from one
 *      student's page is attributable rather than anonymous,
 *   3. a `purpose` claim, so an attachment token can never be replayed as a
 *      participant session token. The reverse is blocked too: requireParticipant
 *      rejects anything whose `role` is not 'participant', and these carry none.
 *
 * Signed with the existing jwtSecret via jsonwebtoken rather than a hand-rolled
 * HMAC — expiry handling and constant-time verification come from the library
 * that already guards every participant route.
 */
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';

const PURPOSE = 'attachment';
const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour — long enough to read a conversation

interface AttachmentTokenPayload {
  aid: string;
  viewer: string;
  purpose: typeof PURPOSE;
}

/** Mint a token authorizing `viewerEnrollmentId` to fetch `attachmentId`. */
export function signAttachmentToken(
  attachmentId: string,
  viewerEnrollmentId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  return jwt.sign(
    { aid: attachmentId, viewer: viewerEnrollmentId, purpose: PURPOSE } satisfies AttachmentTokenPayload,
    env.jwtSecret,
    { expiresIn: ttlSeconds },
  );
}

/**
 * The URL to put in an `<img src>`. Relative, so it inherits the portal origin
 * and works identically behind Cloudflare and in local dev.
 */
export function signedAttachmentUrl(
  attachmentId: string,
  viewerEnrollmentId: string,
  ttlSeconds?: number,
): string {
  const t = signAttachmentToken(attachmentId, viewerEnrollmentId, ttlSeconds);
  return `/api/portal/agent-attachments/${attachmentId}?t=${encodeURIComponent(t)}`;
}

/**
 * Verify a token against the attachment it claims to authorize.
 * Returns the viewer it was minted for, or null when it is invalid, expired,
 * for a different attachment, or not an attachment token at all.
 */
export function verifyAttachmentToken(token: string, attachmentId: string): string | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as Partial<AttachmentTokenPayload>;
    if (payload?.purpose !== PURPOSE) return null;
    // Binding to the attachment id is what stops one valid token from being
    // used to walk every attachment in the system.
    if (payload.aid !== attachmentId) return null;
    if (!payload.viewer || typeof payload.viewer !== 'string') return null;
    return payload.viewer;
  } catch {
    return null; // expired, tampered, or signed with a different secret
  }
}
