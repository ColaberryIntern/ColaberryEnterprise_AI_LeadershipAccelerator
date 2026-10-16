import { deriveCampusAudience } from '../campusAudience';

const base = { isStaff: false, isOrgManager: false, isExplorer: false, isIntern: false };

describe('deriveCampusAudience', () => {
  it('member: an enrolled learner with no other role', () => {
    expect(deriveCampusAudience(base)).toEqual({ audience: 'member', isIntern: false });
  });

  it('explorer: a $0-to-start account', () => {
    expect(deriveCampusAudience({ ...base, isExplorer: true }).audience).toBe('explorer');
  });

  it('business: an org manager, even on an Explorer account', () => {
    expect(deriveCampusAudience({ ...base, isOrgManager: true }).audience).toBe('business');
    expect(deriveCampusAudience({ ...base, isOrgManager: true, isExplorer: true }).audience).toBe('business');
  });

  it('staff: wins over every other signal', () => {
    expect(deriveCampusAudience({ isStaff: true, isOrgManager: true, isExplorer: true, isIntern: true }).audience).toBe('staff');
  });

  it('intern: a member who also carries the intern flag', () => {
    expect(deriveCampusAudience({ ...base, isIntern: true })).toEqual({ audience: 'member', isIntern: true });
  });
});
