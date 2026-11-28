import fs from 'fs';
import path from 'path';
import { ACTIONS, buildManifest, ManifestResponse, paramsSchemaFor, SCREEN_PATHS } from '../agentManifest';
import serverCatalog from '../agentActions.json';

/**
 * AO2.2 the server's manifest agrees with the frontend's, and the param schemas are real validators.
 * The frontend cannot be imported from here, so its files are read as text, the same way the nav/gate agreement
 * tests read adminNav.ts.
 */
const FRONTEND = path.join(__dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'pages', 'admin', 'admissionsOps');

describe('AO2.2 frontend and backend manifests agree', () => {
  it('the server catalog is identical to the frontend screenActions.json (ids, levels, kinds, params, suggestions)', () => {
    const front = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'agent', 'screenActions.json'), 'utf8'));
    expect(serverCatalog).toEqual(front);
  });

  it('the server routes match the frontend screens.ts, screen for screen', () => {
    const src = fs.readFileSync(path.join(FRONTEND, 'screens.ts'), 'utf8');
    const front = Object.fromEntries([...src.matchAll(/\{ id: '(\w+)', path: '([^']*)'/g)].map((m) => [m[1], m[2]]));
    expect(Object.keys(front)).toHaveLength(16);
    expect(SCREEN_PATHS).toEqual(front);
  });
});

describe('AO2.2 the manifest', () => {
  const screens = buildManifest();

  it('lists all 16 screens with their actions, and satisfies the response contract', () => {
    expect(screens).toHaveLength(16);
    expect(ManifestResponse.safeParse({ screens }).success).toBe(true);
    expect(screens.find((s) => s.id === 'student360')?.route).toBe('/admin/admissions-ops/students/:ref');
    expect(screens.find((s) => s.id === 'today')?.route).toBe('/admin/admissions-ops');
  });

  it('every screen can be navigated to, and every suggestion points at an available navigate action', () => {
    for (const s of screens) {
      expect(s.actions.some((a) => a.id === `${s.id}.open` && a.kind === 'navigate' && a.available)).toBe(true);
      for (const sug of s.suggestions) {
        const a = ACTIONS.get(sug.action);
        expect({ suggestion: sug.action, ok: a?.kind === 'navigate' && a.available }).toEqual({ suggestion: sug.action, ok: true });
      }
    }
  });

  it('action ids are unique and prefixed by their screen', () => {
    const ids = screens.flatMap((s) => s.actions.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of screens) for (const a of s.actions) expect(a.id.startsWith(`${s.id}.`)).toBe(true);
  });

  it('Release 1 makes nothing above level 2 available, and every level-5 action is declared (prepare-only later)', () => {
    const all = [...ACTIONS.values()];
    expect(all.filter((a) => a.available && a.level > 2)).toEqual([]);
    expect(all.filter((a) => a.level === 5).map((a) => a.id).sort()).toEqual([
      'academics.draftCohortAnnouncement', 'communications.sendBulk', 'payments.requestRefund', 'tfcAudit.requestContractRecall', 'weeklyReport.sendToLeadership',
    ]);
  });

  it('no action lets the agent approve or decline', () => {
    for (const id of ACTIONS.keys()) expect(id).not.toMatch(/approve|decline|decide/i);
  });
});

describe('AO2.2 param schemas (validated on the server)', () => {
  it('accept the declared params', () => {
    expect(paramsSchemaFor('today.filter')!.safeParse({ section: 'payments' }).success).toBe(true);
    expect(paramsSchemaFor('admissions.createFollowUpTask')!.safeParse({ subjectRef: 'sample-1', dueOn: '2026-12-01' }).success).toBe(true);
    expect(paramsSchemaFor('today.open')!.safeParse({}).success).toBe(true);
    expect(paramsSchemaFor('students.filter')!.safeParse({}).success).toBe(true);
  });
  it('reject a missing required param, an empty or oversize string, a bad date and any undeclared param', () => {
    expect(paramsSchemaFor('today.filter')!.safeParse({}).success).toBe(false);
    expect(paramsSchemaFor('today.filter')!.safeParse({ section: '   ' }).success).toBe(false);
    expect(paramsSchemaFor('today.filter')!.safeParse({ section: 'x'.repeat(501) }).success).toBe(false);
    expect(paramsSchemaFor('admissions.createFollowUpTask')!.safeParse({ subjectRef: 'a', dueOn: '12/01/2026' }).success).toBe(false);
    expect(paramsSchemaFor('today.open')!.safeParse({ extra: 'x' }).success).toBe(false);
  });
  it('an unknown action has no schema', () => {
    expect(paramsSchemaFor('payments.approveRefund')).toBeNull();
  });
});
