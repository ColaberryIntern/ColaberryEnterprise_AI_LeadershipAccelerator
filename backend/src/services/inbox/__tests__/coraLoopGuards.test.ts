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
const {
  resolveDryRun,
  normalizeEmailAddress,
  coraAutoReplySkipReason,
  isOwnDistributionList,
} = require('../coraAgentService');

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

/**
 * `Precedence: list` from our OWN support group (Ali, 2026-11-15: "wire her to
 * support so she can answer those").
 *
 * support@colaberry.com is a Google Group. Google stamps `Precedence: list` on
 * every message it fans out, and the RFC 3834 guard read that as bulk mail, so
 * the group that delivered Cora her mail was the one thing stopping her from
 * answering it: 132 of her last 152 skips, 87%, all real people writing in.
 *
 * The headers below are copied verbatim from production rows (note the mixed
 * case `<Support.colaberry.com>` Google actually emits, and the lowercased
 * header keys the inbox stores) so a reader can see these are not invented.
 */
describe('coraAutoReplySkipReason — our own support group is not a mailing list', () => {
  // Exactly what the inbox stored for "Tuition fee" (10 Nov) and Kes's "Question" (13 Nov).
  const ownGroupHeaders = {
    precedence: 'list',
    'list-id': '<Support.colaberry.com>',
    'mailing-list': 'list Support@colaberry.com; contact Support+owners@colaberry.com',
    'delivered-to': 'ali@colaberry.com',
  };

  it('answers a real person who wrote to the support group', () => {
    expect(
      coraAutoReplySkipReason({ from_address: 'sweetaalmin@gmail.com', headers: ownGroupHeaders })
    ).toBeNull();
  });

  it('still refuses a FOREIGN mailing list that reaches the same mailbox', () => {
    expect(
      coraAutoReplySkipReason({
        from_address: 'announce@vendor.example',
        headers: { precedence: 'list', 'list-id': '<announce.vendor.example>' },
      })
    ).toBe('foreign_list_precedence');
  });

  it('still refuses Precedence: list with no list identity at all', () => {
    expect(
      coraAutoReplySkipReason({ from_address: 'jane@acme.com', headers: { Precedence: 'list' } })
    ).toBe('foreign_list_precedence');
  });

  it('keeps refusing genuine bulk mail even when it arrives through our group', () => {
    expect(
      coraAutoReplySkipReason({
        from_address: 'blast@marketing.example',
        headers: { ...ownGroupHeaders, precedence: 'bulk' },
      })
    ).toBe('bulk_precedence');
    expect(
      coraAutoReplySkipReason({
        from_address: 'blast@marketing.example',
        headers: { ...ownGroupHeaders, precedence: 'junk' },
      })
    ).toBe('bulk_precedence');
  });

  it('keeps every other loop guard ahead of the group allowance', () => {
    // The group's own address arriving through the group is still a self-loop.
    expect(
      coraAutoReplySkipReason({ from_address: 'support@colaberry.com', headers: ownGroupHeaders })
    ).toBe('self_address');
    // A bounce fanned out by the group is still a bounce.
    expect(
      coraAutoReplySkipReason({ from_address: 'mailer-daemon@googlemail.com', headers: ownGroupHeaders })
    ).toBe('automated_sender');
    // An out-of-office fanned out by the group is still an auto-responder.
    expect(
      coraAutoReplySkipReason({
        from_address: 'jane@acme.com',
        headers: { ...ownGroupHeaders, 'Auto-Submitted': 'auto-replied' },
      })
    ).toBe('auto_submitted');
  });

  it('identifies the group by List-Id or by Mailing-list, and nothing else', () => {
    const own = (headers: Record<string, string>): boolean => {
      const lookup = (name: string): string => {
        const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === name);
        return (hit?.[1] ?? '').toString().toLowerCase();
      };
      return isOwnDistributionList(lookup, ['support@colaberry.com', 'ali@colaberry.com']);
    };
    expect(own({ 'list-id': '<Support.colaberry.com>' })).toBe(true);
    expect(own({ 'mailing-list': 'list Support@colaberry.com; contact x' })).toBe(true);
    expect(own({ 'list-id': '<announce.vendor.example>' })).toBe(false);
    expect(own({})).toBe(false);
    // A lookalike domain must not pass as ours.
    expect(own({ 'list-id': '<support.colaberry.com.evil.example>' })).toBe(false);
  });
});
