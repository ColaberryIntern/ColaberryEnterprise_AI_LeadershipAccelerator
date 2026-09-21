/**
 * The chain from the portal's route table to the journey-nudge card (Growth
 * Journey OS Phase 5, T521 fix cycle 1). T514 mounted JourneyNudgeCard in
 * PortalDashboardPage.tsx; nothing routes to that page, the bundler dropped
 * it, and the live nginx bundle carried no card - found on production, not by
 * a test, because every test of the card rendered the card. This suite is the
 * check that was missing: the card's importers are exactly the wrapper, the
 * wrapper's importer is exactly TodayShell, and TodayShell is what
 * portalRoutes.tsx renders at /portal/today, where /portal/dashboard and
 * /portal/home redirect. Read from source, so a mount that drifts back into
 * a page nothing routes to fails here by name.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');
const ROUTES = fs.readFileSync(path.join(SRC, 'routes', 'portalRoutes.tsx'), 'utf8');
const SHELL = fs.readFileSync(path.join(SRC, 'pages', 'portal', 'today', 'TodayShell.tsx'), 'utf8');
const WRAPPER = fs.readFileSync(path.join(SRC, 'pages', 'portal', 'today', 'TodayJourneyNudges.tsx'), 'utf8');
const DEAD_PAGE = fs.readFileSync(path.join(SRC, 'pages', 'portal', 'PortalDashboardPage.tsx'), 'utf8');

/** Every .ts/.tsx file under src whose source contains `needle`, as paths relative to src, tests excluded. */
function filesContaining(needle: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full); continue; }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      if (fs.readFileSync(full, 'utf8').includes(needle)) out.push(path.relative(SRC, full).split(path.sep).join('/'));
    }
  };
  walk(SRC);
  return out.sort();
}

describe('the route to the card', () => {
  it('portalRoutes renders TodayShell at /portal/today, and the dashboard and home paths redirect there', () => {
    expect(ROUTES).toContain("const TodayShell = lazy(() => import('../pages/portal/today/TodayShell'));");
    expect(ROUTES).toMatch(/<Route path="\/portal\/today" element=\{<TodayShell \/>\} \/>/);
    expect(ROUTES).toMatch(/<Route path="\/portal\/dashboard" element=\{<Navigate to="\/portal\/today" replace \/>\} \/>/);
    expect(ROUTES).toMatch(/<Route path="\/portal\/home" element=\{<Navigate to="\/portal\/today" replace \/>\} \/>/);
    expect(ROUTES).not.toContain('PortalDashboardPage');
  });

  it('TodayShell mounts TodayJourneyNudges once, inside the sidebar, above the community pulse', () => {
    expect(SHELL).toContain("import TodayJourneyNudges from './TodayJourneyNudges';");
    expect(SHELL.match(/<TodayJourneyNudges \/>/g)).toHaveLength(1);
    const aside = SHELL.indexOf('<aside className="te-side">');
    const mount = SHELL.indexOf('<TodayJourneyNudges />');
    const pulse = SHELL.indexOf('<CommunityPulse />');
    expect(aside).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(aside);
    expect(pulse).toBeGreaterThan(mount);
  });

  it('TodayJourneyNudges renders JourneyNudgeCard from the journey-nudges route', () => {
    expect(WRAPPER).toContain("import JourneyNudgeCard, { type JourneyNudge } from '../../../components/portal/JourneyNudgeCard';");
    expect(WRAPPER).toContain('<JourneyNudgeCard nudges={nudges} onDismiss={onDismiss} />');
    expect(WRAPPER).toContain("export const JOURNEY_NUDGES_PATH = '/api/portal/journey-nudges';");
  });

  it('the importers are exactly the chain: the card by the wrapper only, the wrapper by TodayShell only', () => {
    expect(filesContaining("components/portal/JourneyNudgeCard'")).toEqual(['pages/portal/today/TodayJourneyNudges.tsx']);
    expect(filesContaining("from './TodayJourneyNudges'")).toEqual(['pages/portal/today/TodayShell.tsx']);
  });

  it('the page nothing routes to is back to what it was: no nudge, no journey read', () => {
    for (const mark of ['JourneyNudge', 'journey-nudges', 'dismissNudge']) expect(DEAD_PAGE).not.toContain(mark);
  });
});
