import { ALL_LINKS } from '../../../Layout/adminNav';
import { allowedMgmtNext, mgmtBridgeTo, mgmtNextAllowlist, MGMT_NEXT_ALLOWLIST } from '../../../../pages/portal/mgmtNext';
import { hqPathFor } from '../../../Layout/useAdminCampusPresence';

/** Campus HQ H3: every room reachable through the bridge, by exact allowlist, and the admin heartbeat's path reduction. */
const q = (p: string) => '?next=' + encodeURIComponent(p);

describe('the bridge allowlist is the admin sidebar', () => {
  it('allows every internal sidebar path, exactly', () => {
    for (const l of ALL_LINKS.filter((x) => x.path.startsWith('/admin/'))) {
      expect(allowedMgmtNext(q(l.path))).toBe(l.path);
      expect(mgmtBridgeTo(l.path)).toBe(`/portal/mgmt-enter${q(l.path)}`);
    }
  });

  it('keeps the three C6 destinations', () => {
    for (const p of ['/admin/growth-journey?tab=handoffs', '/admin/people', '/admin/accelerator']) expect(MGMT_NEXT_ALLOWLIST).toContain(p);
  });

  it.each([
    ['an absolute URL', 'https://evil.example'],
    ['a protocol-relative URL', '//evil'],
    ['a traversal', '/admin/../x'],
    ['an extra segment', '/admin/people/extra'],
    ['a query string that is not listed', '/admin/leads?x=1'],
    ['an external sidebar link', 'https://advisor.colaberry.ai/my-day/'],
    ['a portal path', '/portal/today'],
  ])('rejects %s (the bridge lands on its default)', (_n, p) => {
    expect(allowedMgmtNext(q(p))).toBeNull();
    expect(mgmtBridgeTo(p)).toBe('/portal/mgmt-enter');
  });

  it('a link added to the sidebar is allowed with no other edit', () => {
    const list = mgmtNextAllowlist([...ALL_LINKS, { path: '/admin/finance/invoices' }]);
    expect(allowedMgmtNext(q('/admin/finance/invoices'), list)).toBe('/admin/finance/invoices');
    expect(allowedMgmtNext(q('/admin/finance/invoices'))).toBeNull(); // not in today's sidebar
  });
});

describe('hqPathFor: the admin heartbeat sends the room, never the route', () => {
  it.each([
    ['/admin/leads', '/admin/leads'],
    ['/admin/leads/42', '/admin/leads'],
    ['/admin/marketing/brands', '/admin/marketing/brands'],
    ['/admin/marketing/composer', '/admin/marketing'],
    ['/admin/people/abc', null],
    ['/admin/apollo', null],
    ['/admin/leadsomething', null],
    ['/admin/ai-training-enter', null], // a bridge landing, not a page you work on
  ])('%s -> %s', (route, room) => {
    expect(hqPathFor(route)).toBe(room);
  });
});
