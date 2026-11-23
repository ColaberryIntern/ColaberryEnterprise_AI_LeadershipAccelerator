const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { AGENT_COMMS_STATEMENTS, ensureAgentCommsSchema } from '../ensureAgentCommsSchema';

beforeEach(() => {
  mockQuery.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('agent comms schema', () => {
  it('is additive and idempotent: every statement is IF NOT EXISTS, or a guarded seed', () => {
    for (const sql of AGENT_COMMS_STATEMENTS) {
      expect(sql).not.toMatch(/\b(DROP|ALTER COLUMN|RENAME|TRUNCATE|DELETE)\b/i);
      if (/^(ALTER|CREATE)/i.test(sql)) expect(sql).toMatch(/IF NOT EXISTS/i);
    }
    const seed = AGENT_COMMS_STATEMENTS.find((s) => s.startsWith('UPDATE'))!;
    expect(seed).toContain("WHERE agent_name = 'Maya' AND email_slug IS NULL");
  });

  it('adds the two identity columns, a case-insensitive unique slug, and the agent index', () => {
    const all = AGENT_COMMS_STATEMENTS.join('\n');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS email_slug VARCHAR(40)');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS email_display_name VARCHAR(80)');
    expect(all).toContain('ON ai_agents (lower(email_slug)) WHERE email_slug IS NOT NULL');
    expect(all).toContain("communication_logs ((metadata->>'agent_name'))");
    // T8 hardening: the once-a-day call key is unique among voice rows, so a race places one call.
    expect(all).toContain("CREATE UNIQUE INDEX IF NOT EXISTS communication_logs_voice_idem_uq ON communication_logs ((metadata->>'idempotency_key')) WHERE channel = 'voice'");
  });

  it('runs every statement; one failing does not stop the rest, and it says it is done', async () => {
    mockQuery.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('lock timeout')).mockResolvedValue(undefined);
    await ensureAgentCommsSchema();
    expect(mockQuery).toHaveBeenCalledTimes(AGENT_COMMS_STATEMENTS.length);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith('[DB] agent comms schema ensured');
  });
});
