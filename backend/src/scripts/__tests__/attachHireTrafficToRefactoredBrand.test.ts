jest.mock('../../config/database', () => ({ connectDatabase: jest.fn(), sequelize: {} }));
jest.mock('../../models', () => ({}));

import { planRecategorisation } from '../attachHireTrafficToRefactoredBrand';

/**
 * The repair writes only what the tracker itself would now answer, and nothing for a path
 * that still means nothing, so a re-run has no work and an unrelated path is never touched.
 */
describe('planRecategorisation', () => {
  it('files profiles, bookings and case studies the way the live tracker now does', () => {
    expect(planRecategorisation([
      { path: '/talent/ann-lee/', n: 40 },
      { path: '/talent/ann-lee/schedule/', n: 9 },
      { path: '/case-studies/claims-triage-copilot/', n: 12 },
      { path: '/intro/', n: 3 },
    ])).toEqual([
      { path: '/talent/ann-lee/', to: 'case_studies', n: 40 },
      { path: '/talent/ann-lee/schedule/', to: 'contact', n: 9 },
      { path: '/case-studies/claims-triage-copilot/', to: 'case_studies', n: 12 },
      { path: '/intro/', to: 'contact', n: 3 },
    ]);
  });

  it('plans nothing for a path that is still uncategorised, or for no rows', () => {
    expect(planRecategorisation([{ path: '/talentpool', n: 2 }])).toEqual([]);
    expect(planRecategorisation([])).toEqual([]);
  });
});
