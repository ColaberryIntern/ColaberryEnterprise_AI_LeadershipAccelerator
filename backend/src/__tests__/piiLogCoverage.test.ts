/**
 * Regression guard for T005 (loop-architect run 20260802-084012-trust-90-drilldown).
 *
 * A prior read-only audit found ~95 console.log/warn/error call sites across ~24 files
 * that logged raw lead/student/visitor PII (email, phone, name) in the clear. T005 wrapped
 * every genuine site in redactForLogs() from src/utils/piiRedaction.ts.
 *
 * This test does NOT re-derive "is this PII" — that judgment call already happened during
 * the fix. It is a concrete regression guard: for each touched file, assert (a) the file
 * still imports redactForLogs, and (b) the file still contains at least as many
 * `redactForLogs(` call sites as were fixed. If a future edit strips the import or reverts
 * a wrapped interpolation back to a raw one, this test fails.
 *
 * inbox/inboxCase subsystem was explicitly out of scope for T005 (not exhaustively audited)
 * and is not covered here.
 */
import fs from 'fs';
import path from 'path';

const BACKEND_SRC = path.resolve(__dirname, '..');

/** file path (relative to src/) -> minimum number of redactForLogs( call sites fixed in T005 */
const FIXED_FILES: Record<string, number> = {
  'services/emailService.ts': 49,
  'services/synthflowService.ts': 5,
  'controllers/synthflowWebhookController.ts': 4,
  'services/callTranscriptProcessor.ts': 1,
  'controllers/leadController.ts': 1,
  'controllers/adminLeadController.ts': 1,
  'controllers/apolloWebhookController.ts': 3,
  'controllers/ghlWebhookController.ts': 4,
  'controllers/mandrillWebhookController.ts': 6,
  'controllers/advisorySyncController.ts': 3,
  'controllers/trackingController.ts': 2,
  'controllers/calendarController.ts': 1,
  'services/calendarService.ts': 3,
  'services/ghlService.ts': 2,
  'services/apolloService.ts': 4,
  'services/automationService.ts': 1,
  'services/aliPersonalOutreachService.ts': 1,
  'services/enrollmentService.ts': 2,
  'services/paysimpleService.ts': 2,
  'services/schedulerService.ts': 8,
  'services/sequenceService.ts': 1,
  'services/agents/openclaw/openclawLeadCaptureService.ts': 2,
  'services/unsubscribeEnforcementService.ts': 1,
  'routes/admin/securityRoutes.ts': 1,
};

describe('PII log redaction coverage (T005 regression guard)', () => {
  const entries = Object.entries(FIXED_FILES);

  it('covers all 24 files identified by the T005 audit', () => {
    expect(entries.length).toBe(24);
  });

  it('every fixed file still exists on disk', () => {
    for (const [relPath] of entries) {
      const abs = path.join(BACKEND_SRC, relPath);
      expect(fs.existsSync(abs)).toBe(true);
    }
  });

  describe.each(entries)('%s', (relPath, minSites) => {
    const abs = path.join(BACKEND_SRC, relPath);
    let content: string;

    beforeAll(() => {
      content = fs.readFileSync(abs, 'utf8');
    });

    it('imports redactForLogs from utils/piiRedaction', () => {
      expect(content).toMatch(/import\s*\{[^}]*\bredactForLogs\b[^}]*\}\s*from\s*['"][^'"]*utils\/piiRedaction['"]/);
    });

    it(`has at least ${minSites} redactForLogs( call site(s)`, () => {
      const matches = content.match(/redactForLogs\(/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(minSites);
    });
  });

  it('total redactForLogs( call sites across all fixed files is at least 90 (audit estimated ~95 sites)', () => {
    let total = 0;
    for (const [relPath] of entries) {
      const abs = path.join(BACKEND_SRC, relPath);
      const content = fs.readFileSync(abs, 'utf8');
      total += (content.match(/redactForLogs\(/g) || []).length;
    }
    expect(total).toBeGreaterThanOrEqual(90);
  });
});
