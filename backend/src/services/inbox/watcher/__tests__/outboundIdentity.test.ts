import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadOutboundLedger,
  identifyOutbound,
  normalizeMessageId,
  sendLedgerPath,
  OUTBOUND_COPY_HEADER,
} from '../outboundIdentity';

/**
 * Ali is BCC'd on all 25 student-unblock emails, so 25 copies of our own
 * outbound arrive in the mailbox the watcher reads, each one addressed to a
 * student and full of student-sounding content. These tests use the ledger
 * format the send harness actually writes and the header shape Gmail actually
 * returns, and pin that our own copy is never mistaken for a reply — including
 * when the two identifications disagree with each other.
 */

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outbound-ledger-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const BUSINESS_EVENT = 'story000-unblock-2026-08-17';

function writeLedger(lines: object[]): void {
  fs.writeFileSync(sendLedgerPath(dir), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

const sentRecord = (key: string, recipient: string, messageId: string) => ({
  ts: '2026-08-17T02:05:00.000Z',
  type: 'sent',
  key,
  recipient,
  subject: 'Your build, and a fresh sign in link',
  business_event_id: BUSINESS_EVENT,
  message_id: messageId,
});

describe('normalizeMessageId', () => {
  it('strips angle brackets and lower-cases, so the two sides of the seam compare equal', () => {
    expect(normalizeMessageId('<AbC-123@colaberry.com>')).toBe('abc-123@colaberry.com');
    expect(normalizeMessageId('abc-123@colaberry.com')).toBe('abc-123@colaberry.com');
    expect(normalizeMessageId('  <abc-123@colaberry.com>  ')).toBe('abc-123@colaberry.com');
  });

  it('returns empty for a missing id rather than a matchable value', () => {
    expect(normalizeMessageId(null)).toBe('');
    expect(normalizeMessageId(undefined)).toBe('');
    expect(normalizeMessageId('')).toBe('');
  });
});

describe('loading the send harness ledger', () => {
  it('collects the message ids of everything recorded as sent', () => {
    writeLedger([
      { ts: 't', type: 'claim', key: 'k1' },
      sentRecord('k1', 'bfglz@yahoo.com', '<m1@colaberry.com>'),
      { ts: 't', type: 'claim', key: 'k2' },
      sentRecord('k2', 'qninying@gmail.com', '<m2@colaberry.com>'),
    ]);
    const ledger = loadOutboundLedger(dir);
    expect(ledger.available).toBe(true);
    expect(ledger.sentCount).toBe(2);
    expect([...ledger.messageIds].sort()).toEqual(['m1@colaberry.com', 'm2@colaberry.com']);
    expect([...ledger.businessEventIds]).toEqual([BUSINESS_EVENT]);
  });

  it('reports a missing ledger as unavailable rather than as an empty one', () => {
    const ledger = loadOutboundLedger(dir);
    expect(ledger.available).toBe(false);
    expect(ledger.unavailableReason).toBe('missing');
    expect(ledger.messageIds.size).toBe(0);
  });

  it('reports a corrupt line as unavailable instead of skipping it', () => {
    fs.writeFileSync(
      sendLedgerPath(dir),
      JSON.stringify(sentRecord('k1', 'a@x.com', '<m1@colaberry.com>')) + '\n{ half-writ',
    );
    const ledger = loadOutboundLedger(dir);
    expect(ledger.available).toBe(false);
    expect(ledger.unavailableReason).toBe('corrupt');
  });

  it('reports a send recorded with no message id as unavailable', () => {
    writeLedger([{ ts: 't', type: 'sent', key: 'k1', recipient: 'a@x.com' }]);
    const ledger = loadOutboundLedger(dir);
    expect(ledger.available).toBe(false);
    expect(ledger.unavailableReason).toBe('corrupt');
  });
});

describe("Ali's BCC copy of our own campaign email is not a student reply", () => {
  beforeEach(() => {
    writeLedger([sentRecord('k1', 'bfglz@yahoo.com', '<campaign-1@colaberry.com>')]);
  });

  it('identifies it by the ledger message id, matching across bracket and case differences', () => {
    const ledger = loadOutboundLedger(dir);
    const match = identifyOutbound(
      {
        messageIdHeader: '<Campaign-1@colaberry.com>',
        headers: {
          'Message-ID': '<Campaign-1@colaberry.com>',
          [OUTBOUND_COPY_HEADER]: BUSINESS_EVENT,
          From: '"Ali Muwwakkil" <ali@colaberry.com>',
          To: 'bfglz@yahoo.com',
        },
      },
      ledger,
    );
    expect(match).toEqual({ isOurs: true, via: 'ledger_message_id', seamDisagreement: false, detail: undefined });
  });

  it('still identifies it when the relay stripped our custom header, and flags the disagreement', () => {
    const ledger = loadOutboundLedger(dir);
    const match = identifyOutbound(
      { messageIdHeader: '<campaign-1@colaberry.com>', headers: { From: 'ali@colaberry.com' } },
      ledger,
    );
    expect(match.isOurs).toBe(true);
    expect(match.isOurs === true && match.via).toBe('ledger_message_id');
    expect(match.isOurs === true && match.seamDisagreement).toBe(true);
  });

  it('still identifies it from the header alone when the ledger holds a different id, and flags the seam as broken', () => {
    // This is the seam failing in the middle: nodemailer's returned id and the
    // delivered RFC822 Message-ID are not the same value.
    const ledger = loadOutboundLedger(dir);
    const match = identifyOutbound(
      {
        messageIdHeader: '<rewritten-by-relay@mandrillapp.com>',
        headers: { [OUTBOUND_COPY_HEADER]: BUSINESS_EVENT },
      },
      ledger,
    );
    expect(match.isOurs).toBe(true);
    expect(match.isOurs === true && match.via).toBe('outbound_copy_header');
    expect(match.isOurs === true && match.seamDisagreement).toBe(true);
    expect(match.isOurs === true && match.detail).toContain('not among the 1 sends in the ledger');
  });
});

describe('a genuine student reply is not mistaken for our own mail', () => {
  it('is not ours, even on the same thread and with a near-identical subject', () => {
    writeLedger([sentRecord('k1', 'bfglz@yahoo.com', '<campaign-1@colaberry.com>')]);
    const ledger = loadOutboundLedger(dir);
    const match = identifyOutbound(
      {
        messageIdHeader: '<student-reply-99@yahoo.com>',
        headers: {
          'Message-ID': '<student-reply-99@yahoo.com>',
          'In-Reply-To': '<campaign-1@colaberry.com>',
          From: 'Liza Ayele <bfglz@yahoo.com>',
          Subject: 'Re: Your build, and a fresh sign in link',
        },
      },
      ledger,
    );
    expect(match).toEqual({ isOurs: false });
  });
});

describe('a reply the watcher itself sent is recognised as ours', () => {
  it('matches the watcher own-reply set before anything else', () => {
    writeLedger([sentRecord('k1', 'bfglz@yahoo.com', '<campaign-1@colaberry.com>')]);
    const ledger = loadOutboundLedger(dir);
    const own = new Set(['watcher-reply-7@colaberry.com']);
    const match = identifyOutbound(
      { messageIdHeader: '<Watcher-Reply-7@colaberry.com>', headers: {} },
      ledger,
      own,
    );
    expect(match).toEqual({ isOurs: true, via: 'watcher_own_reply', seamDisagreement: false });
  });
});
