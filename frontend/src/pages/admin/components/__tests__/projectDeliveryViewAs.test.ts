import { viewAsNextPath } from '../ProjectDeliveryView';

/**
 * viewAsNextPath decides where an admin "View as user" session lands for a project row: straight on the gov
 * cockpit for a gov build, and nowhere special (the member's Today page) for anything else. Keeping it pure and
 * tested means the deep-link cannot silently point at a page that does not exist for a non-gov project.
 */
describe('viewAsNextPath', () => {
  it('a gov build with a delivery project id opens on its cockpit', () => {
    expect(viewAsNextPath({ project_kind: 'gov', gov_delivery_project_id: 'dp-1' })).toBe('/portal/gov-projects/dp-1');
  });

  it('a gov build with no delivery project id yet has no deep-link', () => {
    expect(viewAsNextPath({ project_kind: 'gov', gov_delivery_project_id: null })).toBeNull();
  });

  it('a non-gov build has no per-project deep-link (lands on Today)', () => {
    expect(viewAsNextPath({ project_kind: null, gov_delivery_project_id: null })).toBeNull();
    expect(viewAsNextPath({ project_kind: undefined, gov_delivery_project_id: 'dp-2' })).toBeNull();
    expect(viewAsNextPath({ project_kind: 'sandbox', gov_delivery_project_id: 'dp-3' })).toBeNull();
  });
});
