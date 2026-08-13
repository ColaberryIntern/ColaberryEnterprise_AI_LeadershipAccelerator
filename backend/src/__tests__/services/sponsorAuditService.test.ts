/**
 * Sponsor portal audit trail (STORY-001 trust requirement).
 *
 * Two invariants are load-bearing and tested here directly:
 *  1. A failed audit write never breaks a manager's login.
 *  2. Nothing persisted is usable as a credential — tokens are fingerprinted,
 *     emails are redacted.
 */

jest.mock('../../models/SponsorPortalAuditLog', () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue(undefined) },
}));

import SponsorPortalAuditLog from '../../models/SponsorPortalAuditLog';
import {
  fingerprintToken,
  recordSponsorPortalAuditEvent,
  redactEmailForAudit,
} from '../../services/sponsorAuditService';

const auditCreate = SponsorPortalAuditLog.create as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  auditCreate.mockResolvedValue(undefined);
});

describe('fingerprintToken', () => {
  it('is stable, so an access event can be joined to its generation event', () => {
    expect(fingerprintToken('tok-abc')).toBe(fingerprintToken('tok-abc'));
  });

  it('differs for different tokens', () => {
    expect(fingerprintToken('tok-abc')).not.toBe(fingerprintToken('tok-xyz'));
  });

  it('never contains the token itself', () => {
    const token = '8f14e45f-ea0a-4f0b-9c1a-1b2c3d4e5f60';
    const fingerprint = fingerprintToken(token);
    expect(fingerprint).not.toContain(token);
    expect(fingerprint).toHaveLength(16);
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('redactEmailForAudit', () => {
  it('keeps the domain and drops the identity', () => {
    expect(redactEmailForAudit('jordan.lee@acme.com')).toBe('j***@acme.com');
  });

  it('degrades safely on a malformed address', () => {
    expect(redactEmailForAudit('not-an-email')).toBe('***');
  });
});

describe('recordSponsorPortalAuditEvent', () => {
  it('persists a redacted, fingerprinted row — never the raw email or token', async () => {
    await recordSponsorPortalAuditEvent({
      event: 'link_generated',
      correlationId: 'corr-1',
      sponsorId: 'sp-1',
      leadId: 42,
      email: 'jordan.lee@acme.com',
      token: 'tok-abc',
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
      metadata: { token_reused: false },
    });

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const row = auditCreate.mock.calls[0][0];
    expect(row).toMatchObject({
      event: 'link_generated',
      correlation_id: 'corr-1',
      sponsor_id: 'sp-1',
      lead_id: 42,
      email_redacted: 'j***@acme.com',
      token_fingerprint: fingerprintToken('tok-abc'),
      ip_address: '203.0.113.7',
      metadata: { token_reused: false },
    });

    // The credential-safety invariant, asserted against the whole serialized row.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('tok-abc');
    expect(serialized).not.toContain('jordan.lee@acme.com');
  });

  it('leaves optional fields null rather than inventing values', async () => {
    await recordSponsorPortalAuditEvent({ event: 'link_rejected', correlationId: 'corr-2' });

    expect(auditCreate.mock.calls[0][0]).toMatchObject({
      sponsor_id: null,
      lead_id: null,
      email_redacted: null,
      token_fingerprint: null,
      ip_address: null,
      user_agent: null,
      metadata: {},
    });
  });

  it('truncates an oversized user agent instead of failing the insert', async () => {
    await recordSponsorPortalAuditEvent({
      event: 'link_accessed',
      correlationId: 'corr-3',
      userAgent: 'x'.repeat(900),
    });

    expect(auditCreate.mock.calls[0][0].user_agent).toHaveLength(512);
  });

  it('swallows a write failure so a manager is never locked out by the audit trail', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    auditCreate.mockRejectedValue(new Error('relation "sponsor_portal_audit_log" does not exist'));

    await expect(
      recordSponsorPortalAuditEvent({ event: 'link_accessed', correlationId: 'corr-4' }),
    ).resolves.toBeUndefined();

    // ...but the gap in the trail is itself discoverable in the logs.
    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleError.mock.calls[0][0] as string);
    expect(logged).toMatchObject({
      event: 'sponsor_portal_audit_write_failed',
      outcome: 'failure',
      correlation_id: 'corr-4',
      audited_event: 'link_accessed',
      error_class: 'Error',
    });

    consoleError.mockRestore();
  });
});
