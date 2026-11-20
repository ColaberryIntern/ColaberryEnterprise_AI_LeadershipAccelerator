import { NAV_GROUPS, sectionForPath, visibleNavGroups } from '../adminNav';
import { SECTION_LABEL } from '../../../pages/admin/communityRoles/ExtraSectionsEditor';

/**
 * CH1.1 Communications Hub in the sidebar. Jackie (community_organizer) and Taiwo (revenue plus the
 * comms_hub extra) see it; a viewer without the section does not. The tabs are child paths of one
 * link, so ProtectedRoute resolves them by prefix with no UNLISTED_PATH_SECTIONS rows.
 */
const JACKIE = ['dashboard', 'comms_hub'];
const TAIWO = ['dashboard', 'revenue', 'leads', 'comms_hub'];
const REVENUE_ONLY = ['dashboard', 'revenue', 'leads'];
const can = (held: string[]) => (s: string) => held.includes(s);
const noFeeds = () => false;
const labels = (held: string[]) => visibleNavGroups(can(held), noFeeds).map((g) => g.label);

describe('CH1.1 Communications Hub nav entry', () => {
  it('is one group with one link at /admin/comms-hub under the comms_hub section', () => {
    const group = NAV_GROUPS.find((g) => g.section === 'comms_hub');
    expect(group).toBeDefined();
    expect(group!.label).toBe('Communications Hub');
    expect(group!.links.map((l) => l.path)).toEqual(['/admin/comms-hub']);
  });

  it('resolves the hub and every tab path to comms_hub', () => {
    for (const p of ['/admin/comms-hub', '/admin/comms-hub/events', '/admin/comms-hub/compose', '/admin/comms-hub/schedule']) {
      expect(sectionForPath(p)).toBe('comms_hub');
    }
  });

  it('does not capture lookalikes or its neighbours', () => {
    expect(sectionForPath('/admin/comms-hubx')).not.toBe('comms_hub');
    expect(sectionForPath('/admin/communications')).toBe('campaigns');
    expect(sectionForPath('/admin/events')).toBe('system');
  });

  it('shows for Jackie and Taiwo, not for revenue without the extra section', () => {
    expect(labels(JACKIE)).toContain('Communications Hub');
    expect(labels(TAIWO)).toContain('Communications Hub');
    expect(labels(REVENUE_ONLY)).not.toContain('Communications Hub');
  });

  it('is offered as an extra section with its sidebar name', () => {
    expect(SECTION_LABEL.comms_hub).toBe('Communications Hub');
  });
});
