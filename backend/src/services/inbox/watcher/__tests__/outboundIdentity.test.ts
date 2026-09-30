import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadOutboundLedger,
  identifyOutbound,
  normalizeMessageId,
  sendLedgerPath,
  rosterExtraPath,
  isCampaignRecipient,
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

/**
 * The supplementary roster.
 *
 * The ledger answers "which addresses did we mail". The guard needs "which
 * people are we talking to". They come apart when a student holds a second
 * address, and the failure is quiet: `not_campaign_recipient` is the one skip
 * reason that does not escalate, so the student is dropped rather than handed
 * to a human.
 */
describe('roster-extra widens the roster without touching self-copy identification', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-extra-'));
    fs.writeFileSync(
      sendLedgerPath(dir),
      JSON.stringify({
        type: 'sent', recipient: 'bitania3@gmail.com', subject: 's',
        business_event_id: 'e1', message_id: '<sent-1@colaberry.com>',
      }) + '\n',
    );
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('treats a second address as a campaign recipient', () => {
    // Britiana Akhile, whose primary address is on the ledger.
    fs.writeFileSync(rosterExtraPath(dir), JSON.stringify(['bitania3@yahoo.co.uk']));
    const ledger = loadOutboundLedger(dir);

    expect(ledger.available).toBe(true);
    expect(isCampaignRecipient(ledger, 'bitania3@yahoo.co.uk')).toBe(true);
    expect(isCampaignRecipient(ledger, 'bitania3@gmail.com')).toBe(true);
  });

  it('is absent by default, and then the ledger alone is the roster', () => {
    const ledger = loadOutboundLedger(dir);
    expect(ledger.available).toBe(true);
    expect(isCampaignRecipient(ledger, 'bitania3@yahoo.co.uk')).toBe(false);
    expect(isCampaignRecipient(ledger, 'bitania3@gmail.com')).toBe(true);
  });

  it('does NOT let an extra address count as one of our own sends', () => {
    fs.writeFileSync(rosterExtraPath(dir), JSON.stringify(['bitania3@yahoo.co.uk']));
    const ledger = loadOutboundLedger(dir);

    // The roster grew; the set that identifies our own outbound did not.
    expect(ledger.messageIds.size).toBe(1);
    expect(ledger.sentCount).toBe(1);
  });

  it('accepts the { addresses: [...] } form and lower-cases entries', () => {
    fs.writeFileSync(rosterExtraPath(dir), JSON.stringify({ addresses: ['  Jude.Mofunanya+2@Gmail.com '] }));
    const ledger = loadOutboundLedger(dir);
    expect(isCampaignRecipient(ledger, 'jude.mofunanya+2@gmail.com')).toBe(true);
  });

  /**
   * The important direction. A broken file must not read as "no extras",
   * because that silently reinstates the exact behaviour it was added to stop
   * while looking perfectly healthy.
   */
  it('treats a malformed file as a broken roster, not an empty one', () => {
    fs.writeFileSync(rosterExtraPath(dir), '{ this is not json');
    const ledger = loadOutboundLedger(dir);

    expect(ledger.available).toBe(false);
    expect(ledger.unavailableReason).toBe('corrupt');
    // Unavailable means "we cannot tell", which escalates to a human rather
    // than silently matching nobody.
    expect(isCampaignRecipient(ledger, 'bitania3@gmail.com')).toBeNull();
  });

  it('rejects an entry that is not an address', () => {
    fs.writeFileSync(rosterExtraPath(dir), JSON.stringify(['bitania3@yahoo.co.uk', 42]));
    expect(loadOutboundLedger(dir).available).toBe(false);
  });
});
