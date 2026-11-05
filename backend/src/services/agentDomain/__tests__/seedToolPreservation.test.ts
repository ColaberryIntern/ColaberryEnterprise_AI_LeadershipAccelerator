/**
 * AF3.5 — a granted tool survives the boot seed.
 *
 * This is the test for the defect that would have made the whole ticket theatre:
 * `seedAgentRegistry` rewrote `tools_granted` wholesale from source literals on every boot, and
 * the ten domain agents declare `tools_granted: []`. A grant written on Monday was gone on
 * Tuesday's deploy, and because `maybeReclassifyAutonomyLevel` fires on a change to that
 * column, the revert also rewrote `autonomy_level` and stamped it `auto`.
 */

import fs from 'fs';
import path from 'path';
import { mergePreservedTools, readToolsGranted } from '../seedToolPreservation';

describe('mergePreservedTools — the registry list union what the agent already holds', () => {
  it('keeps a granted tool the registry entry does not mention', () => {
    // THE WHOLE TICKET. A domain agent declares [] and has been granted send_email.
    expect(mergePreservedTools([], ['send_email'])).toEqual(['send_email']);
  });

  it('still adds the registry tools, so the seed keeps self-healing', () => {
    // The behaviour ticketCreatorAgentRegistry.test.ts depends on: an existing row reading []
    // gets the registry's tools written onto it without a migration.
    expect(mergePreservedTools(['create_tickets'], [])).toEqual(['create_tickets']);
  });

  it('keeps both, with the registry first', () => {
    expect(mergePreservedTools(['read_x'], ['send_email'])).toEqual(['read_x', 'send_email']);
  });

  it('does not duplicate a tool that is in both', () => {
    expect(mergePreservedTools(['send_email'], ['send_email'])).toEqual(['send_email']);
  });

  it('is STABLE across repeated boots, which is what stops an autonomy rewrite', () => {
    // maybeReclassifyAutonomyLevel decides "did anything change" with JSON.stringify. A
    // different order on two boots with identical membership would look like a change every
    // time and rewrite autonomy_level for every agent holding a grant.
    const a = mergePreservedTools(['b', 'a'], ['z', 'y']);
    const b = mergePreservedTools(['b', 'a'], ['z', 'y']);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toEqual(['b', 'a', 'z', 'y']);
  });

  it('is a FIXED POINT: feeding its output back in changes nothing', () => {
    // Boot N writes the merged list, and boot N+1 reads that back as the row's current value.
    // If this were not a fixed point the diff would be non-empty forever, and every boot would
    // reclassify every agent.
    const registry = ['read_x'];
    const first = mergePreservedTools(registry, ['send_email']);
    const second = mergePreservedTools(registry, first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('handles the undefined and null cases the seed actually passes', () => {
    expect(mergePreservedTools(undefined, undefined)).toEqual([]);
    expect(mergePreservedTools(['a'], undefined)).toEqual(['a']);
    expect(mergePreservedTools(undefined, ['b'])).toEqual(['b']);
  });

  it('drops blanks rather than writing an empty tool name onto the row', () => {
    expect(mergePreservedTools([], ['', '  ', 'send_email'])).toEqual(['send_email']);
  });

  it('does not mutate the registry array, which is a shared module constant', () => {
    const registry = ['read_x'];
    mergePreservedTools(registry, ['send_email']);
    expect(registry).toEqual(['read_x']);
  });
});

describe('readToolsGranted — jsonb does not promise an array', () => {
  it('reads an array', () => {
    expect(readToolsGranted(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('reads a JSON STRING, because the column has held one', () => {
    // agentEmailTool documents that tools_granted "may be an array, a JSON string, or null
    // depending on who wrote it last". Treating the string as empty would drop every tool the
    // agent held — the exact revert this module exists to prevent.
    expect(readToolsGranted(JSON.stringify(['send_email']))).toEqual(['send_email']);
  });

  it('reads null and nonsense as empty rather than throwing in the boot path', () => {
    expect(readToolsGranted(null)).toEqual([]);
    expect(readToolsGranted(undefined)).toEqual([]);
    expect(readToolsGranted('not json at all')).toEqual([]);
    expect(readToolsGranted('{"a":1}')).toEqual([]);
    expect(readToolsGranted(42)).toEqual([]);
  });
});

describe('the seed actually uses it, and adds no database read to the boot path', () => {
  const SEED = path.join(__dirname, '..', '..', 'agentRegistrySeed.ts');

  it('assigns the merged value, never the bare registry literal', () => {
    const src = fs.readFileSync(SEED, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ');
    expect(src).toMatch(/tools_granted:\s*mergePreservedTools\(/);
    // The bare assignment is what reverted the grant. Its absence is the fix.
    expect(src).not.toMatch(/tools_granted:\s*entry\.tools_granted/);
  });

  it('diffs reclassification against the value that was WRITTEN, not the registry literal', () => {
    // Passing entry.tools_granted to maybeReclassifyAutonomyLevel while writing the merged
    // value would report a change on every boot for every agent holding a grant, and
    // reclassify each of them. The two must be the same value.
    const src = fs.readFileSync(SEED, 'utf8');
    expect(src).toMatch(/maybeReclassifyAutonomyLevel\(agent,\s*previousToolsGranted,\s*seededToolsGranted\)/);
  });

  it('introduces NO query into the seed — the row already knows what it holds', () => {
    // The first implementation read the grant ledger here. That put a database call in the
    // registry seed's boot path, and nine suites that mock only AiAgent waited out a real
    // connection attempt of about 100 seconds each. A unit-test symptom of a production fact.
    const src = fs.readFileSync(SEED, 'utf8');
    expect(src).not.toMatch(/loadRecordedToolGrants/);
    expect(src).not.toMatch(/agent_domain_tool_grants/);
    const helper = fs.readFileSync(path.join(__dirname, '..', 'seedToolPreservation.ts'), 'utf8');
    expect(helper).not.toMatch(/sequelize|QueryTypes|findAll/);
  });
});
