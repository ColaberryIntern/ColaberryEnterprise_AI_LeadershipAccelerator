import {
  TOOL_LIST_ITEM_MAX,
  TOOL_LIST_MAX_ITEMS,
  TOOL_NAME_MAX,
  TOOL_PURPOSE_MAX,
  ToolRequestPayloadSchema,
} from '../agentToolRequestSchema';
import { FileChangeRequestSchema } from '../agentChangeRequestSchema';

/**
 * AF11.1 — the tool-request payload schema.
 *
 * The test carrying the most weight here is the one that looks backwards: **this schema accepts an
 * EMPTY payload**. Presence is decided in exactly one place, `toolRequestContract.ts`, which names
 * the missing field. If a later edit adds a `.min(1)` here, the first test below fails and whoever
 * made the change reads why: AF11.2, AF11.3 and AF11.6 all call the contract rather than this
 * schema, so two definitions of "complete" would mean the console and the API disagreeing about
 * whether a request can be filed.
 */

const ok = (payload: unknown) => ToolRequestPayloadSchema.safeParse(payload);

describe('presence is NOT this file\'s job, and that is deliberate', () => {
  it('accepts an empty payload, leaving every refusal to the contract', () => {
    expect(ok({}).success).toBe(true);
  });

  it('accepts a payload missing the blast-radius field, which the contract then refuses', () => {
    // Proof the two layers are doing different jobs rather than the same one twice.
    expect(ok({ tool_name: 'read_feed' }).success).toBe(true);
  });
});

describe('strictness — a typo is a 400, never a silently dropped field', () => {
  it('refuses an unknown key', () => {
    const result = ok({ purpse: 'typo' });
    expect(result.success).toBe(false);
  });

  it('refuses `domain_key`, which belongs to the parent request and not here', () => {
    // Two copies of the domain could disagree, and only one of them has been ownership-checked.
    expect(ok({ domain_key: 'marketing' }).success).toBe(false);
  });

  it('would have dropped a mistyped blast-radius field silently without .strict()', () => {
    expect(ok({ touchs: ['Basecamp'] }).success).toBe(false);
  });
});

describe('types — a word must never reach a boolean check', () => {
  it('refuses a string for `writes`', () => {
    // `if (d.writes)` would read 'no' as TRUE. This is the field the whole grant decision turns on.
    const result = ok({ writes: 'no' });
    expect(result.success).toBe(false);
  });

  it('refuses a string for `reversible`', () => {
    expect(ok({ reversible: 'maybe' }).success).toBe(false);
  });

  it('refuses a bare string where a list belongs', () => {
    expect(ok({ touches: 'Basecamp' }).success).toBe(false);
  });

  it('refuses a non-uuid agent id', () => {
    expect(ok({ agent_id: 'reese' }).success).toBe(false);
  });

  it('accepts both booleans for `writes`', () => {
    expect(ok({ writes: true }).success).toBe(true);
    expect(ok({ writes: false }).success).toBe(true);
  });
});

describe('the frequency enum is enforced at the boundary too', () => {
  it('accepts a known frequency', () => {
    expect(ok({ run_frequency: 'hourly' }).success).toBe(true);
  });

  it('refuses an invented one and says what is allowed', () => {
    const result = ok({ run_frequency: 'now and then' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('quarterly');
    }
  });
});

describe('lengths — nothing unbounded is persisted', () => {
  it('refuses an over-long tool name', () => {
    expect(ok({ tool_name: 'x'.repeat(TOOL_NAME_MAX + 1) }).success).toBe(false);
  });

  it('accepts one at the limit, so the boundary is off-by-none', () => {
    expect(ok({ tool_name: 'x'.repeat(TOOL_NAME_MAX) }).success).toBe(true);
  });

  it('refuses an over-long purpose', () => {
    expect(ok({ purpose: 'x'.repeat(TOOL_PURPOSE_MAX + 1) }).success).toBe(false);
  });

  it('refuses an over-long list entry', () => {
    expect(ok({ touches: ['x'.repeat(TOOL_LIST_ITEM_MAX + 1)] }).success).toBe(false);
  });

  it('refuses a list with too many entries', () => {
    const many = Array.from({ length: TOOL_LIST_MAX_ITEMS + 1 }, (_, i) => `system ${i}`);
    expect(ok({ touches: many }).success).toBe(false);
  });

  it('trims each list entry, so a padded answer stores clean', () => {
    const result = ok({ touches: ['  Basecamp  '] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.touches).toEqual(['Basecamp']);
  });
});

describe('the payload rides the existing file-a-request body', () => {
  it('accepts `tool_request` on a file request', () => {
    const result = FileChangeRequestSchema.safeParse({
      kind: 'tool',
      domain_key: 'marketing',
      title: 'Read the Skool signal feed',
      tool_request: { tool_name: 'read_skool_signal_feed', writes: false },
    });
    expect(result.success).toBe(true);
  });

  it('still accepts a plain change request with no tool_request at all', () => {
    // AF4.2 callers are unaffected: the frontend sends neither `kind` nor `tool_request`.
    const result = FileChangeRequestSchema.safeParse({
      domain_key: 'marketing',
      title: 'Let an intern rename their own agent',
    });
    expect(result.success).toBe(true);
  });

  it('refuses a typo inside the nested payload rather than dropping it', () => {
    const result = FileChangeRequestSchema.safeParse({
      kind: 'tool',
      domain_key: 'marketing',
      title: 'Read the Skool signal feed',
      tool_request: { tool_nmae: 'read_skool_signal_feed' },
    });
    expect(result.success).toBe(false);
  });
});
