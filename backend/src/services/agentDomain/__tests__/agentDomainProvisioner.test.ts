/**
 * T14 — the provisioner, checked without a database.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * Idempotency and the concurrency race are NOT settled here: a mock cannot prove that a primary
 * key stops a second insert, only that the code behaves as written. Those live in
 * `agentDomainProvisioner.concurrency.integration.test.ts` against real Postgres, following the
 * convention `blueprintApproval.concurrency.integration.test.ts` already set in this repo.
 *
 * What IS settled here: the write-set, the forbidden calls, the stage, and the derived ids.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  PROVISIONER_WRITE_SET,
  TABLES_WRITTEN_THIS_PHASE,
  TABLE_DELIBERATELY_UNWRITTEN,
  FORBIDDEN_SYMBOLS,
  FORBIDDEN_STAGES,
  PROVISION_STAGE,
  PERMITTED_BUILDER_STATES,
  ID_KINDS,
  derivedProjectId,
  derivedAnchorId,
  derivedReleaseId,
  derivedStoryId,
  planProvision,
  planAllProvisions,
  allPlannedIds,
  HUMAN_WORK_STATEMENT,
} from '../agentDomainProvisionPlan';
import { AGENT_DOMAIN_KEYS, AGENT_DOMAIN_ENTRY_POINT } from '../agentDomainRegistry';
import { POST_APPROVAL_STAGES } from '../../lifecycle/lifecycleStages';

const EXECUTOR = path.join(__dirname, '..', 'agentDomainProvisioner.ts');
const PLAN_MODULE = path.join(__dirname, '..', 'agentDomainProvisionPlan.ts');

/** Source with comments stripped, so a table named in prose is never mistaken for a write. */
function codeOf(file: string): string {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/** Every table an INSERT/UPDATE/DELETE in this source targets. */
function tablesWritten(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)/gi)) {
    found.add(m[1].toLowerCase());
  }
  return [...found].sort();
}

// ─────────────────────────────── the write-set ───────────────────────────────

describe('the provisioner writes only the declared tables', () => {
  const code = codeOf(EXECUTOR);

  it('every table it writes is in PROVISIONER_WRITE_SET', () => {
    const written = tablesWritten(code);
    const undeclared = written.filter((t) => !PROVISIONER_WRITE_SET.includes(t));
    expect(undeclared).toEqual([]);
  });

  it('every table it writes with SQL is declared, and the two it does not are explained', () => {
    // THREE of the five declared tables are written with SQL here. The other two are not written
    // by this module at all:
    //   - `projects` goes through `Project.findOrCreate`, because a raw insert fires neither of
    //     the model's hooks and upstream's LC-01 tripwire forbids it.
    //   - `project_lifecycle_states` is written by `studentProjectLifecycleHook` INSIDE this
    //     transaction, as a consequence of that create. The provisioner reads the row back rather
    //     than claiming the hook ran.
    const written = tablesWritten(code);
    expect(written).toEqual(['agent_domain_projects', 'student_task_lists', 'student_tasks']);
    for (const t of written) expect(TABLES_WRITTEN_THIS_PHASE).toContain(t);
    // The model path is asserted, so "it writes projects somehow" cannot silently become a raw
    // insert again -- which is the regression the tripwire upstream would also catch.
    expect(code).toMatch(/Project\.findOrCreate\(/);
    expect(code).not.toMatch(/INSERT INTO projects/i);
    expect(code).not.toMatch(/INSERT INTO project_lifecycle_states/i);
  });

  it('POSITIVE CONTROL: an INSERT into a seventh table is detected', () => {
    // Proves `tablesWritten` can actually find a violation. Without this, the two tests above
    // would pass just as happily against a regex that matched nothing.
    const fixture = `await q(\`INSERT INTO ai_agents (id, name) VALUES ($1, $2) RETURNING id\`);`;
    const written = tablesWritten(fixture);
    expect(written).toEqual(['ai_agents']);
    expect(written.filter((t) => !PROVISIONER_WRITE_SET.includes(t))).toEqual(['ai_agents']);
  });

  it('POSITIVE CONTROL: UPDATE and DELETE are detected too, not only INSERT', () => {
    expect(tablesWritten('UPDATE enrollments SET x = 1')).toEqual(['enrollments']);
    expect(tablesWritten('DELETE FROM student_tasks WHERE id = $1')).toEqual(['student_tasks']);
  });

  it('writes ZERO rows to the authorization table, and says why', () => {
    expect(PROVISIONER_WRITE_SET).toContain(TABLE_DELIBERATELY_UNWRITTEN.table);
    expect(TABLES_WRITTEN_THIS_PHASE).not.toContain(TABLE_DELIBERATELY_UNWRITTEN.table);
    expect(TABLE_DELIBERATELY_UNWRITTEN.reason).toMatch(/no human has approved/);
    // And the executor records the zero explicitly rather than leaving the key absent.
    expect(code).toMatch(/agent_domain_build_authorizations\s*=\s*0/);
  });

  it('the declared write-set is exactly the contract\'s six tables', () => {
    expect([...PROVISIONER_WRITE_SET].sort()).toEqual([
      'agent_domain_build_authorizations',
      'agent_domain_projects',
      'project_lifecycle_states',
      'projects',
      'student_task_lists',
      'student_tasks',
    ]);
  });
});

// ─────────────────────────────── forbidden calls ───────────────────────────────

describe('the forbidden paths are not reachable from this module', () => {
  // The plan module DECLARES these names as data, so the declaration itself has to come out
  // before sweeping -- otherwise the test fails on the very list that defines it, which is the
  // same false positive as a detector matching a term inside its own banned-word list.
  const code = (codeOf(EXECUTOR) + codeOf(PLAN_MODULE))
    .replace(/export const FORBIDDEN_SYMBOLS[\s\S]*?\]\);/, '');

  it.each(FORBIDDEN_SYMBOLS)('never reaches %s', (symbol) => {
    expect(code).not.toContain(symbol);
  });

  it('never writes ai_agents, in any casing', () => {
    expect(code.toLowerCase()).not.toMatch(/insert\s+into\s+ai_agents|update\s+ai_agents/);
  });

  it('imports no project-creation or publish service', () => {
    const imports = code.split('\n').filter((l) => /^\s*import\b|require\(/.test(l)).join('\n');
    expect(imports).not.toMatch(/projectService|publishBuild|sbp\//i);
    expect(imports).not.toMatch(/emailService|nodemailer|mandrill|basecamp/i);
  });

  it('POSITIVE CONTROL: the sweep would catch a forbidden call if one were added', () => {
    const fixture = 'const p = await createNewProjectForEnrollment(enrollmentId);';
    expect(FORBIDDEN_SYMBOLS.some((s) => fixture.includes(s))).toBe(true);
  });
});

// ─────────────────────────────── the stage ───────────────────────────────

describe('readiness cannot be inflated', () => {
  it('provisions at discovery and nowhere else', () => {
    expect(PROVISION_STAGE).toBe('discovery');
    expect(planAllProvisions().every((p) => p.stage === 'discovery')).toBe(true);
  });

  it('no planned stage is in the forbidden set', () => {
    const offenders = planAllProvisions().filter((p) => FORBIDDEN_STAGES.has(p.stage)).map((p) => p.domain_key);
    expect(offenders).toEqual([]);
  });

  it('FORBIDDEN_STAGES is a strict superset of the repo\'s own POST_APPROVAL_STAGES', () => {
    for (const s of POST_APPROVAL_STAGES) expect(FORBIDDEN_STAGES.has(s)).toBe(true);
    // The deliberate addition, stated rather than smuggled.
    expect(POST_APPROVAL_STAGES.has('awaiting_blueprint_approval' as never)).toBe(false);
    expect(FORBIDDEN_STAGES.has('awaiting_blueprint_approval')).toBe(true);
    expect(FORBIDDEN_STAGES.size).toBe(POST_APPROVAL_STAGES.size + 1);
  });

  it('conditions are not stages, so failed and blocked are absent', () => {
    expect(FORBIDDEN_STAGES.has('failed')).toBe(false);
    expect(FORBIDDEN_STAGES.has('blocked')).toBe(false);
  });

  it('the executor refuses a forbidden stage at RUNTIME, not only in this test', () => {
    expect(codeOf(EXECUTOR)).toMatch(/ForbiddenStageError/);
  });

  it('records the entry point discovery requires', () => {
    expect(planAllProvisions().every((p) => p.entry_point === AGENT_DOMAIN_ENTRY_POINT)).toBe(true);
    expect(AGENT_DOMAIN_ENTRY_POINT.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────── derived ids ───────────────────────────────

describe('every id is derived, so a re-run cannot duplicate anything', () => {
  it('the same domain key yields the same ids, every time', () => {
    for (const k of AGENT_DOMAIN_KEYS) {
      expect(derivedProjectId(k)).toBe(derivedProjectId(k));
      expect(derivedAnchorId(k)).toBe(derivedAnchorId(k));
    }
  });

  it('different domains, kinds and clusters never collide', () => {
    const ids = allPlannedIds();
    const all = [...ids.projects, ...ids.anchors, ...ids.releases, ...ids.stories];
    expect(new Set(all).size).toBe(all.length);
  });

  it('a project id and an anchor id for the SAME domain differ', () => {
    // They would collide if both used the same kind string, which is why ID_KINDS exists.
    for (const k of AGENT_DOMAIN_KEYS) expect(derivedProjectId(k)).not.toBe(derivedAnchorId(k));
    expect(new Set(Object.values(ID_KINDS)).size).toBe(4);
  });

  it('every derived id is a v5 UUID', () => {
    const V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const ids = allPlannedIds();
    expect(ids.projects.every((i) => V5.test(i))).toBe(true);
    expect(ids.anchors.every((i) => V5.test(i))).toBe(true);
    expect(ids.releases.every((i) => V5.test(i))).toBe(true);
    expect(ids.stories.every((i) => V5.test(i))).toBe(true);
  });

  it('the executor supplies the id on every insert rather than letting the default mint one', () => {
    // A gen_random_uuid()/UUIDV4 default would make the second run insert a duplicate set.
    const code = codeOf(EXECUTOR);
    expect(code).not.toMatch(/gen_random_uuid\(\)/);
    for (const m of code.matchAll(/INSERT INTO\s+([a-z_]+)\s*\(([^)]*)\)/gi)) {
      const [, table, cols] = m;
      // project_lifecycle_states has no derived id by design: its uniqueness is the partial
      // unique index on student_project_id, which is what ON CONFLICT DO NOTHING keys on.
      if (table === 'project_lifecycle_states') continue;
      expect(cols.split(',').map((c) => c.trim())[0]).toBe('id');
    }
  });

  it('every raw insert carries ON CONFLICT DO NOTHING and RETURNING', () => {
    // THREE now, not five: `projects` moved to `Project.findOrCreate` and
    // `project_lifecycle_states` moved to the model hook. `findOrCreate` supplies the same
    // property by a different mechanism -- it does not insert when the row is already there --
    // and the real-Postgres suite proves the re-run writes nothing either way.
    const code = codeOf(EXECUTOR);
    const inserts = [...code.matchAll(/INSERT INTO[\s\S]*?RETURNING id/gi)].map((m) => m[0]);
    expect(inserts.length).toBe(3);
    for (const i of inserts) expect(i).toMatch(/ON CONFLICT[\s\S]*?DO NOTHING/i);
  });

  it('counts are read from RETURNING, never from the length of the input', () => {
    // The 2026-10-02 defect in this repo: an insert count that read the submitted array's length
    // could never report zero, because the client mints ids before the database rejects the row.
    const code = codeOf(EXECUTOR);
    expect(code).toMatch(/rows\.length/);
    expect(code).not.toMatch(/inserted\.\w+\s*=\s*plan\.\w+\.length/);
  });
});

// ─────────────────────────────── the planned rows ───────────────────────────────

describe('the plan covers all ten domains completely', () => {
  const plans = planAllProvisions();

  it('one plan per domain', () => {
    expect(plans.map((p) => p.domain_key)).toEqual([...AGENT_DOMAIN_KEYS]);
  });

  it('every domain gets releases and stories', () => {
    for (const p of plans) {
      expect(p.releases.length).toBeGreaterThan(0);
      expect(p.stories.length).toBeGreaterThan(0);
    }
  });

  it('every story names a release the same plan actually creates', () => {
    for (const p of plans) {
      const clusters = new Set(p.releases.map((r) => r.cluster));
      const orphans = p.stories.filter((s) => !clusters.has(s.release_cluster)).map((s) => s.story_id);
      expect(orphans).toEqual([]);
    }
  });

  it('every IMPLEMENTATION story carries its full Claude Code prompt in `build`', () => {
    for (const p of plans) {
      for (const s of p.stories.filter((x) => x.kind === 'implementation')) {
        expect(s.build.length).toBeGreaterThan(200);
        expect(s.build).not.toBe(HUMAN_WORK_STATEMENT);
      }
    }
  });

  it('EVERY story carries a real Claude Code prompt, including research and legacy migration', () => {
    // This test used to assert the OPPOSITE: that these stories carried HUMAN_WORK_STATEMENT,
    // on the reasoning that discovery is a conversation rather than a coding task. Ali settled
    // it on 2026-10-21: there are no manual tasks in this programme, and every prompt is
    // understood as something that will be run in Claude Code. A research story's product is a
    // committed document rather than a feature, which does not make it human work.
    //
    // It is not a style preference. Mihret opened one of these, read that it was human work with
    // no prompt, and could not tell whether she was meant to run anything; she asked instead of
    // guessing, which is the only reason it surfaced rather than quietly costing her a day.
    const research = plans.flatMap((p) => p.stories).filter((s) => s.kind !== 'implementation');
    expect(research.length).toBe(60); // 5 research + 1 legacy migration, per domain
    for (const s of research) {
      expect(s.build).not.toBe(HUMAN_WORK_STATEMENT);
      expect(s.build.length).toBeGreaterThan(1500);
      expect(s.build).toContain('This is Claude Code work');
      expect(s.build).not.toMatch(/no prompt on purpose/i);
    }
  });

  it('the human-work statement is now a fallback that should never fire, and still says the right thing if it does', () => {
    // `plannedStory` still substitutes this when `claude_code_prompt` is empty. Every generated
    // story now carries one, so this is a safety net rather than a path: the test above proves
    // nothing reaches it. Kept, and kept correct, because a silent empty prompt would be worse
    // than this text.
    expect(HUMAN_WORK_STATEMENT).toMatch(/do not send an invitation/);
    expect(HUMAN_WORK_STATEMENT).toMatch(/not record a meeting as booked/);
    expect(HUMAN_WORK_STATEMENT).toMatch(/stays `draft`/);
  });

  it('POSITIVE CONTROL: implementation stories exist, so the prompt check is not vacuous', () => {
    const impl = plans.flatMap((p) => p.stories).filter((s) => s.kind === 'implementation');
    expect(impl.length).toBeGreaterThan(300);
  });

  it('positions within a release are dense and start at zero', () => {
    for (const p of plans) {
      for (const r of p.releases) {
        const pos = p.stories.filter((s) => s.release_cluster === r.cluster).map((s) => s.position).sort((a, b) => a - b);
        expect(pos).toEqual(pos.map((_, i) => i));
      }
    }
  });

  it('no string exceeds the column width it is bound to', () => {
    for (const p of plans) {
      for (const r of p.releases) {
        expect(r.cluster.length).toBeLessThanOrEqual(50);
        expect(r.title.length).toBeLessThanOrEqual(255);
      }
      for (const s of p.stories) {
        expect(s.title.length).toBeLessThanOrEqual(500);
        expect(s.story_id.length).toBeLessThanOrEqual(60);
        expect(s.release_key.length).toBeLessThanOrEqual(60);
      }
    }
  });

  it('every planned builder state is one the CHECK constraint admits', () => {
    for (const p of plans) {
      if (p.intended_builder_state === null) continue;
      expect(PERMITTED_BUILDER_STATES).toContain(p.intended_builder_state);
    }
  });

  it('refuses a domain key that is not an agent domain', () => {
    expect(() => planProvision('not_a_domain')).toThrow(/not an agent domain/);
  });

  it('the plan is PURE: two calls produce identical output', () => {
    expect(JSON.stringify(planAllProvisions())).toBe(JSON.stringify(planAllProvisions()));
  });
});


/**
 * The structured logging. The behavioural assertions for it live in the REAL-POSTGRES suite
 * (`agentDomainProvisioner.concurrency.integration.test.ts`), not here.
 *
 * They were originally here, driven by a stubbed `sequelize` whose `transaction` simply called the
 * callback. That worked while the provisioner used raw SQL. It cannot work now that projects are
 * created through `Project.findOrCreate`, which needs a real model and a real connection — and
 * mocking the model to make them pass again would prove less than they did, because the thing
 * worth proving is that the lifecycle HOOK fires and writes its row, which only a database shows.
 *
 * What stays here is the one check that needs no database.
 */
describe('the provisioner logs what a responder needs', () => {
  it('POSITIVE CONTROL: the dead ternary is gone from the source', () => {
    // `? 'success' : 'success'` could not condition. A source check, because the two branches were
    // behaviourally identical and no test could have told them apart.
    //
    // CODE, not prose: the executor's own comment explains the defect and therefore CONTAINS the
    // dead ternary, so the first version of this matched the explanation of the thing it was
    // looking for.
    const code = codeOf(EXECUTOR);
    expect(code).not.toMatch(/\?\s*'success'\s*:\s*'success'/);
    expect(code).toMatch(/already_present \? 'partial' : 'success'/);
    // The explanation lives wherever the emitting code lives -- it moved into `provisionOne`
    // when the logging did. Asserted on the whole file rather than on a region, because
    // pinning a region is how this assertion broke.
    expect(fs.readFileSync(EXECUTOR, 'utf8')).toMatch(/could not\s+\*?\s*\/?\/?\s*condition/);
  });

  it('the log lines carry the required schema fields, asserted at the source', () => {
    // A structural companion to the behavioural assertions in the integration suite: the fields
    // the Observability Framework requires are present in the code that emits them.
    const code = codeOf(EXECUTOR);
    for (const field of ['timestamp:', 'correlation_id,', 'duration_ms:', 'outcome:', 'error_class,']) {
      expect(code).toContain(field);
    }
    // And `error_class` is computed BEFORE the line that logs it, so the two cannot disagree.
    expect(code.indexOf('const error_class')).toBeLessThan(code.indexOf("event: 'agent_domain_provision_failed'"));
  });
});
