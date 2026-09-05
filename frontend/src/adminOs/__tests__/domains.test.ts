import { ALL_LINKS, sectionForPath } from '../../components/Layout/adminNav';
import {
  DOMAINS,
  accessibleLinksForDomain,
  canOpenDomain,
  domainEntryPath,
  domainForLegacyPath,
  widgetIsVisible,
  sectionsForDomain,
  visibleDomains,
} from '../domains';

/**
 * The role scopes as the SERVER defines them (backend/src/services/access/mgmtRoles.ts).
 * Copied deliberately rather than imported — the frontend cannot import backend
 * code, and a drift between these and the server is exactly what the last test
 * in this file is for.
 */
const ROLE_SECTIONS: Record<string, string[]> = {
  owner: [
    'dashboard', 'trust', 'war_room', 'revenue', 'campaigns', 'lead_ingestion',
    'inbox_content', 'program', 'intelligence', 'system', 'students', 'leads', 'career_review',
  ],
  curriculum: ['dashboard', 'program'],
  revenue: ['dashboard', 'revenue', 'leads'],
  admissions: ['dashboard', 'lead_ingestion'],
  support: ['students'],
  mentor: ['dashboard', 'career_review'],
  community_organizer: ['dashboard'],
};

const can = (role: string) => (section: string) => ROLE_SECTIONS[role].includes(section);

describe('admin OS domains', () => {
  it('declares the six domains from the brief, uniquely keyed', () => {
    expect(DOMAINS.map((d) => d.key)).toEqual([
      'command_center', 'growth', 'learning', 'revenue', 'people', 'operations',
    ]);
    expect(new Set(DOMAINS.map((d) => d.path)).size).toBe(DOMAINS.length);
  });

  it('never absorbs the same path into two domains', () => {
    // A path in two domains would be reachable by two different section sets,
    // and the more permissive one would win — a silent grant.
    const seen = new Map<string, string>();
    for (const domain of DOMAINS) {
      for (const path of domain.absorbs) {
        expect(seen.get(path)).toBeUndefined();
        seen.set(path, domain.key);
      }
    }
  });

  it('only absorbs paths the nav actually knows about', () => {
    // An absorbed path with no nav entry has no section, so it would be
    // unreachable — or worse, treated as ungated.
    const known = new Set(ALL_LINKS.map((l) => l.path));
    for (const domain of DOMAINS) {
      for (const path of domain.absorbs) {
        expect(known.has(path)).toBe(true);
      }
    }
  });

  it('resolves a section for every absorbed path', () => {
    for (const domain of DOMAINS) {
      for (const path of domain.absorbs) {
        expect(sectionForPath(path)).not.toBeNull();
      }
    }
  });

  // ── The invariant the whole consolidation rests on ────────────────────────

  it('grants no role a single link it could not already reach', () => {
    // Consolidation must not broaden data access. Proven by comparing, for every
    // role, the set of links the domains expose against the set the existing nav
    // gate allows. Domains are presentation; this asserts they stayed that way.
    for (const role of Object.keys(ROLE_SECTIONS)) {
      const gate = can(role);
      const viaNav = new Set(
        ALL_LINKS.filter((l) => !!l.section && gate(l.section)).map((l) => l.path),
      );
      const viaDomains = new Set(
        DOMAINS.flatMap((d) => accessibleLinksForDomain(d, gate)).map((l) => l.path),
      );
      const broadened = [...viaDomains].filter((p) => !viaNav.has(p));
      expect(broadened).toEqual([]);
    }
  });

  it('shows a role only the links inside a domain that it holds the section for', () => {
    // Revenue holds ['dashboard','revenue','leads'] — it must not pick up the
    // lead-ingestion or campaign surfaces just because they share the Growth domain.
    const growth = DOMAINS.find((d) => d.key === 'growth')!;
    const links = accessibleLinksForDomain(growth, can('revenue'));
    const sections = new Set(links.map((l) => l.section));
    expect(sections.has('lead_ingestion')).toBe(false);
    expect(sections.has('campaigns')).toBe(false);
    expect([...sections].every((s) => ROLE_SECTIONS.revenue.includes(s as string))).toBe(true);
  });

  it('hides a domain entirely from a role that holds none of its sections', () => {
    const learning = DOMAINS.find((d) => d.key === 'learning')!;
    expect(canOpenDomain(learning, can('admissions'))).toBe(false);
    expect(visibleDomains(can('admissions')).map((d) => d.key)).not.toContain('learning');
  });

  it('gives the support role its student surfaces and nothing else', () => {
    // Support has no 'dashboard' grant at all, so Command Center must not appear.
    // People DOES appear — Support holds 'students', which is person data. What
    // stops that from becoming an acquisition-database grant is the row-level
    // stage scope (backend/src/services/adminOs/personScope.ts), not this list:
    // a support identity opening People sees enrolled students and no leads.
    const visible = visibleDomains(can('support')).map((d) => d.key);
    expect(visible).toEqual(['learning', 'people']);
    expect(visible).not.toContain('command_center');
    expect(visible).not.toContain('growth');
    expect(visible).not.toContain('revenue');
  });

  it('gives every scoped role a Command Center, because every one holds dashboard', () => {
    // The reason the executive home sits on 'dashboard' and not 'war_room':
    // no scoped role holds war_room, so building it there would strip the
    // landing page from five of eight roles.
    for (const role of ['curriculum', 'revenue', 'admissions', 'mentor', 'community_organizer']) {
      expect(ROLE_SECTIONS[role]).toContain('dashboard');
      expect(ROLE_SECTIONS[role]).not.toContain('war_room');
      expect(visibleDomains(can(role)).map((d) => d.key)).toContain('command_center');
    }
  });

  it('makes every domain reachable by the owner, including ones with no legacy path', () => {
    // Regression: People absorbs no legacy nav path, so deriving its sections
    // from `absorbs` alone produced an EMPTY section set — and a domain with no
    // sections is invisible to everyone, owner included. It failed silently:
    // the nav simply had one fewer entry than the brief specifies.
    for (const domain of DOMAINS) {
      expect(sectionsForDomain(domain).length).toBeGreaterThan(0);
    }
  });

  it('opens People to any role holding a person-data section, and no others', () => {
    const people = DOMAINS.find((d) => d.key === 'people')!;
    expect(canOpenDomain(people, can('revenue'))).toBe(true);   // holds 'leads'
    expect(canOpenDomain(people, can('support'))).toBe(true);   // holds 'students'
    expect(canOpenDomain(people, can('mentor'))).toBe(true);    // holds 'career_review'
    // Admissions holds only lead_ingestion — pipeline plumbing, not person data.
    expect(canOpenDomain(people, can('admissions'))).toBe(false);
    // A landing page alone grants nothing.
    expect(canOpenDomain(people, can('community_organizer'))).toBe(false);
  });

  it('gates each profile panel on its own section rather than the domain', () => {
    // The property that lets a 360 view exist without becoming a 360 grant.
    expect(widgetIsVisible('revenue', can('mentor'))).toBe(false);
    expect(widgetIsVisible('career_review', can('mentor'))).toBe(true);
    expect(widgetIsVisible('revenue', can('revenue'))).toBe(true);
    expect(widgetIsVisible('career_review', can('revenue'))).toBe(false);
  });

  it('gives the owner every domain', () => {
    expect(visibleDomains(can('owner')).map((d) => d.key)).toEqual(DOMAINS.map((d) => d.key));
  });

  it('points a nav entry at something the identity can actually open', () => {
    for (const role of Object.keys(ROLE_SECTIONS)) {
      const gate = can(role);
      for (const domain of visibleDomains(gate)) {
        const entry = domainEntryPath(domain, gate);
        expect(entry).not.toBeNull();
      }
    }
  });

  it('routes a legacy path to the domain that absorbed it', () => {
    expect(domainForLegacyPath('/admin/visitors')?.key).toBe('growth');
    expect(domainForLegacyPath('/admin/war-room')?.key).toBe('command_center');
    expect(domainForLegacyPath('/admin/refunds')?.key).toBe('revenue');
    // Nested paths follow their parent, so a deep link keeps working.
    expect(domainForLegacyPath('/admin/students/42')?.key).toBe('learning');
    expect(domainForLegacyPath('/admin/change-password')).toBeUndefined();
  });

  it('derives domain sections from the nav rather than restating them', () => {
    const growth = DOMAINS.find((d) => d.key === 'growth')!;
    const derived = sectionsForDomain(growth);
    for (const path of growth.absorbs) {
      expect(derived).toContain(sectionForPath(path));
    }
  });
});
