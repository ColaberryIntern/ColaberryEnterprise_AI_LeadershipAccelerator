/**
 * AF3.1 criterion 5 — "A test asserts the path never writes autonomy_level above observe,
 * WITH A POSITIVE CONTROL."
 *
 * ## Why the control is the whole point
 *
 * `domainAgents.test.ts` asserts every entry ships `tools_granted: []`, and the seed classifies
 * autonomy from exactly that array. But an assertion that empty tools yield `observe` proves
 * nothing on its own: it passes identically if the classifier is broken and returns `observe`
 * for everything. A test that cannot distinguish a working guard from a dead one is the shape
 * this session has already been bitten by three times.
 *
 * So this file asserts BOTH directions against the real classifier the seed calls:
 *
 *   negative (the live case)  []                  -> observe
 *   POSITIVE CONTROL          ['send_email']      -> communicate, well above observe
 *                             ['create_ticket']   -> act_audited
 *                             ['propose_change']  -> suggest
 *
 * If the positive control ever returns `observe`, the classifier has stopped discriminating and
 * every "ships at observe" claim in this programme becomes unfalsifiable -- including the ten
 * rows already live in production.
 */
import { classifyAgentAutonomyLevel } from '../../agentCapabilityClassifier';
import { DOMAIN_AGENT_ENTRIES } from '../domainAgents';

/** Ranked lowest to highest, so "above observe" is an ordering question, not a string compare. */
const LADDER = ['observe', 'suggest', 'act_audited', 'communicate'] as const;
const rank = (level: string) => LADDER.indexOf(level as typeof LADDER[number]);

describe('AF3.1 criterion 5: Release Zero never classifies above observe', () => {
  it('every entry carries the empty tools array the classification depends on', () => {
    for (const e of DOMAIN_AGENT_ENTRIES) expect(e.tools_granted).toEqual([]);
  });

  it.each(DOMAIN_AGENT_ENTRIES.map((e) => e.agent_name))(
    '%s classifies to observe from what it actually ships', (name) => {
      const entry = DOMAIN_AGENT_ENTRIES.find((e) => e.agent_name === name)!;
      // The real classifier, fed the real entry's real array. Not a restated constant.
      const { level } = classifyAgentAutonomyLevel(entry.tools_granted ?? []);
      expect(level).toBe('observe');
      expect(rank(level)).toBe(0);
    });

  it('gives the honest reason, not a guess', () => {
    const { reason, matchedTool } = classifyAgentAutonomyLevel([]);
    expect(matchedTool).toBeNull();
    expect(reason).toMatch(/no tools_granted/i);
  });
});

describe('AF3.1 criterion 5: THE POSITIVE CONTROL — the classifier can go higher', () => {
  // Without these, "observe" might just be the only answer the classifier knows.
  const CASES: Array<[string, string]> = [
    ['send_email', 'communicate'],
    ['respond_to_dm', 'communicate'],
    ['create_ticket', 'act_audited'],
    ['delete_record', 'act_audited'],
    ['propose_change', 'suggest'],
  ];

  it.each(CASES)('a real tool named %s classifies to %s, above observe', (tool, expected) => {
    const { level } = classifyAgentAutonomyLevel([tool]);
    expect(level).toBe(expected);
    expect(rank(level)).toBeGreaterThan(rank('observe'));
  });

  it('takes the HIGHEST tool when several are granted', () => {
    // The property that makes a single dangerous tool decisive rather than averaged away.
    const { level } = classifyAgentAutonomyLevel(['read_rows', 'propose_change', 'send_email']);
    expect(level).toBe('communicate');
  });

  it('so observe is EARNED: adding one tool to a Release Zero entry would raise it', () => {
    // The control stated as the thing it actually protects. Take a real shipped entry, add one
    // tool, and watch the level move -- which is why `tools_granted: []` is load-bearing and not
    // decoration.
    const entry = DOMAIN_AGENT_ENTRIES[0];
    const asShipped = classifyAgentAutonomyLevel(entry.tools_granted ?? []);
    const withOneTool = classifyAgentAutonomyLevel([...(entry.tools_granted ?? []), 'send_email']);
    expect(asShipped.level).toBe('observe');
    expect(withOneTool.level).toBe('communicate');
    expect(rank(withOneTool.level)).toBeGreaterThan(rank(asShipped.level));
  });
});
