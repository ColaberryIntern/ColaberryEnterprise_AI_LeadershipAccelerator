import * as fs from 'fs';
import * as path from 'path';

/**
 * AF11.3's governance criterion: **nothing in the review console writes `tools_granted`,
 * `autonomy_level`, `enabled` or `abac_mode_override`.**
 *
 * The ticket's sharpest warning is that a console which grants a tool and lifts an autonomy level
 * in one action means nobody separately decided the agent may act more freely. `assign_existing
 * tool` therefore records an INTENT and AF11.4 performs the grant.
 *
 * ## Why a structural test rather than a behavioural one
 *
 * A behavioural test can only prove that the paths it drives do not grant. This criterion is about
 * what the code CANNOT do, which is a property of the whole decision subtree rather than of one
 * call — and the way it would be broken is a later edit adding a write, not an existing path
 * behaving unexpectedly. So this reads the files by name, the way
 * `agentChangeRequestNoTrigger.test.ts` reads the AF4.2 files for its own converse criterion.
 *
 * ## It asserts a WRITE, not a mention
 *
 * The matcher requires the column name next to an assignment, an update or an insert. That
 * distinction is deliberate and bought with experience on the sibling test: a vocabulary ban reads
 * a comment explaining why a column is untouched as the violation it describes, the repair
 * weakens the regex, and the gate becomes decoration. A read that checks a tool is registered is
 * legitimate; a write is not.
 *
 * ## The third assertion is what makes this about the system
 *
 * "These four files grant nothing" would stay green if a new `toolRequestGrantBridge.ts` imported
 * the service and granted on approval. So the importer set is pinned too.
 */

const HERE = __dirname;
const AGENT_DOMAIN = path.join(HERE, '..');
const BACKEND_SRC = path.join(HERE, '..', '..', '..');

const CONTRACT = path.join(AGENT_DOMAIN, 'toolRequestDecisionContract.ts');
const SERVICE = path.join(AGENT_DOMAIN, 'toolRequestDecisionService.ts');
const CONTROLLER = path.join(BACKEND_SRC, 'controllers', 'toolRequestDecisionController.ts');
const ROUTER = path.join(BACKEND_SRC, 'routes', 'admin', 'toolRequestDecisionRoutes.ts');
const SCHEMA = path.join(BACKEND_SRC, 'schemas', 'toolRequestDecisionSchema.ts');
const DDL = path.join(BACKEND_SRC, 'db', 'ensureToolRequestDecisionSchema.ts');
const MODEL = path.join(BACKEND_SRC, 'models', 'AgentDomainToolRequestDecision.ts');

const ALL = [CONTRACT, SERVICE, CONTROLLER, ROUTER, SCHEMA, DDL, MODEL];

/** Comments and string literals removed: this is about what the code DOES, not what it says. */
function codeOf(file: string): string {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/** The four columns that turn an observing agent into an acting one. */
const GRANT_COLUMNS = ['tools_granted', 'autonomy_level', 'enabled', 'abac_mode_override'];

/**
 * One of those columns in WRITE position: assigned to, set in an object literal, or named in an
 * `UPDATE ... SET` / `INSERT` statement. The `:` form is what a Sequelize `update({...})` or
 * `create({...})` payload looks like, and that is how a grant would actually arrive.
 */
function grantWrite(column: string): RegExp {
  return new RegExp(
    `(?:\\b${column}\\s*[:=][^=]|\\bset\\s+${column}\\b|\\b${column}\\s*=\\s*[^=])`,
    'i',
  );
}

/** Modules that would bring a grant into reach. */
const GRANT_MODULE = /(aiAgent|agentToolRegistry|toolGrant|autonomy|abac|effectiveAccess)/i;

describe('the matcher can actually fail — positive controls first', () => {
  it('detects each column being written, in every shape a grant would really take', () => {
    // A regex that matches nothing passes a structural test exactly as well as clean code does.
    // Everything below this block is worthless without it.
    expect(grantWrite('tools_granted').test('await agent.update({ tools_granted: next });'))
      .toBe(true);
    expect(grantWrite('autonomy_level').test('row.autonomy_level = 2;')).toBe(true);
    expect(grantWrite('enabled').test('await AiAgent.update({ enabled: true }, { where });'))
      .toBe(true);
    expect(grantWrite('abac_mode_override').test('UPDATE ai_agents SET abac_mode_override = $1'))
      .toBe(true);
    expect(grantWrite('tools_granted').test('INSERT INTO x (tools_granted) VALUES ($1)'))
      .toBe(false); // an insert-column list alone is not a write this matcher claims to catch
  });

  it('does NOT fire on a read, or on prose about the columns', () => {
    // The false-failure direction, which is the one that would cost attempts and then a weakened
    // regex. Every one of these appears legitimately in this subtree.
    expect(grantWrite('tools_granted').test('const granted = agent.tools_granted ?? [];'))
      .toBe(false);
    expect(grantWrite('tools_granted').test('if (row.tools_granted.includes(name)) return;'))
      .toBe(false);
    expect(grantWrite('autonomy_level').test('/** nothing here writes autonomy_level */'))
      .toBe(false);
    expect(grantWrite('enabled').test('rows.filter((r) => r.enabled === true)')).toBe(false);
  });

  it('detects a grant-capable module being imported', () => {
    expect(GRANT_MODULE.test('../../models/AiAgent')).toBe(true);
    expect(GRANT_MODULE.test('../agents/tools/agentToolRegistry')).toBe(true);
    expect(GRANT_MODULE.test('./recordedHumans')).toBe(false);
    expect(GRANT_MODULE.test('./toolCatalogForMatching')).toBe(false);
  });
});

describe('the files exist under the names this test reads', () => {
  it('fails loudly if any of them is renamed out from under it', () => {
    // Without this, moving a grant into a renamed file would make every assertion below pass by
    // reading nothing at all.
    for (const f of ALL) {
      expect({ file: path.basename(f), exists: fs.existsSync(f) })
        .toEqual({ file: path.basename(f), exists: true });
    }
  });
});

describe('CRITERION — the console grants nothing', () => {
  it('no file in the decision subtree writes any of the four columns', () => {
    const offenders: string[] = [];
    for (const f of ALL) {
      const code = codeOf(f);
      for (const col of GRANT_COLUMNS) {
        if (grantWrite(col).test(code)) offenders.push(`${path.basename(f)}: ${col}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('none of them imports a module that could grant', () => {
    // A grant has to come from somewhere, and imports are the doorway.
    const offenders: string[] = [];
    for (const f of ALL) {
      const raw = fs.readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, ' ');
      const paths = [...raw.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const p of paths) {
        if (GRANT_MODULE.test(p)) offenders.push(`${path.basename(f)} -> ${p}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the service touches only its own two tables', () => {
    // `ai_agents` is the table a grant would land in. The service reads the change request, writes
    // the decision, and goes nowhere near it.
    const code = codeOf(SERVICE);
    expect(code).not.toMatch(/ai_agents/i);
    expect(code).not.toMatch(/AiAgent/);
  });

  it('the inbound schema REFUSES a body carrying a grant, rather than dropping it', () => {
    // `.strict()` is what makes an attempt to lift an autonomy level through this door a visible
    // 400 instead of a silently ignored field somebody could mistake for success.
    const code = codeOf(SCHEMA);
    expect(code).toMatch(/\.strict\(\)/);
    for (const col of GRANT_COLUMNS) expect(code).not.toContain(col);
  });
});

describe('nothing outside the decision module reaches into the service', () => {
  /**
   * This is the assertion that makes the criterion a property of the SYSTEM rather than of seven
   * files. "These grant nothing" is not enough on its own: a new `toolRequestGrantBridge.ts`
   * importing the service and granting on approval would leave every assertion above green.
   *
   * AF11.4 will legitimately need to read a decision, and when it does it belongs on this list —
   * which is the point. Widening the allowlist is a visible, reviewable line in a diff, and that
   * is exactly the moment somebody should be asked whether the grant is a separate decision.
   *
   * ## AF11.4 took that line, 6 Nov 2026, and the question was asked
   *
   * `assignExistingToolService.ts` reads a recorded decision and hands it to AF3.5's grant
   * service. It is the ONE module that imports both, which is what keeps "the decision grants
   * nothing" true of every file below while still letting the decision be carried out. The
   * answer to the question above is yes, deliberately: the decision commits first, the grant is
   * a second step against it, and a refused grant leaves the decision standing with a reason
   * rather than erasing a decision somebody did make.
   *
   * It is NOT mounted on `toolRequestDecisionRoutes.ts` for the same reason. That file is one of
   * the seven read above, and because the import matcher below judges module paths against a
   * vocabulary, `assignExistingToolController` would not have tripped it — the pin would have
   * stayed green while the property it protects stopped holding. A route file of its own keeps
   * the two facts aligned.
   */
  const ALLOWED = [
    path.join('services', 'agentDomain', 'toolRequestDecisionService.ts'),
    path.join('controllers', 'toolRequestDecisionController.ts'),
    path.join('services', 'agentDomain', 'assignExistingToolService.ts'),
  ];

  function tsFilesUnder(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) tsFilesUnder(full, acc);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) acc.push(full);
    }
    return acc;
  }

  it('only the controller and AF11.4 import the decision service', () => {
    const importers: string[] = [];
    for (const f of tsFilesUnder(BACKEND_SRC)) {
      if (f.includes('__tests__')) continue;
      const raw = fs.readFileSync(f, 'utf8');
      if (/from\s+'[^']*toolRequestDecisionService'/.test(raw)) {
        importers.push(path.relative(BACKEND_SRC, f));
      }
    }
    // Two consumers: the console's own controller, and the AF11.4 service that carries a
    // recorded assignment out. The service imports its own contract, not itself. Anything else
    // appearing here is a third party that found a way to a decision, which is the event this
    // assertion exists to make visible.
    expect(importers.sort()).toEqual([ALLOWED[1], ALLOWED[2]].sort());
  });
});
