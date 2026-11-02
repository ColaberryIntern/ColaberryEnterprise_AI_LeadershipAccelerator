/**
 * AF3.9 -- the domain Command Center as repo documents, and the snapshot a public page reads.
 *
 * Two properties here are load-bearing rather than cosmetic, and both are pinned:
 *
 * 1. **The snapshot carries no clock.** `renderDocs` is explicit that a wall-clock stamp in any
 *    file taking part in the change comparison turns every sync into a commit whose only
 *    difference is the time it was written, churning the builder's history and breaking the
 *    "unchanged implies no commit" guarantee (FR-026). The page reads staleness from the manifest,
 *    which is excluded from that comparison.
 *
 * 2. **Null and zero are different answers.** "No employee yet" and "an employee with nothing
 *    granted" are distinct states, and the story's second acceptance criterion exists precisely
 *    because a panel that cannot tell them apart is the panel that wastes a day.
 */
import {
  domainCommandCenterDoc,
  domainCommandCenterDocPath,
  domainCommandCenterSeed,
  supersededBareCommandCenterDoc,
  BARE_COMMAND_CENTER_DOC_PATH,
} from '../agentDomainCommandCenterDoc';
import {
  AGENT_DOMAIN_SNAPSHOT_PATH,
  AUTONOMY_SET_BY_NOT_RECORDED,
  buildAgentDomainSnapshot,
  notRecordedFor,
  serialiseAgentDomainSnapshot,
  type SnapshotAgentInput,
} from '../agentDomainSnapshot';
import { COMMAND_CENTER_ACCEPTANCE } from '../agentDomainCommandCenterStory';
import { loadDomainMatrix } from '../capabilityRecord';

const DOMAIN = 'platform';
const matrix = loadDomainMatrix(DOMAIN);

const agent: SnapshotAgentInput = {
  agent_id: '11111111-1111-1111-1111-111111111111',
  display_name: 'Ellis',
  enabled: false,
  autonomy_level: 'observe',
  autonomy_level_set_at: '2026-10-18T00:00:00.000Z',
  autonomy_level_source: 'auto',
  tools_granted: [],
};

describe('the seed carries the SIX criteria the portal grades', () => {
  const seed = domainCommandCenterSeed(DOMAIN);

  it('is namespaced, so it cannot collide with another project\'s STORY-000', () => {
    expect(seed.id).toBe('platform.STORY-000');
  });

  it('hangs on the first rung', () => {
    expect(seed.release).toBe('autonomy:R0');
  });

  it('is the SAME six the backfill wrote, not a second copy to drift', () => {
    expect(seed.acceptance).toEqual([...COMMAND_CENTER_ACCEPTANCE]);
    expect(seed.acceptance).toHaveLength(6);
  });
});

describe('the story doc is the domain brief, not the SBP one', () => {
  const doc = domainCommandCenterDoc(DOMAIN);

  it('lands at the namespaced path', () => {
    expect(domainCommandCenterDocPath(DOMAIN)).toBe('docs/stories/platform.STORY-000.md');
  });

  it('names the story id, so a reader can match it to their board', () => {
    expect(doc).toContain('platform.STORY-000');
  });

  it('renders all six criteria as UNTICKED checkboxes', () => {
    for (const c of COMMAND_CENTER_ACCEPTANCE) expect(doc).toContain(`- [ ] ${c}`);
    expect(doc).not.toContain('- [x]');
  });

  it('carries the build prompt, so a cold Claude Code session has it locally', () => {
    // The whole reason STORY-000 needed a doc at all: its prompt lived only on `student_tasks.build`
    // and an agent opening the repo had to author its claims from memory of a page it never saw.
    expect(doc).toContain('The six panels, and the question each one answers');
    expect(doc).toContain('effectiveAuthority()');
  });

  it('states that it fulfils no capability, and why', () => {
    expect(doc).toContain('it is the window onto it');
  });

  it('is deterministic', () => {
    expect(domainCommandCenterDoc(DOMAIN)).toBe(doc);
  });

  it('refuses an unregistered domain rather than inventing one', () => {
    expect(() => domainCommandCenterDoc('not_a_domain')).toThrow();
  });
});

describe('the tombstone explains the file it replaces', () => {
  const tomb = supersededBareCommandCenterDoc(DOMAIN);

  it('sits at the bare path the wrong doc occupies', () => {
    expect(BARE_COMMAND_CENTER_DOC_PATH).toBe('docs/stories/STORY-000.md');
  });

  it('points at the real story and says the old one was written in error', () => {
    expect(tomb).toContain('docs/stories/platform.STORY-000.md');
    expect(tomb).toContain('in error');
  });

  it('tells a builder who already built against five criteria that it was not wasted', () => {
    // They acted in good faith on a file the platform wrote. Saying so is the point.
    expect(tomb).toContain('nothing you did is wasted');
  });
});

describe('the snapshot carries NO clock', () => {
  const built = buildAgentDomainSnapshot({ domain_key: DOMAIN, agent, matrix, governance: [] });
  const text = serialiseAgentDomainSnapshot(built);

  it('has no capture-time field', () => {
    // Any of these would make every sync commit a file whose only change is the time.
    for (const forbidden of ['captured_at', 'generated_at', 'rendered_at', 'synced_at', 'timestamp']) {
      expect(Object.keys(built)).not.toContain(forbidden);
      expect(text).not.toContain(`"${forbidden}"`);
    }
  });

  it('points the page at the manifest for staleness instead', () => {
    expect(built.staleness_note).toContain('manifest.json');
    expect(built.staleness_note).toContain('last changed');
  });

  it('serialises byte-identically on a repeat build, which is what keeps the writer quiet', () => {
    expect(serialiseAgentDomainSnapshot(
      buildAgentDomainSnapshot({ domain_key: DOMAIN, agent, matrix, governance: [] }),
    )).toBe(text);
  });

  it('lives under .colaberry/, inside the platform write allowlist', () => {
    expect(AGENT_DOMAIN_SNAPSHOT_PATH).toBe('.colaberry/agent-domain.json');
  });
});

describe('the snapshot tells "no employee" apart from "an employee with nothing"', () => {
  it('says exists:false when no agent row is linked', () => {
    const built = buildAgentDomainSnapshot({ domain_key: DOMAIN, agent: null, matrix, governance: [] });
    expect((built.agent as { exists: boolean }).exists).toBe(false);
  });

  it('says exists:true with a zero count when the agent holds no tools', () => {
    const built = buildAgentDomainSnapshot({ domain_key: DOMAIN, agent, matrix, governance: [] });
    const a = built.agent as { exists: boolean; tools_granted_count: number; enabled: boolean | null };
    expect(a.exists).toBe(true);
    expect(a.tools_granted_count).toBe(0);
    expect(a.enabled).toBe(false);
  });

  it('names the absent agent as a declared gap, so a panel labels it', () => {
    expect(notRecordedFor(null).map((g) => g.field)).toContain('agent');
  });
});

describe('the snapshot never invents who set autonomy', () => {
  it('reports the field as not recorded, with the schema reason', () => {
    expect(notRecordedFor(agent).map((g) => g.field)).toContain('agent.autonomy_level_set_by');
    expect(AUTONOMY_SET_BY_NOT_RECORDED.reason).toContain('no `set_by` column');
  });

  it('leaves the value null rather than guessing from the source', () => {
    const built = buildAgentDomainSnapshot({ domain_key: DOMAIN, agent, matrix, governance: [] });
    const a = built.agent as { autonomy_level_set_by: string | null; autonomy_level_source: string | null };
    expect(a.autonomy_level_set_by).toBeNull();
    // What IS known is reported: when, and whether a person chose it.
    expect(a.autonomy_level_source).toBe('auto');
  });
});

describe('the snapshot renders the authority effectiveAuthority() returns', () => {
  const built = buildAgentDomainSnapshot({ domain_key: DOMAIN, agent, matrix, governance: [] });
  const authority = built.authority as Array<{ capability_id: string; effective_autonomy: string | null; reasons: string[] }>;

  it('covers every capability in the domain', () => {
    expect(authority).toHaveLength(matrix.capabilities.length);
  });

  it('reports the no_tool_grants rule as binding NOTHING, because today it does', () => {
    // MEASURED, NOT ASSUMED. 0 of 443 capabilities across all ten domains have a
    // `starting_autonomy` above `autonomy:R2` -- every one starts at R0 -- and the cap only fires
    // above R2, so it cannot apply to anything in the programme. The first version of this test
    // asserted the opposite and failed, which is how the fact was found.
    //
    // This is therefore the honest assertion: the rule is reported, its scope is zero, and the
    // page is told to say so. Criterion 4 of the Command Center story describes a state no builder
    // can currently produce; that is a finding on AF3.9, not something to paper over here.
    const rule = built.authority_rule as { approved_above_r2: number; binds_nothing: boolean };
    expect(rule.approved_above_r2).toBe(0);
    expect(rule.binds_nothing).toBe(true);
    expect(authority.every((a) => !a.reasons.includes('no_tool_grants'))).toBe(true);
  });

  it('still caps correctly the moment something IS approved above R2', () => {
    // The rule is not dead code, it is unexercised data. Pinned with a constructed capability so
    // the behaviour is proven now and the page needs no change on the day a human approves one.
    const hypothetical = buildAgentDomainSnapshot({
      domain_key: DOMAIN,
      agent,
      matrix: {
        ...matrix,
        capabilities: [{
          ...matrix.capabilities[0],
          capability_id: 'HYPOTHETICAL',
          starting_autonomy: 'autonomy:R5',
          max_permitted_autonomy: 'autonomy:R7',
          human_decision: false,
        }],
      },
      governance: [],
    });
    const a = (hypothetical.authority as Array<{ effective_autonomy: string; reasons: string[] }>)[0];
    expect(a.reasons).toContain('no_tool_grants');
    expect(a.effective_autonomy).toBe('autonomy:R2');
    expect((hypothetical.authority_rule as { binds_nothing: boolean }).binds_nothing).toBe(false);
  });

  it('every capability in the programme is approved at R0, which is why the cap is quiet', () => {
    expect(matrix.capabilities.every((c) => c.starting_autonomy === 'autonomy:R0')).toBe(true);
  });

  it('marks each ceiling against the rung it stops at, which criterion 3 needs', () => {
    // The ceilings ARE varied (platform: 14 at R5, 13 at R4, 2 at R6, 1 at R7), so criterion 3 is
    // demonstrable even though criterion 4 is not. That asymmetry is the point.
    expect(new Set(matrix.capabilities.map((c) => c.max_permitted_autonomy)).size).toBeGreaterThan(1);
  });

  it('is sorted, so the file does not churn on a reordered read', () => {
    expect(authority.map((a) => a.capability_id))
      .toEqual([...authority.map((a) => a.capability_id)].sort());
  });
});

describe('the governance panel cannot imply a grant happened', () => {
  it('states that filing a request grants nothing', () => {
    const built = buildAgentDomainSnapshot({
      domain_key: DOMAIN,
      agent,
      matrix,
      governance: [{
        id: 'cr-1', kind: 'tool_request', title: 'Grant repo write', status: 'pending',
        requested_at: '2026-10-20T00:00:00.000Z', approved_at: null, declined_reason: null,
      }],
    });
    const g = built.governance as { disclosure: string; pending: number; requests: unknown[] };
    expect(g.disclosure).toContain('grants nothing');
    expect(g.pending).toBe(1);
    expect(g.requests).toHaveLength(1);
  });
});
