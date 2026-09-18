import * as fs from 'fs';
import * as path from 'path';
import { importsOf, phase2SourceFiles } from './phase2Sources';

/**
 * T406: the import-direction scan - the nightly path cannot reach the
 * integration writers.
 *
 * `services/growthJourney/integration/` holds the only code in this run that
 * writes to `organizations`, `lead_tenant_contexts`, `leads.pipeline_stage`
 * and the delivery chain. The contract allows those writes on ONE trigger: a
 * human's disposition. The mechanism that proves it is textual - no file that
 * the decision pipeline runs (the loader, the strategies, the governor, the
 * decision writer, the handoff writer, the packet builder, the dry-run and
 * nightly scripts) imports `integration/`; only `handoffs/dispositionService.ts`
 * does. A scanner that finds nothing passes while checking nothing, so the
 * named files are asserted present and a planted import is asserted caught.
 */

const ROOT = path.join(__dirname, '..', '..', '..'); // backend/src
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/');

/** The one file outside `integration/` that may import it. */
const THE_DOOR = 'services/growthJourney/handoffs/dispositionService.ts';
const INTEGRATION_DIR = 'services/growthJourney/integration/';
const INTEGRATION_IMPORT = /(^|\/)integration(\/|$)/;

/** Files the decision pipeline runs; every one must exist (the scan is not vacuous) and import no writer. */
const NAMED_PIPELINE_FILES = [
  'services/growthJourney/decisionService.ts',
  'services/growthJourney/decision/loadDecisionContext.ts',
  'services/growthJourney/decision/lifecycleInputs.ts',
  'services/growthJourney/handoffs/handoffService.ts',
  'services/growthJourney/handoffs/evidencePacket.ts',
  'services/growthJourney/handoffs/assignment.ts',
  'services/growthJourney/strategies/learnerStrategy.ts',
  'services/growthJourney/strategies/b2bCandidates.ts',
  'services/growthJourney/governor/decideForSubject.ts',
  'scripts/growthJourneyDecideDryRun.ts',
];

/** The writers each integration file may import, by module basename - the named existing writers and nothing else. */
const ALLOWED_IMPORTS_BY_FILE: Record<string, readonly string[]> = {
  'services/growthJourney/integration/accountRollup.ts': ['models', 'leadContextService', 'launchSafety'],
  'services/growthJourney/integration/dispositions.ts': [],
  'services/growthJourney/integration/pipelineAdvance.ts': ['launchSafety', 'pipelineService', 'dispositions'],
  'services/growthJourney/integration/flotationIntake.ts': ['leadConversion', 'launchSafety'],
  'services/growthJourney/integration/integrateDisposition.ts': ['models', 'ledger', 'outcomeRecorder', 'accountRollup', 'dispositions', 'flotationIntake', 'pipelineAdvance'],
};

const basename = (spec: string) => spec.split('/').pop()!.replace(/\.(ts|js)$/, '');

/** Every scanned file: the run's tree plus the scripts that drive it (the nightly runner lands here in T408). */
function scannedFiles(): string[] {
  const scripts = fs.readdirSync(path.join(ROOT, 'scripts')).filter((n) => /^growthJourney.*\.ts$/.test(n) && !n.endsWith('.d.ts')).map((n) => path.join(ROOT, 'scripts', n));
  return [...phase2SourceFiles(), ...scripts];
}

const importsIntegration = (src: string) => importsOf(src).filter((spec) => INTEGRATION_IMPORT.test(spec));

describe('the scanner itself', () => {
  it('sees the named pipeline files and the door (non-vacuous)', () => {
    const files = scannedFiles().map(rel);
    for (const f of [...NAMED_PIPELINE_FILES, THE_DOOR]) expect(files).toContain(f);
    expect(files.filter((f) => f.startsWith(INTEGRATION_DIR))).toHaveLength(5);
  });

  it('catches a planted integration import in either direction of the path', () => {
    expect(importsIntegration("import { rollUpAccount } from './integration/accountRollup';")).toHaveLength(1);
    expect(importsIntegration("import { rollUpAccount } from '../integration/accountRollup';")).toHaveLength(1);
    expect(importsIntegration("import { x } from '../../services/growthJourney/integration/pipelineAdvance';")).toHaveLength(1);
    expect(importsIntegration("import { x } from '../integrationSomethingElse';")).toHaveLength(0);
    expect(importsIntegration("import { recordOutcome } from '../outcomes/outcomeRecorder';")).toHaveLength(0);
  });
});

describe('only the disposition service reaches the integration writers', () => {
  const files = scannedFiles();

  it('no pipeline file imports integration/ - by name, and across the whole scanned tree', () => {
    for (const f of files) {
      const r = rel(f);
      if (r === THE_DOOR || r.startsWith(INTEGRATION_DIR)) continue;
      const bad = importsIntegration(fs.readFileSync(f, 'utf8'));
      expect({ file: r, bad }).toEqual({ file: r, bad: [] });
    }
  });

  it('the door does import it (the positive control), and only the orchestrator', () => {
    const src = fs.readFileSync(path.join(ROOT, THE_DOOR), 'utf8');
    expect(importsIntegration(src).map(basename).sort()).toEqual(['dispositions', 'integrateDisposition']);
  });

  it('each integration file imports only the named existing writers and its siblings - never a send path', () => {
    for (const [r, allowed] of Object.entries(ALLOWED_IMPORTS_BY_FILE)) {
      const src = fs.readFileSync(path.join(ROOT, r), 'utf8');
      const imports = importsOf(src).map(basename);
      expect({ file: r, imports: imports.sort() }).toEqual({ file: r, imports: [...allowed].sort() });
      expect(src).not.toMatch(/emailService|schedulerService|sequenceService|synthflow|mandrill|nodemailer|campaignService|sendNewLeadAlert|requestInstantCallback|notify/i);
    }
  });

  it('the writers each name the kill switch first', () => {
    for (const r of ['accountRollup.ts', 'pipelineAdvance.ts', 'flotationIntake.ts']) {
      const src = fs.readFileSync(path.join(ROOT, INTEGRATION_DIR, r), 'utf8');
      const fn = src.indexOf('export async function');
      const ks = src.indexOf('isKillSwitchActive()', fn);
      const firstWrite = src.slice(fn).search(/Organization\.|ensureLeadTenantContext\(|advancePipelineStage\(|convertLeadToClient\(/) + fn;
      expect({ file: r, kill_switch_before_write: ks !== -1 && ks < firstWrite }).toEqual({ file: r, kill_switch_before_write: true });
    }
  });
});
