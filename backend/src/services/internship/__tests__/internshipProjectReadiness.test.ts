import { readyForProject } from '../internshipProjectReadiness';
import type { InternActivity } from '../internshipActivityService';

// readyForProject is the crux: cleared the first-three-weeks gate AND no project
// yet. Pure — build just the fields it reads.
function activity(over: Partial<InternActivity>): InternActivity {
  return {
    enrollment_id: 'e1',
    training: { weeks: [], first_three_weeks: { done: 0, total: 3, ready: false } },
    project: null,
    cert_prep: null,
    case_studies: [],
    attendance: { total: 0, by_meeting: {}, last_attended_at: null },
    ...over,
  } as InternActivity;
}

describe('readyForProject', () => {
  it('is ready when the first three weeks are done and there is no project', () => {
    expect(readyForProject(activity({
      training: { weeks: [], first_three_weeks: { done: 3, total: 3, ready: true } },
      project: null,
    }))).toBe(true);
  });

  it('is NOT ready when the training gate is not cleared', () => {
    expect(readyForProject(activity({
      training: { weeks: [], first_three_weeks: { done: 2, total: 3, ready: false } },
    }))).toBe(false);
  });

  it('is NOT ready once they already have a project', () => {
    expect(readyForProject(activity({
      training: { weeks: [], first_three_weeks: { done: 3, total: 3, ready: true } },
      project: { name: 'PropertyPulse AI', stage: 'discovery', requirements_pct: null, repo_connected: true, total_stories: 22, verified_stories: 1 },
    }))).toBe(false);
  });

  it('is NOT ready when there is no training data at all', () => {
    expect(readyForProject(activity({ training: null }))).toBe(false);
  });
});
