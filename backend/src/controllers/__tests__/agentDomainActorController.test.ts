/**
 * AF11.11 — the people picker behind `acts_on_output`.
 *
 * The one property worth a test: an UNREADABLE roster is reported as unreadable, never as an empty
 * list. `loadActorRoster` cannot reject, so the only way the distinction survives to the screen is
 * if this handler passes `roster_absent` through rather than flattening it. A picker that drew an
 * empty list from a database hiccup would tell a builder there is nobody to send output to, and the
 * gate would then refuse whatever they typed instead.
 */

const mockLoadActorRoster = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: {} }));
jest.mock('../../services/agentDomain/actorRoster', () => ({
  loadActorRoster: (...args: unknown[]) => mockLoadActorRoster(...args),
}));

import { handleListAgentDomainActors } from '../agentDomainActorController';

function res() {
  const body: { json?: unknown; status?: number } = {};
  const r: any = {
    json: (v: unknown) => { body.json = v; return r; },
    status: (s: number) => { body.status = s; return r; },
  };
  return { r, body };
}

const req = (email = 'sarbjit@colaberry.com') => ({ admin: { email } }) as any;

let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => { logSpy.mockRestore(); });

describe('a readable roster', () => {
  beforeEach(() => {
    mockLoadActorRoster.mockResolvedValue({
      emails: ['ali@colaberry.com', 'kes@colaberry.com'],
      roster_absent: false,
    });
  });

  it('returns the addresses, and says they are the accepted ones', async () => {
    const { r, body } = res();
    await handleListAgentDomainActors(req(), r);
    const out = body.json as { actors: string[]; roster_absent: boolean; note: string };
    expect(out.actors).toEqual(['ali@colaberry.com', 'kes@colaberry.com']);
    expect(out.roster_absent).toBe(false);
    expect(out.note).toContain('has to be one of these');
  });

  it('answers 200, so the picker is never rendered from an error path', async () => {
    const { r, body } = res();
    await handleListAgentDomainActors(req(), r);
    // `status` is never called, which leaves Express on its 200 default.
    expect(body.status).toBeUndefined();
  });

  it('returns EMAILS ONLY and no other column about a person', async () => {
    const { r, body } = res();
    await handleListAgentDomainActors(req(), r);
    const out = body.json as Record<string, unknown>;
    // The payload is the three keys and nothing else: a people list that grew a name, a phone
    // number or a role would be a wider disclosure than this field needs.
    expect(Object.keys(out).sort()).toEqual(['actors', 'note', 'roster_absent']);
    for (const actor of out.actors as unknown[]) {
      expect(typeof actor).toBe('string');
    }
  });
});

describe('THE CASE THAT MATTERS: an unreadable roster', () => {
  beforeEach(() => {
    mockLoadActorRoster.mockResolvedValue({ emails: [], roster_absent: true });
  });

  it('says it is MISSING rather than empty', async () => {
    const { r, body } = res();
    await handleListAgentDomainActors(req(), r);
    const out = body.json as { actors: string[]; roster_absent: boolean; note: string };
    expect(out.roster_absent).toBe(true);
    expect(out.actors).toEqual([]);
    // The sentence has to carry the distinction, because a caller rendering only `actors` would
    // otherwise show "nobody".
    expect(out.note).toContain('missing rather than empty');
  });

  it('tells the reader they may still type an address, and that it is checked on filing', async () => {
    const { r, body } = res();
    await handleListAgentDomainActors(req(), r);
    const out = body.json as { note: string };
    // A dead end here would mean a builder cannot file at all during a database hiccup.
    expect(out.note).toContain('type an address');
    expect(out.note).toContain('checked when you file');
  });

  it('still answers 200, because the request succeeded and the ROSTER is what failed', async () => {
    const { r, body } = res();
    await handleListAgentDomainActors(req(), r);
    expect(body.status).toBeUndefined();
  });

  it('logs it as a partial outcome, so it is diagnosable without being a 500', async () => {
    const { r } = res();
    await handleListAgentDomainActors(req(), r);
    const line = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(line.outcome).toBe('partial');
    expect(line.level).toBe('warn');
    expect(line.event).toBe('agent_domain_actor_roster_read');
  });
});

describe('the log line', () => {
  it('records the caller and the count on a success', async () => {
    mockLoadActorRoster.mockResolvedValue({ emails: ['ali@colaberry.com'], roster_absent: false });
    const { r } = res();
    await handleListAgentDomainActors(req('mihret@colaberry.com'), r);
    const line = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(line.actor_email).toBe('mihret@colaberry.com');
    expect(line.context.returned).toBe(1);
    expect(line.outcome).toBe('success');
  });

  it('never fails on a request with no identity on it', async () => {
    mockLoadActorRoster.mockResolvedValue({ emails: [], roster_absent: true });
    const { r, body } = res();
    await handleListAgentDomainActors({} as any, r);
    expect(body.json).toBeDefined();
    const line = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(line.actor_email).toBe('');
  });
});
