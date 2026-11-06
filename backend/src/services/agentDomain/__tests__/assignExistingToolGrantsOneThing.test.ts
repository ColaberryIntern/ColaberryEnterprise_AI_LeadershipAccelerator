/**
 * AF11.4's governance criterion: **this path grants a tool and changes nothing else about the
 * agent, and it cannot be pointed at a different tool from the wire.**
 *
 * ## Why structural and not behavioural
 *
 * A behavioural test proves the paths it drives. The criterion is about what this code CANNOT
 * do, and the way it would be broken is a later edit adding a write or an input — not an existing
 * path misbehaving. Technique copied from `agentToolGrantWritesOneColumn.test.ts` and
 * `toolRequestDecisionGrantsNothing.test.ts`: strip comments and literals, match SHAPE rather
 * than vocabulary, positive controls first, and pin the import set.
 *
 * ## The one that is really worth having
 *
 * `onlyTwoGrantCapableImports` below. This module is the single place in the repository where a
 * recorded decision meets a tool grant, which is exactly why it is the place a second writer
 * would appear. The import list is the doorway, so the doorway is what gets pinned: AF3.5's
 * grant service, which performs the write and proves it wrote one column, and the read-only
 * effective-access resolver. Anything else is a new way to reach `ai_agents` from here.
 */

import fs from 'fs';
import path from 'path';

const AGENT_DOMAIN = path.join(__dirname, '..');
const BACKEND_SRC = path.join(__dirname, '..', '..', '..');

const CONTRACT = path.join(AGENT_DOMAIN, 'assignExistingToolContract.ts');
const SERVICE = path.join(AGENT_DOMAIN, 'assignExistingToolService.ts');
const CONTROLLER = path.join(BACKEND_SRC, 'controllers', 'assignExistingToolController.ts');
const ROUTES = path.join(BACKEND_SRC, 'routes', 'admin', 'assignExistingToolRoutes.ts');
const SCHEMA = path.join(BACKEND_SRC, 'schemas', 'assignExistingToolSchema.ts');
const DECISION_ROUTES = path.join(BACKEND_SRC, 'routes', 'admin', 'toolRequestDecisionRoutes.ts');
const ADMIN_ROUTES = path.join(BACKEND_SRC, 'routes', 'adminRoutes.ts');
const SECTION_GATE = path.join(BACKEND_SRC, 'middlewares', 'mgmtSectionGate.ts');

const ALL_FILES = [CONTRACT, SERVICE, CONTROLLER, ROUTES, SCHEMA];

/** Comments and string literals removed, so prose about a column cannot fail the test. */
function codeOf(file: string): string {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/** The four columns that turn an observing agent into an acting one. */
const AGENT_COLUMNS = ['tools_granted', 'autonomy_level', 'enabled', 'abac_mode_override'];

/**
 * A column name in WRITE position.
 *
 * The `[^=]` tail keeps `===` comparisons out, so a file may read or compare these without
 * failing here. A read is legitimate; a write is not.
 */
function columnWrite(column: string): RegExp {
  return new RegExp(
    `(?:\\b${column}\\s*[:=][^=]|\\bset\\s+${column}\\b|\\b${column}\\s*=\\s*[^=])`,
    'i',
  );
}

/** A CALL to anything that reclassifies. The trailing `\(` is why a noun cannot fail this. */
const RECLASSIFY_CALL =
  /\b(?:maybeReclassifyAutonomyLevel|classifyNewAgentAutonomyLevel|classifyAgentAutonomyLevel|applyAutoClassification)\s*\(/;

const RECLASSIFY_MODULE = /(agentAutonomyReclassificationService|agentCapabilityClassifier)/;

function importPaths(file: string): string[] {
  const raw = fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
  return [...raw.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
}

describe('POSITIVE CONTROLS — the matchers fire on real violations', () => {
  it('detects each column being written, in every shape a grant would really take', () => {
    // A regex that matches nothing passes a structural test exactly as well as clean code does.
    // Everything below this block is worthless without it.
    expect(columnWrite('tools_granted').test('await agent.update({ tools_granted: next });'))
      .toBe(true);
    expect(columnWrite('autonomy_level').test('row.autonomy_level = 2;')).toBe(true);
    expect(columnWrite('enabled').test('await AiAgent.update({ enabled: true }, { where });'))
      .toBe(true);
    expect(columnWrite('abac_mode_override').test('UPDATE ai_agents SET abac_mode_override = $1'))
      .toBe(true);
  });

  it('does NOT fire on a read or a comparison', () => {
    // The false-failure direction, which is the one that costs attempts and then a weakened
    // regex. Each of these is a legitimate shape in this subtree.
    expect(columnWrite('tools_granted').test('const held = agent.tools_granted ?? [];'))
      .toBe(false);
    expect(columnWrite('enabled').test('rows.find((r) => r.role === \'main\')?.enabled')).toBe(false);
    expect(columnWrite('autonomy_level').test('if (a.autonomy_level === b.autonomy_level) {}'))
      .toBe(false);
  });

  it('detects a reclassification CALL but not a mention of one', () => {
    expect(RECLASSIFY_CALL.test('await maybeReclassifyAutonomyLevel(agent);')).toBe(true);
    expect(RECLASSIFY_CALL.test('this never calls maybeReclassifyAutonomyLevel')).toBe(false);
  });
});

describe('the files exist under the names this test reads', () => {
  it('fails loudly if any of them is renamed out from under it', () => {
    // Without this, moving the write into a renamed file would make every assertion below pass
    // by reading nothing at all.
    for (const f of [...ALL_FILES, DECISION_ROUTES, ADMIN_ROUTES, SECTION_GATE]) {
      expect({ file: path.basename(f), exists: fs.existsSync(f) })
        .toEqual({ file: path.basename(f), exists: true });
    }
  });
});

describe('CRITERION — the assignment path writes nothing itself', () => {
  it('no AF11.4 file writes any of the four agent columns', () => {
    // It calls AF3.5's service, which writes `tools_granted` and proves with a read-back diff
    // that it moved nothing else. Nothing here writes a column directly, so there is still
    // exactly one writer in the repository.
    const offenders: string[] = [];
    for (const f of ALL_FILES) {
      const code = codeOf(f);
      for (const col of AGENT_COLUMNS) {
        if (columnWrite(col).test(code)) offenders.push(`${path.basename(f)}: ${col}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never names the ai_agents table and never calls a reclassifier', () => {
    for (const f of ALL_FILES) {
      const code = codeOf(f);
      expect({ file: path.basename(f), touchesTable: /ai_agents/i.test(code) })
        .toEqual({ file: path.basename(f), touchesTable: false });
      expect({ file: path.basename(f), reclassifies: RECLASSIFY_CALL.test(code) })
        .toEqual({ file: path.basename(f), reclassifies: false });
    }
  });

  it('imports no classifier and no model of an agent', () => {
    const offenders: string[] = [];
    for (const f of ALL_FILES) {
      for (const p of importPaths(f)) {
        if (RECLASSIFY_MODULE.test(p)) offenders.push(`${path.basename(f)} -> ${p}`);
        if (/\/AiAgent$|\/models'?$/.test(p)) offenders.push(`${path.basename(f)} -> ${p}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the service reaches ai_agents through exactly two modules, one of which only reads', () => {
    // THE DOORWAY. `agentToolGrantService` performs the write and owns the one-column proof;
    // `agentEffectiveAccessService` is read-only by its own header and its own structural test.
    // A third entry here is a new route to the agent row from the one file that joins a decision
    // to a grant, which is the edit somebody should be asked about.
    // De-duplicated, because the grant service appears twice: once as an import and once as the
    // `export ... from` that re-exports its two error classes. Two mentions of one module is
    // still one doorway.
    const grantCapable = [...new Set(importPaths(SERVICE)
      .filter((p) => /(aiAgent|agentToolRegistry|toolGrant|autonomy|abac|effectiveAccess)/i.test(p)))]
      .sort();
    expect(grantCapable).toEqual([
      '../workforce/agentEffectiveAccessService',
      './agentToolGrantService',
    ]);
  });

  it('the controller reaches neither the decision service nor the grant service directly', () => {
    // This is what the re-export buys, and it is worth pinning because the natural edit — "I
    // need ToolGrantRefusedError, I will import it from where it lives" — looks harmless and
    // quietly widens two other structural tests. Those pins exist to make "one module joins a
    // decision to a grant" true; a second importer makes them say something weaker.
    const reached = importPaths(CONTROLLER)
      .filter((p) => /(toolRequestDecisionService|agentToolGrantService)$/.test(p));
    expect(reached).toEqual([]);
    // And it does reach the AF11.4 service, so the assertion above is not passing by reading an
    // empty import list.
    expect(importPaths(CONTROLLER)).toContain('../services/agentDomain/assignExistingToolService');
  });
});

describe('CRITERION — the wire cannot choose the tool', () => {
  it('the body schema is strict and declares no field at all', () => {
    const code = codeOf(SCHEMA);
    expect(code).toMatch(/z\s*\.\s*object\(\s*\{\s*\}\s*\)\s*\.strict\(\)/);
  });

  it('the schema names no tool, agent, capability or approver field', () => {
    // If any of these became an input, the console could record "assign A" and the grant could
    // perform B, with both halves logged and nothing contradicting itself.
    const code = codeOf(SCHEMA);
    for (const field of ['tool_name', 'toolName', 'agent_id', 'agentId', 'capability_id',
      'approved_by', 'approvedBy', 'autonomy_level', 'enabled']) {
      expect({ field, present: code.includes(field) }).toEqual({ field, present: false });
    }
  });

  it('the controller takes the request id from the route params, never from the body', () => {
    const code = codeOf(CONTROLLER);
    expect(code).toMatch(/IdParamSchema\s*\.\s*safeParse\(\s*req\.params\s*\)/);
    // The body is parsed only to REFUSE fields, and its result is never read for a value.
    expect(code).not.toMatch(/body\.data\./);
  });
});

describe('CRITERION — the route is mounted where it can be seen', () => {
  it('is NOT mounted on the AF11.3 decision router', () => {
    // That file is one of the seven `toolRequestDecisionGrantsNothing.test.ts` reads to prove the
    // decision subtree cannot reach a grant. Mounting this handler there would route a grant
    // through a file whose whole claim is that it does not — and the pin would have stayed green,
    // because it judges module paths against a vocabulary that `assignExistingToolController`
    // does not match. The gate would have become decoration.
    const code = codeOf(DECISION_ROUTES);
    expect(code).not.toContain('assignExistingTool');
    expect(code).not.toContain('assign-tool');
  });

  it('is mounted on the admin router', () => {
    const code = codeOf(ADMIN_ROUTES);
    expect(code).toMatch(/router\.use\(assignExistingToolRoutes\)/);
  });

  it('rides a path prefix the section gate already classifies', () => {
    // `mgmtSectionGate` is DENY-BY-DEFAULT: an unmapped prefix reaches its final 403 with nothing
    // in the response explaining why, so a new prefix must be classified in the same change that
    // introduces it. This path is not new — it is AF11.3's, which is already mapped — and that is
    // asserted here rather than assumed from the shape of the URL.
    const routePath = fs.readFileSync(ROUTES, 'utf8')
      .match(/'(\/api\/admin\/[^']+)'/)?.[1] ?? '';
    expect(routePath).toBe('/api/admin/agent-domain-tool-requests/:id/assign-tool');

    const prefix = '/api/admin/agent-domain-tool-requests';
    expect(routePath.startsWith(prefix)).toBe(true);
    expect(fs.readFileSync(SECTION_GATE, 'utf8')).toContain(`['${prefix}'`);
  });

  it('requires an admin role rather than a section grant', () => {
    // `dashboard` is the one section every mgmt role carries, so a section grant wide enough to
    // open this route would hand a mentor or a support rep the moment an agent starts acting.
    const code = codeOf(ROUTES);
    expect(code).toMatch(/requireAdmin/);
    expect(code).not.toMatch(/requireSection/);
  });
});
