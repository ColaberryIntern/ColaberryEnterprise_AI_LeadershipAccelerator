import fs from 'fs';
import path from 'path';

/**
 * R16 — the Revenue Room is the one door into revenue.
 *
 * ── WHY THIS TEST EXISTS ─────────────────────────────────────────────────────────────────
 *
 * The Revenue Flow dashboard first shipped as its own page at `/admin/revenue-flow`, next to
 * the Revenue Room in the sidebar. Ali, on seeing it: "looks good - just not connected to
 * Revenue Room."
 *
 * Two sidebar entries covering overlapping initiatives is the same duplication he had already
 * had to point out once, when Commercialization and the Revenue Room each reported the same
 * annualized figure under a different name — one function, printed twice, on one page. The
 * fix then was absorption, and the fix now is absorption.
 *
 * So this asserts the three structural facts that keep it one door. They are read from the
 * source rather than rendered, because the regression is a DELETION — someone removing the
 * `<RevenueFlowDashboard />` line, or re-adding a sidebar entry "so it's easier to find" —
 * and a deleted render does not fail any behavioural test. It just quietly looks fine.
 */
const SRC = path.join(__dirname, '..', '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');

describe('the Revenue Room renders the Flow dashboard', () => {
  const roomPage = read('pages/admin/AdminRevenueRoomPage.tsx');

  it('imports and renders the dashboard component', () => {
    expect(roomPage).toMatch(/import RevenueFlowDashboard from/);
    expect(roomPage).toContain('<RevenueFlowDashboard />');
  });

  /**
   * "dashboard at the top so we can see the big picture and all the pieces that went into
   * it" — the order is the ask. The dashboard has to render BEFORE the initiative cards, not
   * underneath them.
   */
  it('renders it above the initiative cards, which is the order Ali asked for', () => {
    const dash = roomPage.indexOf('<RevenueFlowDashboard />');
    const cards = roomPage.indexOf('InitiativeCardView');
    expect(dash).toBeGreaterThan(-1);
    expect(cards).toBeGreaterThan(-1);
    // Compare against the LAST mention of the card view, since it is declared above as a
    // component before being used in the render tree.
    expect(dash).toBeLessThan(roomPage.lastIndexOf('InitiativeCardView'));
  });
});

describe('there is exactly one revenue entry in the sidebar', () => {
  const nav = read('components/Layout/adminNav.ts');

  it('keeps the Revenue Room', () => {
    expect(nav).toContain("path: '/admin/revenue-room'");
  });

  /**
   * The specific regression: re-adding `/admin/revenue-flow` to the sidebar. It would look
   * helpful and would restore the two-door problem.
   */
  it('does not list the Flow dashboard as a second entry', () => {
    expect(nav).not.toContain("'/admin/revenue-flow'");
  });
});

describe('the old page URL still resolves', () => {
  const routes = read('routes/adminRoutes.tsx');

  /**
   * The dashboard was live at `/admin/revenue-flow` in production before it moved, so
   * somebody may have bookmarked it or pasted it into a message. A moved page that 404s is a
   * worse outcome than the duplication this consolidation fixed.
   */
  it('redirects /admin/revenue-flow to the Revenue Room', () => {
    expect(routes).toMatch(
      /path="\/admin\/revenue-flow"\s+element=\{<Navigate to="\/admin\/revenue-room" replace \/>\}/,
    );
  });

  it('no longer lazy-loads a standalone Flow page', () => {
    expect(routes).not.toContain('AdminRevenueFlowPage');
  });

  /**
   * The drill-down route must still exist and must still come AFTER the bare room route, or
   * `:cardKey` swallows it. That ordering is why the dashboard was never placed at
   * `/admin/revenue-room/flow` in the first place.
   */
  it('keeps the card drill-down route, declared after the bare room route', () => {
    const bare = routes.indexOf('path="/admin/revenue-room"');
    const drill = routes.indexOf('path="/admin/revenue-room/:cardKey"');
    expect(bare).toBeGreaterThan(-1);
    expect(drill).toBeGreaterThan(bare);
  });
});

describe('the standalone page is gone, not just unlinked', () => {
  it('has no AdminRevenueFlowPage file left behind', () => {
    expect(fs.existsSync(path.join(SRC, 'pages/admin/AdminRevenueFlowPage.tsx'))).toBe(false);
  });
});
