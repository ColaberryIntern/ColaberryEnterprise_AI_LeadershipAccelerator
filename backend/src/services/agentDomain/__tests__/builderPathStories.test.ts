/**
 * The eight-stage path on the board: ADDITIVE, and option C made countable.
 *
 * ## The guarantee this file exists to hold
 *
 * Ali: *"Don't delete anything they already have."* Kalkidan has a VERIFIED `L1-BY-HAND` tick, and
 * a regenerated board that renamed or dropped that id would silently discard it. So the first test
 * compares the generator's output against a fixture of all 558 story ids captured before the
 * change, by id, per domain.
 *
 * That guarantee is also enforced in code rather than resting on this test:
 * `agentDomainBoardReconciler` refuses to delete any row whose status is not `not_started` or that
 * carries a `verified_at`. Two independent guards, because the cost of being wrong is somebody's
 * completed work.
 *
 * ## Why the gate stories are counted so carefully
 *
 * Phase 2 projected all ten rungs of every capability into 964 stories. Not one of them was ever
 * completed by anybody, and the whole restructure exists to undo that. Emitting every rung's gate
 * here would have added 300 rows across the ten boards and repeated the mistake, so only the
 * CURRENT rung's gate is emitted and the tests pin both halves: the per-rung size matches
 * `GATE_SIZE_BY_RUNG`, and what the generator actually emits is one rung's worth.
 */

import fs from 'fs';
import path from 'path';
import { AGENT_DOMAINS, AGENT_DOMAIN_KEYS } from '../agentDomainRegistry';
import { AUTONOMY_LEVELS, AUTONOMY_NAMESPACE } from '../autonomyLadder';
import { AUTONOMY_RELEASES } from '../agentDomainReleaseLadder';
import { GATE_SIZE_BY_RUNG } from '../builderPath';
import { CANDIDATE_STAGES } from '../candidateStages';
import { planForAllDomains, planForDomain } from '../agentDomainStoryTemplates';
import { planProvision } from '../agentDomainProvisionPlan';
import {
  NEW_STAGE_SUFFIXES,
  STAGES_WITHOUT_A_STORY,
  STAGE_STORY_SUFFIX,
  TOTAL_GATE_STORIES,
  allGateStories,
  gateStories,
} from '../builderPathStories';

const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(__dirname, '__fixtures__', 'storyIdsBeforeBuilderPath.json'),
  'utf8',
)) as { total: number; domains: Record<string, string[]> };

const PLANS = planForAllDomains();
const BY_DOMAIN = new Map(PLANS.map((p) => [p.domain_key, p.stories]));

// ───────────────────────────── 1. additive, asserted by id ─────────────────────────────

describe('every story id emitted before this change is still emitted', () => {
  it('POSITIVE CONTROL: the fixture is real and covers all ten domains', () => {
    expect(FIXTURE.total).toBe(558);
    expect(Object.keys(FIXTURE.domains).sort()).toEqual([...AGENT_DOMAIN_KEYS].sort());
    // The smallest board carries 36. The control's job is that no domain is empty, which is what
    // would make the per-domain assertions below pass over nothing.
    for (const ids of Object.values(FIXTURE.domains)) expect(ids.length).toBeGreaterThan(20);
    expect(Math.min(...Object.values(FIXTURE.domains).map((v) => v.length))).toBe(36);
  });

  it.each([...AGENT_DOMAIN_KEYS])('%s loses nothing', (domainKey) => {
    const now = new Set((BY_DOMAIN.get(domainKey) ?? []).map((s) => s.story_id));
    const missing = FIXTURE.domains[domainKey].filter((id) => !now.has(id));
    expect(missing).toEqual([]);
  });

  it('loses nothing anywhere, counted across all ten at once', () => {
    const now = new Set(PLANS.flatMap((p) => p.stories).map((s) => s.story_id));
    const missing = Object.values(FIXTURE.domains).flat().filter((id) => !now.has(id));
    expect(missing).toEqual([]);
  });

  it('the four existing ladder suffixes are reused, not reinvented', () => {
    // The reuse is what makes a verified tick survive. If `STAGE_STORY_SUFFIX` had invented new
    // ids for these four stages, the test above would fail — but it would fail with 40 missing
    // ids and no explanation, so the intent is pinned here too.
    const reused = Object.values(STAGE_STORY_SUFFIX).filter(
      (s): s is string => typeof s === 'string' && !NEW_STAGE_SUFFIXES.includes(s),
    );
    expect(reused.sort()).toEqual([
      'L1-BY-HAND', 'L2-IN-THE-APP', 'L3-TOOL-REQUEST', 'L4-AGENT-WATCHED',
    ]);
  });

  it('adds exactly 40 stories: 30 path and 10 gate', () => {
    const total = PLANS.reduce((n, p) => n + p.stories.length, 0);
    expect(total).toBe(FIXTURE.total + 40);
    expect(total).toBe(598);
  });
});

// ───────────────────────── 2. the stage-to-story map is total ─────────────────────────

describe('every stage has a decision about its story', () => {
  it('all eight stages appear in the map', () => {
    expect(Object.keys(STAGE_STORY_SUFFIX).sort()).toEqual([...CANDIDATE_STAGES].sort());
  });

  it('exactly one stage has NO story, and it is the one that is a wait', () => {
    // `tool_requested` is Ali's decision. A board row telling a builder to wait is how the old
    // board accumulated 853 items above R0 with zero completions.
    expect(STAGES_WITHOUT_A_STORY).toEqual(['tool_requested']);
  });

  it('three suffixes are new and all three are emitted for the live capability', () => {
    expect(NEW_STAGE_SUFFIXES).toHaveLength(3);
    for (const d of AGENT_DOMAIN_KEYS) {
      const ids = (BY_DOMAIN.get(d) ?? []).map((s) => s.story_id);
      for (const suffix of NEW_STAGE_SUFFIXES) {
        expect(ids.filter((id) => id.endsWith(`.${suffix}`))).toHaveLength(1);
      }
    }
  });

  it('no suffix is used twice, or two stages would share a row', () => {
    const used = Object.values(STAGE_STORY_SUFFIX).filter((s): s is string => s !== null);
    expect(new Set(used).size).toBe(used.length);
  });
});

// ─────────────────────────── 3. the releases, which cycle 1 dropped ───────────────────────────

describe('the releases still carry one per rung', () => {
  it('has a release for every rung, iterated from the import', () => {
    expect(AUTONOMY_RELEASES).toHaveLength(AUTONOMY_LEVELS.length);
    for (const level of AUTONOMY_LEVELS) {
      const found = AUTONOMY_RELEASES.find((r) => r.cluster === `${AUTONOMY_NAMESPACE}${level}`);
      expect(found).toBeDefined();
      expect(String(found?.name).length).toBeGreaterThan(5);
    }
  });

  it('positions are strictly increasing', () => {
    for (let i = 1; i < AUTONOMY_RELEASES.length; i += 1) {
      expect(AUTONOMY_RELEASES[i].position).toBeGreaterThan(AUTONOMY_RELEASES[i - 1].position);
    }
  });

  it('every domain still gets 13 releases: the ten rungs plus the three kept originals', () => {
    for (const p of PLANS) expect(p.releases).toHaveLength(13);
  });

  it('every story hangs on a release that exists', () => {
    for (const p of PLANS) {
      const clusters = new Set(p.releases.map((r) => r.cluster));
      for (const s of p.stories) expect(clusters.has(s.release_key)).toBe(true);
    }
  });
});

// ─────────────────────────── 4. the Command Center is position one ───────────────────────────

describe('the Command Center is first, for all ten domains', () => {
  it('is the first story the generator emits, in every domain', () => {
    for (const d of AGENT_DOMAINS) {
      const stories = BY_DOMAIN.get(d.domain_key) ?? [];
      expect(stories[0].kind).toBe('command_center');
      expect(stories[0].story_id).toBe(`${d.domain_key}.STORY-000`);
    }
  });

  it('is position 0 on the provisioned board, in every domain', () => {
    // Being first in the array is not the same claim as being first on the BOARD, which sorts on
    // position. Both are asserted, because only the second is what a builder sees.
    for (const d of AGENT_DOMAIN_KEYS) {
      const cc = planProvision(d).stories.find((s) => s.story_id === `${d}.STORY-000`);
      expect(cc).toBeDefined();
      expect(cc?.position).toBe(0);
    }
  });

  it('nothing else shares position 0 in the Command Center\'s rung', () => {
    for (const d of AGENT_DOMAIN_KEYS) {
      const cc = planProvision(d).stories.find((s) => s.story_id === `${d}.STORY-000`);
      const sameList = planProvision(d).stories.filter(
        (s) => s.release_key === cc?.release_key && s.position === 0,
      );
      expect(sameList).toHaveLength(1);
    }
  });
});

// ─────────────────────────── 5. option C, per rung and on the board ───────────────────────────

describe('the gate size per rung', () => {
  it.each([...AUTONOMY_LEVELS])('%s emits exactly its GATE_SIZE_BY_RUNG stories', (rung) => {
    const stories = gateStories(AGENT_DOMAINS[0], rung);
    expect(stories).toHaveLength(GATE_SIZE_BY_RUNG[rung]);
    expect(stories.map((s) => s.index)).toEqual(
      Array.from({ length: GATE_SIZE_BY_RUNG[rung] }, (_v, i) => i + 1),
    );
    for (const s of stories) {
      expect(s.gate_size).toBe(GATE_SIZE_BY_RUNG[rung]);
      expect(s.autonomy_stage).toBe(`${AUTONOMY_NAMESPACE}${rung}`);
      expect(s.story_id).toBe(`${AGENT_DOMAINS[0].domain_key}.GATE.${rung}.${s.index}`);
      expect(s.acceptance.length).toBeGreaterThan(1);
      expect(s.body.length).toBeGreaterThan(100);
    }
  });

  it('the whole ladder would be 30 per domain, which is why only one rung is emitted', () => {
    expect(TOTAL_GATE_STORIES).toBe(30);
    expect(allGateStories(AGENT_DOMAINS[0])).toHaveLength(30);
  });

  it('the generator emits ONE rung\'s gate, not all ten', () => {
    for (const d of AGENT_DOMAIN_KEYS) {
      const gates = (BY_DOMAIN.get(d) ?? []).filter((s) => s.kind === 'rung_gate');
      // Every domain sits at R0 today — all 443 capability records name `autonomy:R0`, measured —
      // so R0's gate size is what each board gets.
      expect(gates).toHaveLength(GATE_SIZE_BY_RUNG.R0);
      expect(gates[0].autonomy_stage).toBe(`${AUTONOMY_NAMESPACE}R0`);
    }
  });

  it('a gate story never claims a capability, and always says why', () => {
    for (const p of PLANS) {
      for (const s of p.stories.filter((x) => x.kind === 'rung_gate')) {
        expect(s.capability_id).toBeNull();
        expect(String(s.shared_foundation_reason).length).toBeGreaterThan(50);
        expect(String(s.validation_dependency).length).toBeGreaterThan(20);
      }
    }
  });

  it('the gate counts the WATCHED stage only, which the body says in words', () => {
    const body = gateStories(AGENT_DOMAINS[0], 'R0')[0].body;
    expect(body).toMatch(/agent does it|AGENT does it/i);
    expect(body.toLowerCase()).toContain('by hand');
    expect(body.toLowerCase()).toContain('does not count');
  });
});

// ─────────────────────────── 6. determinism and the size ceiling ───────────────────────────

describe('the generator stays deterministic', () => {
  it('planProvision returns byte-identical output when called twice', () => {
    for (const d of AGENT_DOMAIN_KEYS) {
      expect(JSON.stringify(planProvision(d))).toBe(JSON.stringify(planProvision(d)));
    }
  });

  it('planForDomain returns byte-identical output when called twice', () => {
    for (const d of AGENT_DOMAIN_KEYS) {
      expect(JSON.stringify(planForDomain(d))).toBe(JSON.stringify(planForDomain(d)));
    }
  });

  it('every story id is unique within its domain', () => {
    for (const p of PLANS) {
      const ids = p.stories.map((s) => s.story_id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('the source files this change touched are under the 500-line ceiling', () => {
    // `agentDomainStoryTemplates.ts` was 620 before this change, a documented violation. The
    // builder-path work would have made it 657, so the shared-foundation stories were extracted
    // into their own module — the precedent being `agentDomainCommandCenterStory.ts`, which is
    // already its own module for the same reason.
    const dir = path.join(__dirname, '..');
    for (const f of [
      'agentDomainStoryTemplates.ts',
      'agentDomainFoundationStories.ts',
      'builderPathStories.ts',
      'builderPath.ts',
      'candidateFlow.ts',
      'candidateStages.ts',
      'candidateSection.ts',
      'candidateService.ts',
      'agentDomainSnapshot.ts',
    ]) {
      const n = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').length;
      expect({ f, n: n <= 500 }).toEqual({ f, n: true });
    }
  });
});
