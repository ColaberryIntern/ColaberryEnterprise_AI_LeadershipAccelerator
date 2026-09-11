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

  it('imports none of the forbidden modules', () => {
    for (const f of files) {
      const bad = importsOf(fs.readFileSync(f, 'utf8')).map(basename).filter((b) => FORBIDDEN_MODULES.includes(b));
      expect({ file: path.relative(ROOT, f), bad }).toEqual({ file: path.relative(ROOT, f), bad: [] });
    }
  });

  it('contains none of the forbidden calls', () => {
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const bad = FORBIDDEN_CALLS.filter((c) => src.includes(c));
      expect({ file: path.relative(ROOT, f), bad }).toEqual({ file: path.relative(ROOT, f), bad: [] });
    }
  });

  it('reads the Explorer opt-out detector rather than defining another', () => {
    const det = files.find((f) => f.endsWith('deterministic.ts'))!;
    const src = fs.readFileSync(det, 'utf8');
    expect(importsOf(src)).toContain('../../explorerGrowth/explorerReplyClassifier');
    expect(src).toContain('detectOptOut(');
  });
});
