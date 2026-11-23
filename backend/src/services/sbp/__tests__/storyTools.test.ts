/**
 * ShiftFill v10 (2026-11-23, project fc6a04b4): STORY-005 told the student to
 * "Use Google Maps API for commute distance". The student named Gmail, Slack,
 * Google Sheets and Twilio SMS, nothing else. Story text and the CONSTRAINT
 * below are v10's, verbatim.
 */
import { markUnnamedApis, unnamedApis, unnamedApiNote } from '../storyTools';
import { PlanRequirement, PlanStory } from '../planContract';

const CONSTRAINT = {
  id: 'REQ-016', kind: 'CONSTRAINT', priority: 'must', cluster: 'c',
  statement: 'The system must use Gmail, Slack, Google Sheets, and Twilio SMS for communication and data handling.',
} as PlanRequirement;
const story = (id: string, task_guidance: string, failure_paths: string[] = []): PlanStory =>
  ({ id, title: 't', narrative: 'As Dana, I want x, so that y.', acceptance: ['a'], failure_paths, task_guidance, fulfills: [], blocked_by: [], release: 'r1' }) as unknown as PlanStory;

const V10_005 = story(
  'STORY-005',
  'Consult the current schedule to determine who is off and under 40 hours. Use Google Maps API for commute distance. Ensure compliance with REQ-016 by using Gmail for any necessary communications.',
  ['Hygienist data is incomplete', 'Commute distance API fails', 'Overtime approval not received'],
);

describe('APIs the student never named', () => {
  it('marks v10 STORY-005 with both, by their own names', () => {
    const [out] = markUnnamedApis([V10_005], [CONSTRAINT]);
    expect(out.task_guidance).toContain('Use Google Maps API for commute distance.');
    expect(out.task_guidance).toContain('Ask before building: "Commute distance API", "Google Maps API" are not among the tools this project names.');
  });

  it('leaves the named tools alone, however they are written', () => {
    const named = story('S', 'Use Gmail API to send. Update via the Google Sheets API. Post with the Slack API. Text with the Twilio SMS API. If the API fails, retry.');
    const [out] = markUnnamedApis([named], [CONSTRAINT]);
    expect(out).toBe(named);
  });

  it('still catches an outside party\'s API when the party is named but its API is not (v5)', () => {
    expect(unnamedApis('Integrate with the temp agencies\' APIs.', new Set(['gmail']))).toEqual(['temp agencies\' API']);
  });

  it('never joins words across lines', () => {
    expect(unnamedApis('data is incomplete\nCommute distance API fails', new Set())).toEqual(['Commute distance API']);
  });

  it('is idempotent and returns untouched stories as the same objects', () => {
    const once = markUnnamedApis([V10_005], [CONSTRAINT]);
    const twice = markUnnamedApis(once, [CONSTRAINT]);
    expect(twice[0]).toBe(once[0]);
    expect(V10_005.task_guidance).not.toContain('Ask before building');
  });

  it('marks nothing without CONSTRAINT requirements to check against, or with no stories', () => {
    expect(markUnnamedApis([V10_005], [])[0]).toBe(V10_005);
    expect(markUnnamedApis([], [CONSTRAINT])).toEqual([]);
  });

  it('writes one phrase in the singular', () => {
    expect(unnamedApiNote(['Google Maps API'])).toBe('Ask before building: "Google Maps API" is not among the tools this project names. Check with the project owner whether to use it or where that data already lives.');
  });
});
