jest.mock('../recapStore');
import { loadAttendees } from '../recapStore';
import { lintRecapSummary, lintText } from '../recapLint';

/**
 * WL2.3 verifier follow-up: the recap overview is the same for every attendee and is shown on the
 * public class page, so it is checked against the class's own attendees. The 1:1 email body may
 * still greet the reader by name.
 */
const mockAttendees = loadAttendees as jest.Mock;
const SUMMARY = { headline: 'It Works While You Sleep', intro: 'Great question from Ana about phones.', ideas: [], steps: [], quote: '', homework: '' };

it('an overview that names someone who checked in is refused', async () => {
  mockAttendees.mockResolvedValue([{ name: 'Ana Ruiz', email: 'ana@x.com' }]);
  const v = await lintRecapSummary('s1', SUMMARY);
  expect(mockAttendees).toHaveBeenCalledWith('s1');
  expect(v).toEqual([{ field: 'intro', rule: 'attendee_data', match: 'Ana' }]);
});

it('the same overview passes for a class nobody named Ana attended', async () => {
  mockAttendees.mockResolvedValue([{ name: 'Marcus Lee', email: 'm@x.com' }]);
  expect(await lintRecapSummary('s2', SUMMARY)).toEqual([]);
});

it('a missing attendee list (mocked store) still lints the other rules', async () => {
  mockAttendees.mockResolvedValue(undefined);
  expect((await lintRecapSummary('s3', { ...SUMMARY, intro: 'Seats are free' })).map((x) => x.rule)).toEqual(['zero_price']);
});

it('the 1:1 email may greet the reader by name', () => {
  expect(lintText('text', 'Hi Ana, here is your class recap.')).toEqual([]);
});
