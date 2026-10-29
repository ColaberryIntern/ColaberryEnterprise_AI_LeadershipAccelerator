import * as fs from 'fs';
import * as path from 'path';

/**
 * Every path that reads an admissions knowledge row and puts it in front of a person must
 * go through `admissionsKnowledgeGate`.
 *
 * WHY A SOURCE SCAN RATHER THAN A BEHAVIOURAL TEST. The three readers live in
 * `mayaToolsService`, which imports the email, SMS and voice-call services; importing it in
 * a unit test drags those in and the test becomes mostly a test of its own mocks. A scan has
 * no imports, cannot be flaky, and catches the thing that actually goes wrong here: someone
 * adds a FOURTH reader and does not know the gate exists. The repo already uses this shape
 * for `bannedWordOutboundCopy`, `frontendCopyLint` and `growthJourneyContentRules`.
 *
 * It is not a substitute for `admissionsKnowledgeGate.test.ts`, which pins what the gate
 * DECIDES. This pins only that nobody reads around it.
 */

const SRC = path.resolve(__dirname, '../..');
const GATE_IMPORT = /from\s+['"][^'"]*admissionsKnowledgeGate['"]/;

/**
 * How a row gets fetched. A CALL or a direct query - not a bare mention, because
 * `reese/agentToolCapabilities.ts` describes this retrieval in a documentation string and a
 * sentence cannot quote a retired fact to anyone. `frontendCopyLint.test.ts` learned the
 * same lesson against a prose mention in its own header; narrowing to a call is not a
 * loosening.
 */
const READS_ROWS = [/findRelevantKnowledge\s*\(/, /AdmissionsKnowledgeEntry\.findAll/];

/**
 * Readers that legitimately do NOT gate, each with the reason it is exempt. An entry here is
 * a claim that the file never quotes a row to a person; adding one without that being true
 * is how this guard would be defeated.
 */
const EXEMPT: Record<string, string> = {
  'services/admissionsKnowledgeService.ts':
    'defines retrieval and applies the gate itself (it imports it, so it also passes below)',
  'services/admissionsKnowledgeSeed.ts':
    'the retirement sweep - it reads rows in order to switch them OFF, and quotes nothing',
  'controllers/admissionsController.ts':
    'admin CRUD - an admin must be able to SEE a retired row in order to fix it',
  'services/agents/admissions/admissionsKnowledgeAgent.ts':
    'logs titles and categories to the activity log only; no content reaches a person',
  'services/agents/admissions/admissionsKnowledgeSyncAgent.ts':
    'the nightly crawler - reads active rows only to title-match its own upserts, and quotes '
    + 'nothing. It is the writer that CREATES retired-fact rows, which is why the readers gate '
    + 'rather than trusting the table',
};

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__') continue;
      sourceFiles(p, acc);
    } else if (/\.ts$/.test(e.name) && !/\.d\.ts$|\.test\.ts$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

const rel = (abs: string): string => path.relative(SRC, abs).split(path.sep).join('/');

describe('every knowledge reader goes through the gate', () => {
  const files = sourceFiles(SRC);
  const readers = files.filter((abs) => {
    const src = fs.readFileSync(abs, 'utf8');
    return READS_ROWS.some((re) => re.test(src));
  });

  it('finds the readers at all, so an empty sweep cannot pass as clean', () => {
    // The control. A scan that silently matched nothing would make every assertion below
    // vacuously true - which is how a guard reports success while guarding nothing.
    expect(files.length).toBeGreaterThan(500);
    expect(readers.length).toBeGreaterThanOrEqual(4);
    expect(readers.map(rel)).toContain('services/mayaToolsService.ts');
  });

  it('gates every reader that is not explicitly exempt', () => {
    const ungated: string[] = [];
    for (const abs of readers) {
      const r = rel(abs);
      if (EXEMPT[r]) continue;
      if (!GATE_IMPORT.test(fs.readFileSync(abs, 'utf8'))) ungated.push(r);
    }
    expect(ungated).toEqual([]);
  });

  it('keeps the three Maya quoting paths gated by name', () => {
    // Named individually because these are the ones that reach a visitor: the prompt block,
    // the retrieve_knowledge tool the model calls itself, and the outbound voice call.
    for (const r of ['services/admissionsKnowledgeService.ts', 'services/mayaToolsService.ts']) {
      const abs = path.join(SRC, r);
      expect(fs.existsSync(abs)).toBe(true);
      expect(GATE_IMPORT.test(fs.readFileSync(abs, 'utf8'))).toBe(true);
    }
  });

  it('does not carry a stale exemption for a file that no longer reads rows', () => {
    // An exemption outliving its file is a comment that looks like a guarantee.
    const readerPaths = new Set(readers.map(rel));
    for (const r of Object.keys(EXEMPT)) expect(readerPaths.has(r)).toBe(true);
  });
});
