/**
 * Cora dispatch-disposition tests.
 *
 * These cover the two pure functions that decide what happens to a support@
 * email after Cora touches it:
 *   - parseCoraReply: turns the model's JSON into a typed reply, including the
 *     needs_human handoff flag (defaulting safely when absent/odd).
 *   - decideCoraDisposition: the archive-vs-keep-for-human decision table that
 *     fixes the bug where out-of-scope/handoff mail was auto-replied and then
 *     archived with no human ever seeing it.
 *
 * Both are pure (no OpenAI / Gmail / DB), so we pin the happy path, the failure
 * paths, the boundaries, and idempotency directly.
 */
import { parseCoraReply, decideCoraDisposition } from '../coraAgentService';

describe('parseCoraReply', () => {
  it('happy path: parses subject, body, and needs_human=false', () => {
    const r = parseCoraReply(
      JSON.stringify({ subject: 'Re: Pricing', body: 'It is $4,500.', needs_human: false }),
      'Pricing'
    );
    expect(r).toEqual({
      subject: 'Re: Pricing',
      body: 'It is $4,500.',
      needsHuman: false,
      ruleViolations: [],
    });
  });

  it('flags needs_human when the model returns true (boolean and string forms)', () => {
    expect(parseCoraReply(JSON.stringify({ body: 'x', needs_human: true }), 'S').needsHuman).toBe(true);
    expect(parseCoraReply(JSON.stringify({ body: 'x', needs_human: 'true' }), 'S').needsHuman).toBe(true);
  });

  it('defaults needs_human to false when absent or non-boolean (safe for normal replies)', () => {
    expect(parseCoraReply(JSON.stringify({ body: 'x' }), 'S').needsHuman).toBe(false);
    expect(parseCoraReply(JSON.stringify({ body: 'x', needs_human: 1 }), 'S').needsHuman).toBe(false);
    expect(parseCoraReply(JSON.stringify({ body: 'x', needs_human: 'yes' }), 'S').needsHuman).toBe(false);
  });

  it('falls back to "Re: <subject>" and trims a whitespace subject', () => {
    expect(parseCoraReply(JSON.stringify({ body: 'x' }), 'Original').subject).toBe('Re: Original');
    expect(parseCoraReply(JSON.stringify({ subject: '  Hello  ', body: 'x' }), 'Original').subject).toBe('Hello');
  });

  it('failure path: throws on a missing body', () => {
    expect(() => parseCoraReply(JSON.stringify({ subject: 'no body' }), 'S')).toThrow(/Missing body/);
  });

  it('failure path: throws on malformed JSON', () => {
    expect(() => parseCoraReply('not json', 'S')).toThrow();
  });

  // ── compliance-rule enforcement ────────────────────────────────────────────
  // The rules block in the prompt made violations rare (15 of 20 replies down to 2
  // on the 2026-11-15 replay set) but not impossible, and the survivors moved
  // between runs at the same temperature. These cases pin the deterministic half.

  it('reports no violations for a clean reply', () => {
    const r = parseCoraReply(
      JSON.stringify({ body: 'I have passed your request to the team.' }),
      'S'
    );
    expect(r.ruleViolations).toEqual([]);
    expect(r.needsHuman).toBe(false);
  });

  it('forces needsHuman when the body trips a rule, even if the model said false', () => {
    const r = parseCoraReply(
      JSON.stringify({ body: 'The Open House is free to attend.', needs_human: false }),
      'S'
    );
    expect(r.ruleViolations).toEqual(['advertises_free']);
    expect(r.needsHuman).toBe(true);
  });

  it('enforcement is one-way: it adds a human, it never removes one', () => {
    const r = parseCoraReply(
      JSON.stringify({ body: 'A person will follow up.', needs_human: true }),
      'S'
    );
    expect(r.ruleViolations).toEqual([]);
    expect(r.needsHuman).toBe(true);
  });

  it('reports every rule a reply trips', () => {
    const r = parseCoraReply(
      JSON.stringify({
        body: 'We do not offer refunds. Your account has been deleted. Feel free to ask.',
      }),
      'S'
    );
    expect(r.ruleViolations).toEqual([
      'advertises_free',
      'states_refund_policy',
      'confirms_action',
    ]);
    expect(r.needsHuman).toBe(true);
  });
});

describe('decideCoraDisposition — archive vs keep-for-human', () => {
  it('in-scope reply sent => archive (fully resolved)', () => {
    expect(decideCoraDisposition({ generated: true, dryRun: false, needsHuman: false, sent: true })).toEqual({
      archive: true,
    });
  });

  it('needs_human handoff => keep for human, never archived', () => {
    expect(decideCoraDisposition({ generated: true, dryRun: false, needsHuman: true, sent: true })).toEqual({
      archive: false,
      handoffReason: 'cora_handoff_human_review',
    });
  });

  it('send failed => keep for human (sender got no reply)', () => {
    expect(decideCoraDisposition({ generated: true, dryRun: false, needsHuman: false, sent: false })).toEqual({
      archive: false,
      handoffReason: 'cora_send_failed',
    });
  });

  it('generation failed => keep for human (never bury an unanswered email)', () => {
    expect(decideCoraDisposition({ generated: false, dryRun: false, needsHuman: false, sent: false })).toEqual({
      archive: false,
      handoffReason: 'cora_generation_failed',
    });
  });

  it('dry run => archive (no real send; preserves shadow-test behavior)', () => {
    expect(decideCoraDisposition({ generated: true, dryRun: true, needsHuman: false, sent: false }).archive).toBe(true);
    // needs_human is irrelevant in dry run — nothing real was sent or archived for keeps.
    expect(decideCoraDisposition({ generated: true, dryRun: true, needsHuman: true, sent: false }).archive).toBe(true);
  });

  it('boundary: a handoff takes precedence over a failed send', () => {
    // needs_human is checked before send outcome — an intended handoff routes to a
    // human regardless of whether the acknowledgement send succeeded.
    expect(decideCoraDisposition({ generated: true, dryRun: false, needsHuman: true, sent: false })).toEqual({
      archive: false,
      handoffReason: 'cora_handoff_human_review',
    });
  });

  it('idempotent: same input yields an identical decision', () => {
    const input = { generated: true, dryRun: false, needsHuman: true, sent: true };
    expect(decideCoraDisposition(input)).toEqual(decideCoraDisposition(input));
  });
});
