/**
 * attachmentUrlToken — this token IS the capability to fetch an image, because
 * an <img> tag can carry nothing else. These tests pin the three properties
 * that make that acceptable: it expires, it is bound to ONE attachment, and it
 * cannot be confused with a participant session token in either direction.
 */
jest.mock('../../../../config/env', () => ({ env: { jwtSecret: 'test-secret-for-attachment-tokens' } }));

import jwt from 'jsonwebtoken';
import { signAttachmentToken, signedAttachmentUrl, verifyAttachmentToken } from '../attachmentUrlToken';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VIEWER = '11111111-1111-4111-8111-111111111111';

describe('attachmentUrlToken — happy path', () => {
  it('round-trips, returning the viewer it was minted for', () => {
    expect(verifyAttachmentToken(signAttachmentToken(A, VIEWER), A)).toBe(VIEWER);
  });

  it('builds a relative URL carrying the token', () => {
    const url = signedAttachmentUrl(A, VIEWER);
    expect(url.startsWith(`/api/portal/agent-attachments/${A}?t=`)).toBe(true);
    const token = decodeURIComponent(url.split('?t=')[1]);
    expect(verifyAttachmentToken(token, A)).toBe(VIEWER);
  });
});

describe('attachmentUrlToken — the properties that make a URL-borne capability safe', () => {
  it('is bound to ONE attachment, so it cannot walk the whole store', () => {
    const token = signAttachmentToken(A, VIEWER);
    expect(verifyAttachmentToken(token, B)).toBeNull();
  });

  it('expires', () => {
    const token = signAttachmentToken(A, VIEWER, -1); // already past
    expect(verifyAttachmentToken(token, A)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ aid: A, viewer: VIEWER, purpose: 'attachment' }, 'not-the-secret');
    expect(verifyAttachmentToken(forged, A)).toBeNull();
  });

  it('rejects garbage and empty input rather than throwing', () => {
    expect(verifyAttachmentToken('', A)).toBeNull();
    expect(verifyAttachmentToken('not-a-jwt', A)).toBeNull();
  });
});

describe('attachmentUrlToken — no confusion with a participant session token', () => {
  it('refuses a participant token presented as an attachment token', () => {
    // Same secret, so this MUST be rejected on the claims rather than the signature.
    const participant = jwt.sign(
      { sub: VIEWER, email: 'x@y.z', cohort_id: '', role: 'participant' },
      'test-secret-for-attachment-tokens',
    );
    expect(verifyAttachmentToken(participant, A)).toBeNull();
  });

  it('mints nothing that requireParticipant would accept as a session', () => {
    // The reverse direction: requireParticipant rejects anything whose role is
    // not 'participant', and an attachment token deliberately carries no role.
    const decoded = jwt.decode(signAttachmentToken(A, VIEWER)) as Record<string, unknown>;
    expect(decoded.role).toBeUndefined();
    expect(decoded.purpose).toBe('attachment');
    expect(decoded.exp).toBeDefined();
  });
});
