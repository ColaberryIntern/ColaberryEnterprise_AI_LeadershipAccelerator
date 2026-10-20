/**
 * AF3.1 — the NINE domain employees are registered, and none of them is alive.
 *
 * Nine, not ten, since 20 Oct 2026. There are still TEN DOMAINS; curriculum's employee
 * already existed and is called Dara, so Release Zero never needed to mint one for it.
 * Every assertion on AGENT_DOMAINS elsewhere still reads ten and is untouched.
 *
 * These entries create REAL rows the moment this merges and deploys: the seed's findOrCreate
 * loop runs at boot. So the assertions below are the gate between a reviewed diff and ten live
 * actors, and they are written against the ENTRIES rather than the shared `RELEASE_ZERO` spread
 * they are built from — a test reading the constant proves the constant, while a test reading
 * `DOMAIN_AGENT_ENTRIES[n].enabled` proves what the seed will actually write, and catches an
 * entry that overrides the spread after it.
 */
import { DOMAIN_AGENT_ENTRIES } from '../domainAgents';
import { GROWTH_JOURNEY_AGENT_ENTRIES } from '../growthJourneyAgents';

const NAMES = DOMAIN_AGENT_ENTRIES.map((e) => e.agent_name);

describe('AF3.1 nine domain employees, for the nine domains that needed one', () => {
  it('registers exactly nine', () => {
    expect(DOMAIN_AGENT_ENTRIES).toHaveLength(9);
  });

  it('does NOT register curriculum, because Dara already is it', () => {
    // The pin on Ali's 20 Oct decision. Re-adding an entry named for curriculum would
    // recreate the second agent on the next boot, since the seed findOrCreates on
    // agent_name. Checked by category as well as by name so a rename does not slip past.
    expect(NAMES).not.toContain('CurriculumDomainAgent');
    expect(DOMAIN_AGENT_ENTRIES.map((e) => e.category)).not.toContain('curriculum');
  });

  it('covers every provisioned domain, named consistently', () => {
    expect([...NAMES].sort()).toEqual([
      'AdmissionsDomainAgent', 'ExecutiveDomainAgent',
      'InternshipDomainAgent', 'LearnerSuccessDomainAgent', 'MarketingDomainAgent',
      'PlatformDomainAgent', 'ProductExperienceDomainAgent', 'SalesDomainAgent',
      'WebsiteDomainAgent',
    ]);
  });

  it('uses no name an existing grouped module already claims', () => {
    // agent_name is the registry's identity key. A collision would have one entry silently
    // findOrCreate onto another's row rather than create its own.
    const existing = new Set(GROWTH_JOURNEY_AGENT_ENTRIES.map((e) => e.agent_name));
    expect(NAMES.filter((n) => existing.has(n))).toEqual([]);
    expect(new Set(NAMES).size).toBe(NAMES.length);
  });
});

describe('AF3.1 Release Zero: created, not alive', () => {
  it.each(NAMES)('%s ships disabled', (name) => {
    const e = DOMAIN_AGENT_ENTRIES.find((x) => x.agent_name === name)!;
    // The single assertion standing between this diff and ten live actors.
    expect(e.enabled).toBe(false);
  });

  it.each(NAMES)('%s grants no tools, so autonomy classifies to observe', (name) => {
    const e = DOMAIN_AGENT_ENTRIES.find((x) => x.agent_name === name)!;
    // autonomy_level is NOT settable from a registry entry. The seed calls
    // classifyNewAgentAutonomyLevel on create, and an empty tools array returns the
    // DEFAULT_CLASSIFICATION of `observe`. So an empty array IS the autonomy assertion.
    expect(e.tools_granted).toEqual([]);
  });

  it('gives every entry its OWN tools array, not one shared instance', () => {
    // The floor is a factory rather than a shared constant precisely so this holds. With a
    // shared `tools_granted: []`, granting one agent a tool would grant it to all ten, and
    // every assertion above would still pass while it happened.
    const arrays = DOMAIN_AGENT_ENTRIES.map((e) => e.tools_granted);
    expect(new Set(arrays).size).toBe(DOMAIN_AGENT_ENTRIES.length);

    // Demonstrated, not just counted: pushing into one must not reach another.
    (arrays[0] as string[]).push('probe_tool');
    expect(arrays[1]).toEqual([]);
    (arrays[0] as string[]).length = 0;
  });

  it.each(NAMES)('%s is not a cron and carries no schedule', (name) => {
    const e = DOMAIN_AGENT_ENTRIES.find((x) => x.agent_name === name)!;
    expect(e.trigger_type).not.toBe('cron');
    expect(e.schedule).toBe('');
  });

  it('declares no system prompt, so no conversation path is live yet', () => {
    // A system_prompt makes the manager Talk tab work immediately. R0 is a shell.
    for (const e of DOMAIN_AGENT_ENTRIES) expect(e.system_prompt).toBeUndefined();
  });
});

describe('AF3.1 the entries are honest about what they are', () => {
  it('types all ten as ai_employee, not ai_staff_mentor', () => {
    // The union reserves ai_staff_mentor for Reese's student-DM meaning and added ai_employee
    // for "future employees (#2-#10)". Mislabelling would claim a surface none of them has.
    for (const e of DOMAIN_AGENT_ENTRIES) expect(e.agent_type).toBe('ai_employee');
  });

  it('never categorises a non-sending agent as outbound', () => {
    // 'outbound' means the agent sends. These send nothing, and borrowing the category to
    // inherit its kill switch would misdescribe the row.
    expect(DOMAIN_AGENT_ENTRIES.filter((e) => e.category === 'outbound')).toEqual([]);
  });

  it('says in every description that it is not activated', () => {
    for (const e of DOMAIN_AGENT_ENTRIES) {
      expect(e.description).toMatch(/created but not activated/i);
      expect(e.description).toMatch(/observe/i);
    }
  });

  it('points every entry at a real source directory', () => {
    for (const e of DOMAIN_AGENT_ENTRIES) {
      expect(e.source_file).toBe('backend/src/services/agentDomain/');
    }
  });
});
