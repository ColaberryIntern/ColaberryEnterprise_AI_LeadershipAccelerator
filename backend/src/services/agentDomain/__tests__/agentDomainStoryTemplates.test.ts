import {
  RESEARCH_PREFIXES,
  planForAllDomains,
  planForDomain,
  type GeneratedStory,
} from '../agentDomainStoryTemplates';
import { AGENT_DOMAINS } from '../agentDomainRegistry';
import {
  DENIED_CAPABILITIES,
  allCapabilities,
  assertDraftOnlyInvariant,
  loadAllMatrices,
} from '../capabilityRecord';

const plans = planForAllDomains();
const everyStory: GeneratedStory[] = plans.flatMap((p) => [...p.stories]);

describe('the generator produced real content, so a clean sweep means something', () => {
  it('covers all ten domains', () => {
    expect(plans).toHaveLength(10);
    expect(plans.map((p) => p.domain_key).sort())
      .toEqual(AGENT_DOMAINS.map((d) => d.domain_key).sort());
  });

  it('produced a substantial number of stories', () => {
    // A near-empty result would make every absence assertion below vacuously true.
    expect(everyStory.length).toBeGreaterThan(400);
  });

  it('every domain has the ten rungs, then the three originals kept empty', () => {
    // Exact equality, and in this order, because the order IS the board: positions 0-9 are the
    // ladder and 10-12 are the superseded workstreams sitting below it. An intern opening the
    // board must land on the rung they are on, not on three empty lists.
    const expected = [
      'autonomy:R0', 'autonomy:R1', 'autonomy:R2', 'autonomy:R3', 'autonomy:R4',
      'autonomy:R5', 'autonomy:R6', 'autonomy:R7', 'autonomy:R8', 'autonomy:R9',
      'r0', 'r1', 'r2',
    ];
    for (const p of plans) {
      expect(p.releases.map((r) => r.cluster)).toEqual(expected);
      expect(p.releases.map((r) => r.position)).toEqual([...Array(13).keys()]);
    }
  });

  it('the three original releases are KEPT, which is what makes this reversible', () => {
    // `AUTONOMY_RELEASE_MIGRATION.md` relies on them: "They end up empty, and they are the
    // rollback path: one UPDATE puts every story back." Dropping them would make the migration
    // one-way, so their survival is asserted rather than assumed.
    for (const p of plans) {
      for (const cluster of ['r0', 'r1', 'r2']) {
        expect(p.releases.map((r) => r.cluster)).toContain(cluster);
      }
      // And nothing is generated into them any more.
      expect(p.stories.filter((s) => ['r0', 'r1', 'r2'].includes(s.release_key))).toHaveLength(0);
    }
  });

  it('a kept release and its rung are NOT spelled the same', () => {
    // The migration design names this as "most of why this drifted": lowercase `r0/r1/r2` looks
    // exactly like the ladder and is a different axis. `r0` and `autonomy:R0` now coexist in one
    // project, and the only reason that is safe is that they are distinct strings. There is also
    // a `(project_id, cluster)` unique index that a collision would hit.
    for (const p of plans) {
      const clusters = p.releases.map((r) => r.cluster);
      expect(new Set(clusters).size).toBe(clusters.length);
      expect(clusters).not.toContain('R0');
    }
  });
});

describe('the owner five research stories exist in every domain', () => {
  for (const prefix of RESEARCH_PREFIXES) {
    it(`every domain has ${prefix}`, () => {
      for (const p of plans) {
        const match = p.stories.filter((s) => s.story_id.endsWith(`.${prefix}`));
        // Matched on a stable prefix, never on title text, so rewording a title cannot break this.
        expect(match).toHaveLength(1);
      }
    });
  }

  it('each domain has exactly five research stories and one legacy plan', () => {
    for (const p of plans) {
      expect(p.stories.filter((s) => s.kind === 'research')).toHaveLength(5);
      expect(p.stories.filter((s) => s.kind === 'legacy_migration')).toHaveLength(1);
    }
  });

  it('POSITIVE CONTROL: a fabricated prefix is absent', () => {
    expect(everyStory.some((s) => s.story_id.endsWith('.RESEARCH-6-DOES-NOT-EXIST'))).toBe(false);
  });
});

describe('story 4 creates project work and sends nothing', () => {
  const story4 = plans.map((p) => p.stories.find((s) => s.story_id.endsWith(`.${RESEARCH_PREFIXES[3]}`))!);

  it('exists for every domain', () => {
    expect(story4.filter(Boolean)).toHaveLength(10);
  });

  it('carries no scheduling link, invite or attendee list', () => {
    for (const s of story4) {
      const t = `${s.title} ${s.body}`.toLowerCase();
      // A scheduling URL is unambiguous: there is no innocent reason for one here.
      expect(t).not.toMatch(/calendly|\.ics\b|meet\.google|zoom\.us|teams\.microsoft/);
      // Same negation rule as 'attendee' below, for the same reason: this story's own text says
      // "complete when the agenda exists -- NOT when a meeting is booked". Three checks in this
      // file have now tripped on their own denial, which is the standing lesson: a prose-absence
      // check must distinguish a claim from its refutation, or it only measures vocabulary.
      for (const m of t.matchAll(/invite sent|meeting is booked|meeting booked|scheduled for/g)) {
        const before = t.slice(Math.max(0, (m.index as number) - 28), m.index as number);
        expect(before).toMatch(/\bno\b|\bnot\b|without|never/);
      }
      // "attendee" needs care: this story's own disclaimer says "no attendee list", and an earlier
      // version of this check failed on exactly that -- the same false positive as a detector
      // matching a term inside a comment. So require every mention to be NEGATED.
      for (const m of t.matchAll(/\battendees?\b/g)) {
        const before = t.slice(Math.max(0, (m.index as number) - 24), m.index as number);
        expect(before).toMatch(/\bno\b|\bnot\b|without/);
      }
    }
  });

  it('says explicitly that it sends nothing', () => {
    for (const s of story4) {
      expect(s.body).toMatch(/sends nothing|No calendar invite/i);
    }
  });

  it('POSITIVE CONTROL: the sweep catches a planted booking claim', () => {
    const planted = 'the meeting is booked for Tuesday, attendees: Ali';
    expect(planted).toMatch(/\battendees?\b/);
    expect(planted).toMatch(/meeting is booked/);
  });

  it('no module in this directory imports a mail, calendar or Basecamp client', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const dir = path.join(__dirname, '..');
    const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(3); // the sweep has something to look at
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      // Check IMPORT STATEMENTS, not the whole file. An earlier version swept the text for
      // /calendar/i and failed on this module's own prose ("no calendar invite") -- a sweep that
      // flags a file for DESCRIBING a thing it refuses to do is measuring the wrong object.
      // Match module SPECIFIERS, not statement LINES. The line filter this replaced only ever
      // saw the FIRST PHYSICAL LINE of an import, and every import in this directory is
      // multi-line -- so its whole view of this module was ["import {", "import {"], and a
      // verifier slipped a multi-line `from '../emailService'` past all 40 tests. The specifier
      // is the fact the rule is about, and no formatting can hide it.
      // The full sweep with its positive controls lives in agentDomainStoryIntegrity.test.ts.
      const specifiers = [...src.matchAll(/(?:from|require\s*\(|import\s*\()\s*['"]([^'"]+)['"]/g)]
        .map((m) => m[1])
        .join(' ');
      expect(specifiers).not.toMatch(/emailService|nodemailer|mandrill/i);
      expect(specifiers).not.toMatch(/basecamp/i);
      expect(specifiers).not.toMatch(/googleapis|calendar|synthflow|twilio/i);
    }
  });
});

describe('prompts are domain-specific, never shared boilerplate', () => {
  const impl = everyStory.filter((s) => s.kind === 'implementation');

  it('every implementation story carries a prompt', () => {
    expect(impl.length).toBeGreaterThan(400);
    for (const s of impl) expect(s.claude_code_prompt.length).toBeGreaterThan(400);
  });

  it('no two capabilities produce the SAME prompt body', () => {
    // The anti-boilerplate check. A template would collide here immediately.
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const s of impl) {
      const prev = seen.get(s.claude_code_prompt);
      if (prev) dupes.push(`${prev} == ${s.story_id}`);
      else seen.set(s.claude_code_prompt, s.story_id);
    }
    expect(dupes).toEqual([]);
  });

  it('each prompt names its own capability and domain', () => {
    for (const s of impl) {
      expect(s.claude_code_prompt).toContain(s.capability_id!);
    }
  });

  it('each prompt carries the three things the amendment requires', () => {
    for (const s of impl) {
      expect(s.claude_code_prompt).toContain('The human-operable process');
      expect(s.claude_code_prompt).toContain('The tool interface');
      expect(s.claude_code_prompt).toContain('The agent behaviour that uses it');
    }
  });

  it('every prompt refuses the four non-promoting signals', () => {
    for (const s of impl) {
      expect(s.claude_code_prompt).toMatch(/None of these count/);
      expect(s.claude_code_prompt).toMatch(/elapsed time/);
      expect(s.claude_code_prompt).toMatch(/mocked test/);
    }
  });

  it('a human-decision capability says so in its prompt, in those words', () => {
    const humanOnes = impl.filter((s) => s.claude_code_prompt.includes('THIS IS A HUMAN DECISION'));
    // 205 of 443 capabilities are human-reserved; the prompts must carry that through.
    expect(humanOnes.length).toBeGreaterThan(150);
    for (const s of humanOnes) {
      expect(s.claude_code_prompt).toMatch(/may never decide/);
    }
  });
});

describe('nothing is validated, and nothing claims to be', () => {
  it('every story is draft', () => {
    for (const s of everyStory) expect(s.status).toBe('draft');
  });

  it('every capability record is draft -- shipped behaviour is not validation', () => {
    expect(() => assertDraftOnlyInvariant()).not.toThrow();
  });

  it('the expected count of confirmed capabilities is ZERO, and that is reported not hidden', () => {
    const confirmed = allCapabilities().filter((c) => c.requirement_validation_state === 'confirmed');
    expect(confirmed).toHaveLength(0);
  });

  it('every story names who must validate it', () => {
    for (const s of everyStory) {
      expect(s.validation_dependency.length).toBeGreaterThan(10);
    }
  });
});

describe('every implementation story traces to a capability, or justifies not doing so', () => {
  // The two kinds that trace to one capability. `release_behaviour` joined them at Phase 2: a
  // per-rung story is one capability's behaviour at one authority level, so it is traced exactly
  // like the capability story it hangs off. This used to read `kind !== 'implementation'`, which
  // meant "the shared-foundation stories" only for as long as there were no other traced kinds --
  // it is spelled out now so adding a kind cannot quietly change what the test asserts.
  const TRACED_KINDS = ['implementation', 'release_behaviour'];

  it('no untraced story of a traced kind exists', () => {
    const untraced = everyStory.filter(
      (s) => TRACED_KINDS.includes(s.kind) && !s.capability_id,
    );
    expect(untraced).toEqual([]);
  });

  it('every shared-foundation story gives a reason instead', () => {
    const shared = everyStory.filter((x) => !TRACED_KINDS.includes(x.kind));
    // 7 per domain: the Command Center, the five research stories and the legacy migration plan.
    expect(shared).toHaveLength(70);
    for (const s of shared) {
      expect(s.capability_id).toBeNull();
      expect(s.shared_foundation_reason).toBeTruthy();
    }
  });

  it('every traced capability_id is a real capability', () => {
    const real = new Set(allCapabilities().map((c) => c.capability_id));
    for (const s of everyStory) {
      if (s.capability_id) expect(real.has(s.capability_id)).toBe(true);
    }
  });

  it('story ids are unique across all ten domains', () => {
    const ids = everyStory.map((s) => s.story_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('no story claims a capability this platform does not have', () => {
  const BANNED = [
    'test lab', 'sandbox is ready', 'agent-to-agent', 'agent to agent',
    'delegates to another agent', 'hands off to another agent',
  ];

  /**
   * Mentioning an absent capability is only an offence when it is CLAIMED. A story that says
   * "agent-to-agent handoff is absent, so autonomy:R8 is unreachable" is doing exactly what this
   * programme asks for.
   *
   * An earlier version of this test knew only "does not exist|never exist|not available|is
   * absent|would require" and flagged four stories that were disclosing correctly in other words:
   * "no agent-to-agent handoff protocol exists", "R8 ... are withheld", "unreachable by fact rather
   * than by choice". The test was blunt, not the content -- so the vocabulary is widened rather
   * than the rule weakened.
   */
  const DISCLOSURE = new RegExp([
    'does not exist', 'never exist', 'no .{0,40}exists', 'not available',
    'is absent', 'absent from', 'would require', 'unreachable', 'withheld',
    'not supported', 'does not have', 'no such',
  ].join('|'));

  it('no story text asserts an absent capability without disclosing it is absent', () => {
    const offenders: string[] = [];
    for (const s of everyStory) {
      const hay = `${s.title} ${s.body} ${s.claude_code_prompt}`.toLowerCase();
      for (const b of BANNED) {
        if (hay.includes(b) && !DISCLOSURE.test(hay)) offenders.push(`${s.story_id}: ${b}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('POSITIVE CONTROL: a bare claim with NO disclosure is still caught', () => {
    // Proves widening the vocabulary did not turn the rule off.
    const bare = 'the agent hands off to another agent automatically'.toLowerCase();
    expect(BANNED.some((b) => bare.includes(b))).toBe(true);
    expect(DISCLOSURE.test(bare)).toBe(false);
  });

  it('POSITIVE CONTROL: a disclosure is correctly allowed', () => {
    const disclosed = 'agent-to-agent handoff is absent from the platform, so R8 is unreachable'.toLowerCase();
    expect(BANNED.some((b) => disclosed.includes(b))).toBe(true);
    expect(DISCLOSURE.test(disclosed)).toBe(true);
  });

  it('POSITIVE CONTROL: the sweep catches a planted claim', () => {
    const planted = 'the test lab is ready for use'.toLowerCase();
    expect(BANNED.some((b) => planted.includes(b))).toBe(true);
  });
});

describe('the legacy migration plan is real per domain, not a template', () => {
  it('each domain has one, keyed on a stable id', () => {
    for (const p of plans) {
      const s = p.stories.find((x) => x.kind === 'legacy_migration')!;
      expect(s.story_id).toBe(`${p.domain_key}.LEGACY-MIGRATION-PLAN`);
    }
  });

  it('a domain with zero inheritance says so, and says an empty bucket is not an empty job', () => {
    const pe = planForDomain('product_experience').stories.find((s) => s.kind === 'legacy_migration')!;
    expect(pe.body).toMatch(/inherits nothing/i);
    expect(pe.body).toMatch(/not an empty job/i);
  });

  it('a domain WITH inheritance lists its dispositions', () => {
    const exec = planForDomain('executive').stories.find((s) => s.kind === 'legacy_migration')!;
    expect(exec.body).toMatch(/migrated_to_capability/);
    expect(exec.body.length).toBeGreaterThan(400);
  });

  it('it warns that a retire marking is not self-justifying', () => {
    const withRetires = plans
      .map((p) => p.stories.find((s) => s.kind === 'legacy_migration')!)
      .filter((s) => /### Retired/.test(s.body));
    expect(withRetires.length).toBeGreaterThan(0);
    for (const s of withRetires) {
      expect(s.body).toMatch(/not self-justifying/);
    }
  });

  it('it names the 21 unresolved rows that belong to no domain', () => {
    for (const p of plans) {
      const s = p.stories.find((x) => x.kind === 'legacy_migration')!;
      expect(s.body).toMatch(/21 legacy records/);
    }
  });
});

describe('no story requests a default-denied capability', () => {
  it('no prompt lists a denied capability as a required tool', () => {
    const offenders: string[] = [];
    for (const m of loadAllMatrices().values()) {
      for (const c of m.capabilities) {
        for (const t of c.required_tools) {
          if (DENIED_CAPABILITIES.includes(t)) offenders.push(`${c.capability_id}: ${t}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('POSITIVE CONTROL: the denied list is non-empty and would match', () => {
    expect(DENIED_CAPABILITIES.length).toBe(8);
    expect(DENIED_CAPABILITIES.includes('production_deploy')).toBe(true);
  });
});
