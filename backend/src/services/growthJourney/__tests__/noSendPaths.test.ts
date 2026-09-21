import * as fs from 'fs';
import * as path from 'path';
import { importsOf, phase2SourceFiles } from './phase2Sources';

/**
 * Phase 2 contract: NOTHING SENDS. No module under `services/growthJourney/`
 * (or the routing actions Phase 2 registers) may reach a mailer, a queue, a
 * campaign engine, a dialler, an account-creating service or the brand
 * relationship writer — by import or by call. Mirrors the Explorer Governor's
 * `noSendPaths.test.ts`, with the list widened for what Phase 2 touches.
 *
 * The scanner is the load-bearing part: a scanner that finds nothing passes
 * while checking nothing, so a control fixture with a forbidden import is
 * scanned first and must be caught.
 */

const ROOT = path.join(__dirname, '..', '..', '..'); // backend/src

/** Modules Phase 2 code must never import, by basename, whatever they export. */
const FORBIDDEN_MODULES = [
  'emailService',
  'schedulerService',
  'sequenceService',
  'synthflowService',
  'mandrill',
  'nodemailer',
  'communicationSafetyService',
  'campaignService',
  'leadService',
  'orgService',
  'freeSignupService',
  'prospectAccount',
  'aliPersonalOutreachService',
  'unsubscribeEnforcementService',
  // T407: it imports the mailer for magic links; its one pure rule the resolver
  // needs, `pickBestEnrollment`, lives in `services/enrollmentPick.ts`.
  'participantService',
  // NOT `leadContextService`: Phase 1's subjectResolver imports its READ half
  // (`getLeadContexts`). The writer, `ensureLeadTenantContext`, is banned by
  // name in FORBIDDEN_CALLS below, which is the property that matters.
];

/** Calls that would contact, enrol, create an account or widen a relationship. */
const FORBIDDEN_CALLS = [
  'ScheduledEmail.create',
  'enrollLeadInSequence',
  'enrollLeadsInCampaign',
  'ensureLeadTenantContext',
  'processOptOut',
  'createLead(',
  'Organization.create',
  'OrgMember.create',
  'registerManager',
  'createFreeAccount',
  'ensureProspectAccount',
  'requestInstantCallback',
  'sendNewLeadAlert',
];

const basename = (spec: string) => spec.split('/').pop()!.replace(/\.(ts|js)$/, '');

/**
 * T406: the ONE file that may create an account and widen a brand relationship,
 * and the ONLY two literals it may use for it. It is reachable from a human's
 * disposition alone (`integrationIsolation.test.ts` proves the nightly path
 * never imports `integration/`). Per file and per literal: the same literal in
 * any other file of the tree still fails, and a third literal in this file
 * still fails.
 */
export const ALLOWED_CALLS_BY_FILE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'services/growthJourney/integration/accountRollup.ts': ['Organization.create', 'ensureLeadTenantContext'],
  // T510: the ONE file that may enrol, and the ONE literal it may use. Ali outreach (`enrollLeadsInCampaign`)
  // is not granted until T511 allowlists it by name.
  'services/growthJourney/execution/enrollmentAdapter.ts': ['enrollLeadInSequence'],
});

/**
 * T510: the same discipline for IMPORTS. A forbidden module may be imported by exactly the file named here,
 * and only that module: the adapter needs `sequenceService` to enrol and nothing else - `emailService` in the
 * adapter still fails, `sequenceService` anywhere else still fails.
 */
export const ALLOWED_MODULES_BY_FILE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'services/growthJourney/execution/enrollmentAdapter.ts': ['sequenceService'],
});

const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/');

/** The forbidden calls a file contains, minus the ones it is allowlisted for. */
export function forbiddenCallsIn(relPath: string, src: string): string[] {
  const allowed = ALLOWED_CALLS_BY_FILE[relPath] ?? [];
  return FORBIDDEN_CALLS.filter((c) => src.includes(c) && !allowed.includes(c));
}

/** The forbidden modules a file imports, minus the ones it is allowlisted for. */
export function forbiddenModulesIn(relPath: string, src: string): string[] {
  const allowed = ALLOWED_MODULES_BY_FILE[relPath] ?? [];
  return importsOf(src).map(basename).filter((b) => FORBIDDEN_MODULES.includes(b) && !allowed.includes(b));
}

describe('the scanner itself', () => {
  it('finds the Phase 2 sources (non-vacuous)', () => {
    const files = phase2SourceFiles().map((f) => path.relative(ROOT, f).replace(/\\/g, '/'));
    expect(files).toEqual(expect.arrayContaining(['services/growthJourney/classification/classify.ts']));
    expect(files.length).toBeGreaterThan(5);
  });

  it('catches a control fixture with a forbidden import and a forbidden call', () => {
    const fixture = [
      "import { sendEmail } from '../../emailService';",
      "const x = require('nodemailer');",
      'await ScheduledEmail.create({});',
    ].join('\n');
    const imports = importsOf(fixture).map(basename);
    expect(imports).toEqual(expect.arrayContaining(['emailService', 'nodemailer']));
    expect(FORBIDDEN_MODULES.some((m) => imports.includes(m))).toBe(true);
    expect(FORBIDDEN_CALLS.some((c) => fixture.includes(c))).toBe(true);
  });

  it('extracts real imports from a real file', () => {
    const classify = phase2SourceFiles().find((f) => f.endsWith('classify.ts'))!;
    expect(importsOf(fs.readFileSync(classify, 'utf8'))).toContain('./types');
  });
});

describe('Phase 2 code cannot reach a send, enrol, account or relationship path', () => {
  const files = phase2SourceFiles();

  it('imports none of the forbidden modules (outside the one file allowlisted for its one module)', () => {
    for (const f of files) {
      const bad = forbiddenModulesIn(rel(f), fs.readFileSync(f, 'utf8'));
      expect({ file: rel(f), bad }).toEqual({ file: rel(f), bad: [] });
    }
  });

  it('contains none of the forbidden calls (outside the one allowlisted file and its two literals)', () => {
    for (const f of files) {
      const bad = forbiddenCallsIn(rel(f), fs.readFileSync(f, 'utf8'));
      expect({ file: rel(f), bad }).toEqual({ file: rel(f), bad: [] });
    }
  });

  describe('the T406 allowlist', () => {
    const ROLLUP = 'services/growthJourney/integration/accountRollup.ts';
    const ADAPTER = 'services/growthJourney/execution/enrollmentAdapter.ts';

    it('names exactly two files - the account roll-up with its two literals, and (T510) the adapter with its one', () => {
      expect(Object.keys(ALLOWED_CALLS_BY_FILE)).toEqual([ROLLUP, ADAPTER]);
      expect([...ALLOWED_CALLS_BY_FILE[ROLLUP]]).toEqual(['Organization.create', 'ensureLeadTenantContext']);
      expect([...ALLOWED_CALLS_BY_FILE[ADAPTER]]).toEqual(['enrollLeadInSequence']);
      expect(Object.keys(ALLOWED_MODULES_BY_FILE)).toEqual([ADAPTER]);
      expect([...ALLOWED_MODULES_BY_FILE[ADAPTER]]).toEqual(['sequenceService']);
    });

    it('the allowlisted file is scanned, really uses both literals (non-vacuous), and nothing else forbidden', () => {
      const f = files.find((x) => rel(x) === ROLLUP);
      expect(f).toBeDefined();
      const src = fs.readFileSync(f!, 'utf8');
      expect(src).toContain('Organization.create');
      expect(src).toContain('ensureLeadTenantContext');
      expect(FORBIDDEN_CALLS.filter((c) => src.includes(c))).toEqual(['ensureLeadTenantContext', 'Organization.create']);
      expect(forbiddenCallsIn(ROLLUP, src)).toEqual([]);
    });

    it('T510: the adapter is scanned, really enrols through the one literal and the one module (non-vacuous), and nothing else forbidden', () => {
      const f = files.find((x) => rel(x) === ADAPTER);
      expect(f).toBeDefined();
      const src = fs.readFileSync(f!, 'utf8');
      expect(src).toContain('enrollLeadInSequence(');
      expect(importsOf(src)).toContain('../../sequenceService');
      expect(FORBIDDEN_CALLS.filter((c) => src.includes(c))).toEqual(['enrollLeadInSequence']);
      expect(forbiddenCallsIn(ADAPTER, src)).toEqual([]);
      expect(forbiddenModulesIn(ADAPTER, src)).toEqual([]);
    });

    it('T510 controls: the enrol literal in any OTHER journey file is caught; sequenceService imported anywhere else is caught; emailService in the adapter is caught; enrollLeadsInCampaign in the adapter is caught (not yet allowlisted)', () => {
      const enrol = 'await enrollLeadInSequence(leadId, sequenceId, campaignId);';
      const seq = "import { enrollLeadInSequence } from '../../sequenceService';";
      for (const other of files.map(rel).filter((r) => r !== ADAPTER)) {
        expect({ other, calls: forbiddenCallsIn(other, enrol) }).toEqual({ other, calls: ['enrollLeadInSequence'] });
        expect({ other, modules: forbiddenModulesIn(other, seq) }).toEqual({ other, modules: ['sequenceService'] });
      }
      expect(forbiddenModulesIn(ADAPTER, seq + "\nimport { sendEmail } from '../../emailService';")).toEqual(['emailService']);
      expect(forbiddenCallsIn(ADAPTER, enrol + ' await enrollLeadsInCampaign(campaignId, [leadId]);')).toEqual(['enrollLeadsInCampaign']);
      expect(forbiddenCallsIn(ADAPTER, enrol + ' await ScheduledEmail.create({});')).toEqual(['ScheduledEmail.create']);
    });

    it('the control: the same literal planted in any other file of the tree still fails, and a third literal in the allowlisted file fails too', () => {
      const planted = 'const org = await Organization.create({ lead_id: 1 }); await ensureLeadTenantContext({});';
      for (const other of files.map(rel).filter((r) => r !== ROLLUP && r !== ADAPTER)) {
        expect({ other, bad: forbiddenCallsIn(other, planted) }).toEqual({ other, bad: ['ensureLeadTenantContext', 'Organization.create'] });
      }
      expect(forbiddenCallsIn(ROLLUP, planted + ' await OrgMember.create({});')).toEqual(['OrgMember.create']);
      expect(forbiddenCallsIn(ROLLUP, planted + ' sendNewLeadAlert(lead);')).toEqual(['sendNewLeadAlert']);
    });
  });

  it('reads the Explorer opt-out detector rather than defining another', () => {
    const det = files.find((f) => f.endsWith('deterministic.ts'))!;
    const src = fs.readFileSync(det, 'utf8');
    expect(importsOf(src)).toContain('../../explorerGrowth/explorerReplyClassifier');
    expect(src).toContain('detectOptOut(');
  });
});
