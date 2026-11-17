/**
 * AF11.11 — the payload the FORM sends has to be a payload the schema accepts.
 *
 * ## Why this suite exists, and what it caught
 *
 * `ToolRequestForm` is the first caller of `ToolRequestPayloadSchema` in the product. Writing it
 * surfaced a trap: the three write-only fields are `.optional()` and NOT `.nullable()`, so an
 * explicit `null` is a shape error, while OMITTING them is accepted and
 * `acceptToolRequest` then stores `null` for exactly those cases:
 *
 *   side_effects: writes ? text(d.side_effects) : null
 *
 * The form's first version sent `{ side_effects: null, reversible: null, reversibility_note: null }`
 * for a read-only tool, reasoning from `ToolRequestDetailInput`, whose TypeScript type DOES allow
 * `string | null`. That type describes what the contract reads; the Zod schema describes what the
 * wire accepts, and they are not the same. Every read-only tool request would have been refused
 * with an unhelpful shape error on a field the builder was never shown.
 *
 * So these tests pin the ACTUAL wire contract rather than the TypeScript interface, in both
 * directions, because a form and a schema that disagree about `null` is the kind of thing that only
 * shows up on the first real submission.
 */

import { ToolRequestPayloadSchema } from '../agentToolRequestSchema';

/**
 * What the form sends for a read-only tool, with the three write-only fields OMITTED.
 *
 * The agent id is a REAL v4 UUID: this schema's `.uuid()` checks the version and variant nibbles,
 * so `11111111-1111-1111-...` is refused. Worth knowing when writing a fixture, because the
 * refusal reads as "the agent has to be identified by its id" and looks like a missing field.
 */
const READ_ONLY = {
  agent_id: '11111111-1111-4111-8111-111111111111',
  tool_name: 'read_cron_registry',
  purpose: 'Read the cron registry so the agent can tell which jobs are scheduled.',
  reads: ['the cron registry table'],
  produces: ['a list of scheduled jobs'],
  read_datasets: [],
  touches: ['postgres'],
  inputs: [],
  capability_id: 'platform.read_cron_registry',
  task_unblocked: 'Checking the schedule by hand every morning.',
  manual_today: 'Somebody opens the table and reads it.',
  acts_on_output: 'ali@colaberry.com',
  judged_threshold: '8 of 10 checks need no follow-up',
  judged_measured_from: 'The cron run log.',
  missing_from_product: 'There is no screen that lists scheduled jobs.',
  needed_by: '2026-12-01',
  tried_in_product: 'not_built' as const,
  run_frequency: 'daily' as const,
  environment: 'sandbox' as const,
  writes: false,
};

describe('THE TRAP: optional is not nullable', () => {
  it('REFUSES an explicit null on the three write-only fields', () => {
    const r = ToolRequestPayloadSchema.safeParse({
      ...READ_ONLY,
      side_effects: null,
      reversible: null,
      reversibility_note: null,
    });
    // This is the assertion that proves the form must omit them rather than null them.
    expect(r.success).toBe(false);
  });

  it('ACCEPTS them omitted, which is what a read-only tool sends', () => {
    const r = ToolRequestPayloadSchema.safeParse(READ_ONLY);
    if (!r.success) {
      throw new Error(`refused: ${JSON.stringify(r.error.issues.map((i) => ({ p: i.path, m: i.message })))}`);
    }
    expect(r.success).toBe(true);
  });

  it('names the fields it refused, so a null is diagnosable', () => {
    const r = ToolRequestPayloadSchema.safeParse({ ...READ_ONLY, side_effects: null });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('side_effects');
    }
  });
});

describe('the payload a WRITING tool sends', () => {
  it('is accepted with all three fields present', () => {
    const r = ToolRequestPayloadSchema.safeParse({
      ...READ_ONLY,
      writes: true,
      side_effects: 'It disables a scheduled job.',
      reversible: true,
      reversibility_note: 'Re-enable it from the same screen.',
    });
    expect(r.success).toBe(true);
  });

  it('is accepted when the reversibility note is omitted, since only the boolean is required', () => {
    // The contract requires `side_effects` and `reversible` on a writing tool and leaves the note
    // free, so the form must not be forced to invent one.
    const r = ToolRequestPayloadSchema.safeParse({
      ...READ_ONLY,
      writes: true,
      side_effects: 'It disables a scheduled job.',
      reversible: false,
    });
    expect(r.success).toBe(true);
  });
});

describe('the empty-list payload, which is a real answer rather than a missing one', () => {
  it('accepts empty arrays for every list the form always sends', () => {
    const r = ToolRequestPayloadSchema.safeParse({
      ...READ_ONLY,
      reads: [],
      produces: [],
      read_datasets: [],
      touches: [],
      inputs: [],
    });
    // The contract distinguishes absent from empty, so the form sends `[]` and the schema has to
    // let it through for the contract to be the one that judges it.
    expect(r.success).toBe(true);
  });
});

describe('the enums the form omits until chosen', () => {
  it('accepts a payload with the three enums absent', () => {
    const partial = { ...READ_ONLY } as Record<string, unknown>;
    delete partial.tried_in_product;
    delete partial.run_frequency;
    delete partial.environment;
    delete partial.writes;
    // Omitting them lets the CONTRACT answer `*_missing` and name the field, rather than Zod
    // rejecting an empty string as an invalid enum value.
    expect(ToolRequestPayloadSchema.safeParse(partial).success).toBe(true);
  });

  it('REFUSES an empty string in their place, which is why the form omits them', () => {
    for (const field of ['tried_in_product', 'run_frequency', 'environment']) {
      const r = ToolRequestPayloadSchema.safeParse({ ...READ_ONLY, [field]: '' });
      expect({ field, ok: r.success }).toEqual({ field, ok: false });
    }
  });
});

describe('strictness, which is why the form uses the catalog field names exactly', () => {
  it('refuses a field the schema does not declare', () => {
    // `.strict()` is the house rule: a silently ignored instruction is worse than a 400. A form
    // that renamed a field would be told, rather than filing a request with a blank where the
    // answer was typed.
    const r = ToolRequestPayloadSchema.safeParse({ ...READ_ONLY, purpse: 'typo' });
    expect(r.success).toBe(false);
  });

  it('refuses a domain_key on the payload, because the parent request owns it', () => {
    const r = ToolRequestPayloadSchema.safeParse({ ...READ_ONLY, domain_key: 'marketing' });
    expect(r.success).toBe(false);
  });
});
