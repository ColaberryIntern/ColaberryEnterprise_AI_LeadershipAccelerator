/**
 * Proves two things about syncAllMailboxes():
 *  1. A single failure is enough to engage backoff for that provider — the very next
 *     tick, even moments later, must NOT call that provider's API again.
 *  2. That backoff never blocks a different provider (gmail_personal) — it is
 *     attempted on every tick regardless of gmail_colaberry's state. All three
 *     provider blocks in syncAllMailboxes share the same independent try/catch
 *     structure, so proving Gmail-to-Gmail isolation demonstrates the pattern that
 *     also isolates the hotmail_graph block.
 *
 * Uses Jest fake timers so backoff timing is deterministic — asserting this against
 * real wall-clock speed is a trap: a slow test run can accidentally let enough real
 * time pass to clear the backoff window, producing a false pass that says nothing
 * about the actual logic.
 */
jest.mock('../../../models/InboxEmail', () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn().mockResolvedValue([{}, true]) },
}));

jest.mock('../../../models/SystemSetting', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockResolvedValue(null),
    findOrCreate: jest.fn().mockResolvedValue([{ update: jest.fn().mockResolvedValue(undefined) }]),
  },
}));

interface FakeGmailClient {
  users: {
    messages: { list: jest.Mock; get: jest.Mock };
    history: { list: jest.Mock };
  };
}

const createdClients: FakeGmailClient[] = [];

function makeFakeClient(): FakeGmailClient {
  const client: FakeGmailClient = {
    users: {
      messages: {
        list: jest.fn().mockResolvedValue({ data: { messages: [] } }),
        get: jest.fn(),
      },
      history: { list: jest.fn() },
    },
  };
  createdClients.push(client);
  return client;
}

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })),
    },
    gmail: jest.fn().mockImplementation(() => makeFakeClient()),
  },
}));

describe('syncAllMailboxes — per-provider backoff + failure isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    createdClients.length = 0;
    process.env.GMAIL_CLIENT_ID = 'colaberry-client-id';
    process.env.GMAIL_CLIENT_SECRET = 'colaberry-secret';
    process.env.GMAIL_REFRESH_TOKEN = 'colaberry-refresh';
    process.env.GMAIL_PERSONAL_CLIENT_ID = 'personal-client-id';
    process.env.GMAIL_PERSONAL_CLIENT_SECRET = 'personal-secret';
    process.env.GMAIL_PERSONAL_REFRESH_TOKEN = 'personal-refresh';
    delete process.env.MS_GRAPH_CLIENT_ID;
    delete process.env.MS_GRAPH_REFRESH_TOKEN;
    delete process.env.MS_OAUTH_CLIENT_ID;

    // Reset backoff state left over from any prior test run in this file.
    const backoff = require('../../../services/inbox/inboxSyncBackoff');
    backoff.recordSuccess('gmail_colaberry');
    backoff.recordSuccess('gmail_personal');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('backs off gmail_colaberry immediately after one failure, without affecting gmail_personal', async () => {
    const { syncAllMailboxes } = require('../../../services/inbox/inboxSyncService');
    const RATE_LIMIT_ERROR = new Error('User-rate limit exceeded.');

    // Every tick: the 1st gmail client created is colaberry's, the 2nd is personal's
    // (matches the fixed call order in syncAllMailboxes). Colaberry's client always
    // rejects for this test; personal's uses the default (empty, successful) mock.
    (require('googleapis').google.gmail as jest.Mock).mockImplementation(() => {
      const client = makeFakeClient();
      const isColaberryThisTick = createdClients.length % 2 === 1;
      if (isColaberryThisTick) {
        client.users.messages.list.mockRejectedValue(RATE_LIMIT_ERROR);
      }
      return client;
    });

    // Tick 1: colaberry's client (index 0) fails, personal's client (index 1) succeeds.
    await syncAllMailboxes();

    expect(createdClients).toHaveLength(2);
    const [colaberryClientTick1, personalClientTick1] = createdClients;
    expect(colaberryClientTick1.users.messages.list).toHaveBeenCalledTimes(1);
    expect(personalClientTick1.users.messages.list).toHaveBeenCalledTimes(1);

    // Tick 2: fires 1 second later (well within the 30s backoff window a single
    // failure opens) — colaberry's client must still be constructed (shouldSkip()
    // gates the sync call, not client construction) but its API must NOT be called
    // again, while personal is attempted exactly as before.
    jest.setSystemTime(new Date('2026-08-01T00:00:01.000Z'));
    await syncAllMailboxes();

    expect(createdClients).toHaveLength(4);
    const [, , colaberryClientTick2, personalClientTick2] = createdClients;
    expect(colaberryClientTick2.users.messages.list).not.toHaveBeenCalled();
    expect(personalClientTick2.users.messages.list).toHaveBeenCalledTimes(1);

    // Tick 3: fires after the 30s backoff window has elapsed — colaberry is
    // attempted again (and fails again, extending its backoff), personal continues
    // unaffected throughout.
    jest.setSystemTime(new Date('2026-08-01T00:00:31.000Z'));
    await syncAllMailboxes();

    expect(createdClients).toHaveLength(6);
    const [, , , , colaberryClientTick3, personalClientTick3] = createdClients;
    expect(colaberryClientTick3.users.messages.list).toHaveBeenCalledTimes(1);
    expect(personalClientTick3.users.messages.list).toHaveBeenCalledTimes(1);
  });
});
