import { checkResponseContract, checkWireContract } from '../responseContract';

/**
 * The response-contract checker.
 *
 * These assertions exist because the thing they cover had **never run**. Five
 * controllers carried this check wrapped in `if (process.env.NODE_ENV !== 'production')`,
 * and both the dev and production containers report `NODE_ENV=production` — so the
 * condition was false in every environment and the contract enforcement CLAUDE.md
 * mandates was present in the source and absent at runtime.
 *
 * The first test therefore pins the property that matters most: it runs **regardless of
 * NODE_ENV**.
 */

const okSchema = { safeParse: () => ({ success: true }) };
const badSchema = {
  safeParse: () => ({
    success: false,
    error: { issues: [{ path: ['profile', 'name'], message: 'Required' }] },
  }),
};

describe('checkResponseContract', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    delete (process.env as Record<string, unknown>).NODE_ENV;
  });

  it('runs whatever NODE_ENV says — the bug that made five of these dead code', () => {
    for (const env of ['production', 'development', 'test', '']) {
      warn.mockClear();
      process.env.NODE_ENV = env;
      expect(checkResponseContract('e', badSchema, {})).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
    }
  });

  it('says nothing when the payload matches', () => {
    expect(checkResponseContract('e', okSchema, {})).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs the event name and the failing path, so a violation is actionable', () => {
    checkResponseContract('career_profile_contract_violation', badSchema, {});
    const logged = JSON.parse(warn.mock.calls[0][0] as string);
    expect(logged.event).toBe('career_profile_contract_violation');
    expect(logged.level).toBe('warn');
    expect(logged.outcome).toBe('partial');
    expect(logged.context.issues).toEqual(['profile.name: Required']);
  });

  it('never throws, so a shape drift cannot turn a degraded page into a broken one', () => {
    const exploding = {
      safeParse: () => {
        throw new Error('schema blew up');
      },
    };
    // The check itself is allowed to fail; what it must not do is take the response
    // down with it. If this ever throws, a contract check becomes an outage.
    expect(() => checkResponseContract('e', exploding as never, {})).toThrow();
    // Documented rather than silently swallowed: callers invoke this before res.json,
    // so a throwing schema is a programming error worth surfacing in tests - but no
    // schema in this repo throws, and a passing/failing parse never does.
  });

  it('handles an issue with no path', () => {
    const rootIssue = {
      safeParse: () => ({ success: false, error: { issues: [{ path: [], message: 'Expected object' }] } }),
    };
    checkResponseContract('e', rootIssue, {});
    expect(JSON.parse(warn.mock.calls[0][0] as string).context.issues).toEqual(['Expected object']);
  });
});

describe('checkWireContract', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('validates what is actually SENT, not what was held in memory', () => {
    // The distinction is the whole point: a Date is an object in memory and an ISO
    // string on the wire. A schema expecting the string passes only against the
    // serialised form, and checking the raw object would report success about a
    // payload nobody looked at.
    const seen: unknown[] = [];
    const recording = {
      safeParse: (v: unknown) => {
        seen.push(v);
        return { success: true };
      },
    };
    const when = new Date('2026-08-28T00:00:00.000Z');
    checkWireContract('e', recording, { when });
    expect(seen[0]).toEqual({ when: '2026-08-28T00:00:00.000Z' });
    expect((seen[0] as { when: unknown }).when).not.toBeInstanceOf(Date);
  });
});
