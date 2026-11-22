import { reachSentence } from '../RegistrantReachNote';

/** CH9.6 the words under "Registrants of <event> (in-app)": who it reaches, said plainly, never a made-up number. */
describe('reachSentence', () => {
  it('some reachable, some not', () => {
    expect(reachSentence({ registrants: 40, reachable: 12, eventbrite: 'ok' })).toBe('12 of 40 registrants have a platform account and will get it in the app. The others are not reached in-app.');
  });
  it('everyone reachable says nothing about the others; one person is singular', () => {
    expect(reachSentence({ registrants: 3, reachable: 3, eventbrite: 'ok' })).toBe('3 of 3 registrants have a platform account and will get it in the app.');
    expect(reachSentence({ registrants: 1, reachable: 0, eventbrite: 'ok' })).toBe('0 of 1 registrant has a platform account and will get it in the app. The others are not reached in-app.');
  });
  it('nobody registered yet, and later registrants are included', () => {
    expect(reachSentence({ registrants: 0, reachable: 0, eventbrite: 'ok' })).toContain('Nobody has registered yet');
  });
  it('Eventbrite unreadable: the count is partial and the send waits', () => {
    expect(reachSentence({ registrants: 2, reachable: 1, eventbrite: 'unavailable' })).toContain('counts only people who registered on our site; the send waits for Eventbrite.');
  });
});
