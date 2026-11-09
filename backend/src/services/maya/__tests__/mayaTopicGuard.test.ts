import { classifyNonAuthoritativeTopic } from '../mayaTopicGuard';

/** M31: the questions that must never reach the model. Real phrasings, and the near misses that must still reach it. */
describe('classifyNonAuthoritativeTopic', () => {
  it.each([
    ['How many seats are left?', 'seat_count'],
    ['are there any spots available in the next batch', 'seat_count'],
    ['Is the class full?', 'seat_count'],
    ['What is the deadline to enroll?', 'deadline'],
    ['When does registration close?', 'deadline'],
    ['last day to sign up?', 'deadline'],
    ['How long do I have to pay?', 'deadline'],
    ['Please delete my data', 'consent'],
    ['I want to opt out of texts', 'consent'],
    ['stop emailing me', 'consent'],
    ['What data do you have on me?', 'consent'],
    ['When does the next cohort start?', 'cohort_date'],
    ['what is the start date', 'cohort_date'],
    ['When is orientation?', 'cohort_date'],
  ])('%s -> %s', (text, topic) => {
    expect(classifyNonAuthoritativeTopic(text)).toBe(topic);
  });

  it.each([
    'How much does membership cost?',
    'What will I learn in week one?',
    'Can you give me a tour?',
    'Have someone call me',
    'I am free on Tuesday',
    '',
  ])('%s -> not governed (the normal reply answers it)', (text) => {
    expect(classifyNonAuthoritativeTopic(text)).toBeNull();
  });

  it('routes a two-part question to the most sensitive topic (consent beats seats)', () => {
    expect(classifyNonAuthoritativeTopic('How many seats are left, and can you delete my data?')).toBe('consent');
  });

  it('price is NOT governed here: the pricing rule of record already answers it', () => {
    expect(classifyNonAuthoritativeTopic('What is the price per month?')).toBeNull();
  });
});
