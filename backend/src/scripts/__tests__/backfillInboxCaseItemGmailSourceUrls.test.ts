import { randomUUID } from 'crypto';
import { makeFakeModel } from '../../services/inboxCase/__tests__/testHelpers/fakeModel';

const fakeInboxCaseItem = makeFakeModel();

jest.mock('../../config/database', () => ({ sequelize: {} }));
jest.mock('../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));

import { backfillGmailSourceUrls, buildGmailSourceUrl } from '../backfillInboxCaseItemGmailSourceUrls';

beforeEach(() => {
  fakeInboxCaseItem.rows.clear();
});

async function seedItem(overrides: Partial<any> = {}) {
  return fakeInboxCaseItem.create({
    case_id: randomUUID(),
    source_type: 'email',
    source_id: 'msg-abc123',
    provider: 'gmail_colaberry',
    title: 'Test email',
    match_score: 0.9,
    match_reasons: [],
    inclusion_status: 'INCLUDED',
    disposition: null,
    source_url: null,
    snapshot: {},
    source_hash: randomUUID(),
    ...overrides,
  });
}

describe('buildGmailSourceUrl', () => {
  it('matches the exact formula gmailCaseSource.ts uses at discovery time', () => {
    expect(buildGmailSourceUrl('abc123')).toBe('https://mail.google.com/mail/u/0/#all/abc123');
  });
});

describe('backfillGmailSourceUrls', () => {
  it('populates source_url on a NULL Gmail email item from its source_id', async () => {
    const item = await seedItem();
    const result = await backfillGmailSourceUrls();

    expect(result).toEqual({ updated: 1, scanned: 1 });
    expect(item.source_url).toBe('https://mail.google.com/mail/u/0/#all/msg-abc123');
  });

  it('backfills sent_email items too, not just inbound email', async () => {
    const item = await seedItem({ source_type: 'sent_email', source_id: 'msg-sent-1' });
    await backfillGmailSourceUrls();
    expect(item.source_url).toBe('https://mail.google.com/mail/u/0/#all/msg-sent-1');
  });

  it('is a no-op (idempotent) on a row that already has a source_url', async () => {
    const item = await seedItem({ source_url: 'https://mail.google.com/mail/u/0/#all/already-set' });
    const result = await backfillGmailSourceUrls();

    expect(result.updated).toBe(0);
    expect(item.source_url).toBe('https://mail.google.com/mail/u/0/#all/already-set'); // unchanged
  });

  it('does not touch a non-Gmail provider (e.g. basecamp) even if source_url is NULL', async () => {
    const item = await seedItem({ provider: 'basecamp', source_type: 'basecamp_comment', source_id: '999' });
    const result = await backfillGmailSourceUrls();

    expect(result.updated).toBe(0);
    expect(item.source_url).toBeNull();
  });

  it('does not touch a hotmail item — Gmail-only formula, Hotmail has its own webLink-based fix already', async () => {
    const item = await seedItem({ provider: 'hotmail', source_id: 'msg-hotmail-1' });
    const result = await backfillGmailSourceUrls();

    expect(result.updated).toBe(0);
    expect(item.source_url).toBeNull();
  });
});
