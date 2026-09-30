/**
 * Regression guard: operational scripts must take credentials from the
 * environment and must fail loudly when they are absent.
 *
 * Why this exists. `verifyInboxCosDigestFlow.js` carried the live production
 * JWT signing key as a string literal from 2026-06-01. The repo is public, so
 * anyone holding that key could mint a valid session for any user, including an
 * admin, without a password. Rotating the key is the remedy for the exposure;
 * this suite is what stops the repo re-publishing the next one.
 *
 * These assertions are deliberately static (read the source, match a shape)
 * plus one behavioural spawn. Nothing here needs a database, a network, or a
 * real secret, so it runs in the default CI gate.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/** Scripts that log in to Opportunity Pulse or Skool with a password. */
const PASSWORD_SCRIPTS = [
  'backend/src/scripts/enrichProposalTasksDetailed.js',
  'backend/src/scripts/rebuildGovBidSprintFinal.js',
  'backend/src/scripts/processGovBid.js',
  'backend/src/scripts/sendRamMassachusettsOpDigest.js',
  'scripts/skoolStripUrlsFromComments.js',
];

describe('no hardcoded credentials in operational scripts', () => {
  describe('verifyInboxCosDigestFlow.js — the JWT signing key', () => {
    const REL = 'backend/src/scripts/verifyInboxCosDigestFlow.js';

    it('does not assign JWT_SECRET from a string literal', () => {
      const src = read(REL);
      // Matches `const JWT_SECRET = '<anything>'` — the exact shape of the leak.
      expect(src).not.toMatch(/const\s+JWT_SECRET\s*=\s*['"][^'"]+['"]/);
    });

    it('reads the signing key from the environment', () => {
      expect(read(REL)).toMatch(/const\s+JWT_SECRET\s*=\s*process\.env\.JWT_SECRET\s*;/);
    });

    it('has no silent fallback to a default signing key', () => {
      expect(read(REL)).not.toMatch(/process\.env\.JWT_SECRET\s*\|\|/);
    });

    it('exits non-zero with a FATAL message when JWT_SECRET is absent', () => {
      const env = { ...process.env };
      delete env.JWT_SECRET;
      // Containment, not decoration. If this guard ever regresses, the script
      // underneath drives a real browser at https://enterprise.colaberry.ai and
      // calls digest-action, which WRITES to inbox_classifications. Pointing
      // playwright at a browser path that does not exist means a regressed
      // script dies at launch instead of mutating production from a test run.
      env.PLAYWRIGHT_BROWSERS_PATH = path.join(REPO_ROOT, 'no-browsers-for-tests');

      const res = spawnSync(process.execPath, [path.join(REPO_ROOT, REL)], {
        env,
        encoding: 'utf8',
        timeout: 20_000,
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain('FATAL');
      expect(res.stderr).toContain('JWT_SECRET');
    });

    it('checks the key before requiring playwright, so it fails on config not module load', () => {
      const src = read(REL);
      const guard = src.indexOf('process.exit(1)');
      const heavyRequire = src.indexOf('node_modules/playwright');
      expect(guard).toBeGreaterThan(-1);
      expect(heavyRequire).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(heavyRequire);
    });
  });

  describe.each(PASSWORD_SCRIPTS)('%s — account passwords', (rel) => {
    it('does not contain a password string literal', () => {
      const src = read(rel);
      expect(src).not.toMatch(/password:\s*['"][^'"]+['"]/i);
      expect(src).not.toMatch(/(?:^|\s)const\s+\w*PASSWORD\w*\s*=\s*['"][^'"]+['"]/);
    });

    it('does not fall back to a hardcoded password when the env var is absent', () => {
      expect(read(rel)).not.toMatch(/process\.env\.\w*PASSWORD\w*\s*\|\|\s*['"][^'"]+['"]/);
    });

    it('fails loudly on a missing password rather than continuing', () => {
      const src = read(rel);
      expect(src).toMatch(/if\s*\(!\w*PASSWORD\w*\)\s*\{[\s\S]{0,400}?process\.exit\(1\)/);
    });
  });

  describe('the verify side of the same token', () => {
    it('inboxController does not fall back to a literal when verifying digest tokens', () => {
      const src = read('backend/src/controllers/inboxController.ts');
      expect(src).not.toMatch(/process\.env\.JWT_SECRET\s*\|\|\s*['"][^'"]+['"]/);
      expect(src).toMatch(/jwt\.verify\(token as string, env\.jwtSecret\)/);
    });
  });
});
