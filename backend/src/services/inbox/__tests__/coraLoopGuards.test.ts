/**
 * Loop-prevention + safe-default guards for the Cora auto-reply agent.
 *
 * Regression pin for the 2026-07-14 self-reply storm: a live Cora (CORA_DRY_RUN
 * defaulted to send) replied to its own replies and to mailer-daemon bounces,
 * flooding ali@colaberry.com until Google rate-limited the account. These tests
 * pin two invariants that prevent a recurrence:
 *   1. Sending is opt-in — an unset/misconfigured CORA_DRY_RUN must stay in shadow.
 *   2. Cora never auto-replies to its own address, to bounces, or to auto-mail.
 *
 * Self-address env is fixed here (before requiring the module) so SELF_ADDRESSES
 * is deterministic regardless of the ambient test environment.
 */

process.env.CORA_SUPPORT_ADDRESS = 'support@colaberry.com';
process.env.CORA_MAILBOX_ADDRESS = 'ali@colaberry.com';

// require (not static import) so the env above is set before module load computes
// SELF_ADDRESSES.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveDryRun, normalizeEmailAddress, coraAutoReplySkipReason } = require('../coraAgentService');

describe('resolveDryRun — sending is opt-in (safe default)', () => {
  it('defaults to dry-run when the flag is unset', () => {
    expect(resolveDryRun(undefined)).toBe(true);
  });
  it('stays in dry-run for any value other than the exact string "false"', () => {
    expect(resolveDryRun('true')).toBe(true);
    expect(resolveDryRun('')).toBe(true);
    expect(resolveDryRun('FALSE')).toBe(true);
    expect(resolveDryRun('0')).toBe(true);
  });
  it('enables live send ONLY on an explicit "false"', () => {
    expect(resolveDryRun('false')).toBe(false);
  });
});

describe('normalizeEmailAddress', () => {
  it('extracts the address from a "Name <addr>" header', () => {
    expect(normalizeEmailAddress('Cora (Colaberry) <support@colaberry.com>')).toBe('support@colaberry.com');
  });
  it('strips +tag aliases and lowercases', () => {
    expect(normalizeEmailAddress('Ali+cora@Colaberry.com')).toBe('ali@colaberry.com');
    expect(normalizeEmailAddress('JANE@ACME.COM')).toBe('jane@acme.com');
  });
});

describe('coraAutoReplySkipReason — loop guards', () => {
  it('skips our own send identity / mailbox (self-loop)', () => {
    expect(coraAutoReplySkipReason({ from_address: 'support@colaberry.com' })).toBe('self_address');
    expect(coraAutoReplySkipReason({ from_address: 'ali@colaberry.com' })).toBe('self_address');
    expect(coraAutoReplySkipReason({ from_address: 'ali+anything@colaberry.com' })).toBe('self_address');
    expect(coraAutoReplySkipReason({ from_address: 'Cora <support@colaberry.com>' })).toBe('self_address');
  });

  it('skips automated / bounce / no-reply senders', () => {
    expect(coraAutoReplySkipReason({ from_address: 'mailer-daemon@googlemail.com' })).toBe('automated_sender');
    expect(coraAutoReplySkipReason({ from_address: 'postmaster@example.com' })).toBe('automated_sender');
    expect(coraAutoReplySkipReason({ from_address: 'no-reply@acme.com' })).toBe('automated_sender');
    expect(coraAutoReplySkipReason({ from_address: 'noreply@acme.com' })).toBe('automated_sender');
  });

  it('skips auto-generated mail by header (RFC 3834 + common auto-responders)', () => {
    expect(
      coraAutoReplySkipReason({ from_address: 'jane@acme.com', headers: { 'Auto-Submitted': 'auto-replied' } })
    ).toBe('auto_submitted');
    expect(
      coraAutoReplySkipReason({ from_address: 'jane@acme.com', headers: { Precedence: 'bulk' } })
    ).toBe('bulk_precedence');
    expect(
      coraAutoReplySkipReason({ from_address: 'jane@acme.com', headers: { 'X-Autoreply': 'yes' } })
    ).toBe('x_autoreply');
  });

  it('flags an empty/missing sender', () => {
    expect(coraAutoReplySkipReason({ from_address: '' })).toBe('no_sender');
    expect(coraAutoReplySkipReason({ from_address: null })).toBe('no_sender');
  });

  it('allows a normal human sender (Auto-Submitted: no is not auto-mail)', () => {
    expect(coraAutoReplySkipReason({ from_address: 'jane@acme.com' })).toBeNull();
    expect(
      coraAutoReplySkipReason({ from_address: 'jane@acme.com', headers: { 'Auto-Submitted': 'no' } })
    ).toBeNull();
  });
});
