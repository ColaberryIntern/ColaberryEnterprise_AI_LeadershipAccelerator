/**
 * AF3.5 — the grant writes `tools_granted` and does not trigger a reclassification.
 *
 * ## Why structural and not behavioural
 *
 * A behavioural test can only prove that the paths it drives do not widen autonomy. The
 * criterion is about what this code CANNOT do, and the way it would be broken is a later edit
 * adding a call. Reading the source is the only check that fails on that edit.
 *
 * ## The hazard this is really guarding
 *
 * `classifyAgentAutonomyLevel` derives an autonomy level from the tool list, and its
 * `communicate` tier matches `send_` and `_email`. Granting `send_email` therefore RESOLVES to
 * `communicate` the instant anything classifies — so "a grant must not lift an autonomy level"
 * is not a hypothetical here, it is one function call away at all times.
 *
 * Technique copied from `agentChangeRequestNoTrigger.test.ts` and
 * `toolRequestDecisionGrantsNothing.test.ts`: strip comments and literals, match SHAPE rather
 * than vocabulary, positive controls first, and pin the importer set.
 */

import fs from 'fs';
import path from 'path';

const AGENT_DOMAIN = path.join(__dirname, '..');
const BACKEND_SRC = path.join(__dirname, '..', '..', '..');

const CONTRACT = path.join(AGENT_DOMAIN, 'agentToolGrantContract.ts');
const SERVICE = path.join(AGENT_DOMAIN, 'agentToolGrantService.ts');
const REGISTERED = path.join(AGENT_DOMAIN, 'registeredTools.ts');
const PRESERVE = path.join(AGENT_DOMAIN, 'seedToolPreservation.ts');
const APPROVERS = path.join(AGENT_DOMAIN, 'approverConfiguration.ts');
const CONTROLLER = path.join(BACKEND_SRC, 'controllers', 'agentToolGrantController.ts');
const ROUTES = path.join(BACKEND_SRC, 'routes', 'admin', 'agentToolGrantRoutes.ts');
const SCHEMA = path.join(BACKEND_SRC, 'schemas', 'agentToolGrantSchema.ts');

const ALL_FILES = [
  CONTRACT, SERVICE, REGISTERED, PRESERVE, APPROVERS, CONTROLLER, ROUTES, SCHEMA,
];

/** Comments and string literals removed, so prose about a column cannot fail the test. */
function codeOf(file: string): string {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/** The columns a grant must never move. `tools_granted` is deliberately NOT in this list. */
const FORBIDDEN_COLUMNS = [
  'autonomy_level',
  'autonomy_level_set_at',
  'autonomy_level_source',
  'enabled',
  'abac_mode_override',
];

/**
 * A column name in WRITE position.
 *
 * The `[^=]` tail is the whole trick: it keeps `===` comparisons out, so the service may READ
 * and DIFF these columns — which it must, to prove they did not move — without failing here.
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

describe('POSITIVE CONTROLS — the matchers fire on real violations', () => {
  // A regex that matches nothing passes a structural test exactly as well as clean code does.
  // Everything below this block is worthless without it.
  it('columnWrite fires on each forbidden column written', () => {
    expect('await agent.update({ autonomy_level: level })').toMatch(columnWrite('autonomy_level'));
    expect('agent.enabled = true').toMatch(columnWrite('enabled'));
    expect('SET abac_mode_override = $1').toMatch(columnWrite('abac_mode_override'));
    expect("{ autonomy_level_source: 'auto' }").toMatch(columnWrite('autonomy_level_source'));
  });

  it('columnWrite does NOT fire on a read, a comparison, or a diff', () => {
    expect('if (agent.autonomy_level === previous)').not.toMatch(columnWrite('autonomy_level'));
    expect('const level = agent.autonomy_level;').not.toMatch(columnWrite('autonomy_level'));
    expect("MUST_NOT_CHANGE.includes('enabled')").not.toMatch(columnWrite('enabled'));
  });

  it('RECLASSIFY_CALL fires on a call and not on a mention', () => {
    expect('await maybeReclassifyAutonomyLevel(agent, a, b);').toMatch(RECLASSIFY_CALL);
    expect('classifyAgentAutonomyLevel(tools)').toMatch(RECLASSIFY_CALL);
    // The noun, with no call, is what the comments in these files are full of.
    expect('the classifyAgentAutonomyLevel function').not.toMatch(RECLASSIFY_CALL);
  });

  it('every file under test exists, so a rename cannot pass by reading nothing', () => {
    for (const f of ALL_FILES) {
      expect({ file: path.basename(f), exists: fs.existsSync(f) })
        .toEqual({ file: path.basename(f), exists: true });
    }
  });
});

describe('AF3.5 — the grant moves one column and nothing else', () => {
  it.each(ALL_FILES.map((f) => [path.basename(f), f]))(
    '%s writes none of the forbidden columns',
    (_name, file) => {
      const code = codeOf(file as string);
      for (const column of FORBIDDEN_COLUMNS) {
        expect({ column, writes: columnWrite(column).test(code) })
          .toEqual({ column, writes: false });
      }
    },
  );

  it.each(ALL_FILES.map((f) => [path.basename(f), f]))(
    '%s never calls a reclassifier',
    (_name, file) => {
      expect(codeOf(file as string)).not.toMatch(RECLASSIFY_CALL);
    },
  );

  it('no file imports the reclassification service or the classifier', () => {
    for (const file of ALL_FILES) {
      // Read RAW: codeOf() blanks string literals, and an import path IS a literal.
      const raw = fs.readFileSync(file, 'utf8');
      const imports = [...raw.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect({ file: path.basename(file), spec, forbidden: RECLASSIFY_MODULE.test(spec) })
          .toEqual({ file: path.basename(file), spec, forbidden: false });
      }
    }
  });

  it('the inbound schema is strict and names no forbidden column', () => {
    const code = codeOf(SCHEMA);
    expect(code).toMatch(/\.strict\(\)/);
    for (const column of FORBIDDEN_COLUMNS) {
      expect(code).not.toContain(column);
    }
  });

  it('the service reads the forbidden columns back, which is the point of MUST_NOT_CHANGE', () => {
    // The inverse assertion. A service that never mentioned these columns could not prove they
    // did not move, so their ABSENCE from the read-back list would be the defect.
    const raw = fs.readFileSync(SERVICE, 'utf8');
    for (const column of FORBIDDEN_COLUMNS) {
      expect({ column, inReadBack: raw.includes(`'${column}'`) })
        .toEqual({ column, inReadBack: true });
    }
  });
});

describe('AF3.5 — exactly one service writes tools_granted', () => {
  function tsFilesUnder(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        tsFilesUnder(full, out);
      } else if (entry.name.endsWith('.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  it('only the controller and AF11.4 import the grant service', () => {
    // Widening this list is a visible, reviewable line in a diff. That is the point: a second
    // writer of tools_granted cannot appear without somebody editing this array.
    //
    // AF11.4 took the second line, 6 Nov 2026. `assignExistingToolService.ts` carries out a
    // recorded "assign an existing tool" decision by CALLING this service rather than writing
    // the column itself, which is what the ticket asked for in those words: "Use AF3.5's grant
    // path; if it does not exist yet, this ticket is blocked on it rather than a reason to write
    // a second one." So the number of writers is still one, and the number of callers is two.
    const ALLOWED = [
      'controllers/agentToolGrantController.ts',
      'services/agentDomain/assignExistingToolService.ts',
    ];
    const importers = tsFilesUnder(BACKEND_SRC)
      .filter((f) => /from\s+'[^']*agentToolGrantService'/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(BACKEND_SRC, f).replace(/\\/g, '/'));
    expect(importers.sort()).toEqual(ALLOWED);
  });

  it('the boot seed imports the PURE helper, never the write path', () => {
    const seed = fs.readFileSync(path.join(BACKEND_SRC, 'services', 'agentRegistrySeed.ts'), 'utf8');
    // It must preserve what the agent holds, or it reverts every grant on the next deploy.
    expect(seed).toMatch(/from\s+'[^']*seedToolPreservation'/);
    // And it must not reach the grant service to do it — that would put the write path, its
    // transaction and its refusal vocabulary into the boot graph of the registry seed.
    expect(seed).not.toMatch(/from\s+'[^']*agentToolGrantService'/);
  });
});
