import { sanitizeFollowAlong, FOLLOW_LIMITS } from '../liveFollowAlong';

describe('sanitizeFollowAlong', () => {
  it('keeps a well-formed card', () => {
    const card = sanitizeFollowAlong({
      step: 'Hands-on 2 of 5', icon: '✅', heading: 'Teach Claude the check',
      body: 'Paste the prompt into Claude.', bullets: ['Copy it', 'Paste it'], install: true,
    });
    expect(card).toEqual({
      step: 'Hands-on 2 of 5', icon: '✅', heading: 'Teach Claude the check',
      body: 'Paste the prompt into Claude.', bullets: ['Copy it', 'Paste it'], install: true,
    });
  });

  it('drops anything without a heading, or that is not an object', () => {
    expect(sanitizeFollowAlong(undefined)).toBeNull();
    expect(sanitizeFollowAlong(null)).toBeNull();
    expect(sanitizeFollowAlong('hello')).toBeNull();
    expect(sanitizeFollowAlong([{ heading: 'x' }])).toBeNull();
    expect(sanitizeFollowAlong({ heading: '   ' })).toBeNull();
    expect(sanitizeFollowAlong({ body: 'no heading' })).toBeNull();
  });

  it('coerces non-string fields away and only honors install === true', () => {
    const card = sanitizeFollowAlong({ heading: 'H', step: 3, icon: {}, body: ['x'], bullets: 'nope', install: 'yes' });
    expect(card).toEqual({ heading: 'H' });
  });

  it('caps every field and the bullet count, and collapses whitespace', () => {
    const long = 'a'.repeat(5000);
    const card = sanitizeFollowAlong({
      heading: long, step: long, icon: long, body: long,
      bullets: Array.from({ length: 20 }, () => long).concat(['', '  ']),
    })!;
    expect(card.heading).toHaveLength(FOLLOW_LIMITS.heading);
    expect(card.step).toHaveLength(FOLLOW_LIMITS.step);
    expect(card.icon).toHaveLength(FOLLOW_LIMITS.icon);
    expect(card.body).toHaveLength(FOLLOW_LIMITS.body);
    expect(card.bullets).toHaveLength(FOLLOW_LIMITS.bullets);
    expect(card.bullets![0]).toHaveLength(FOLLOW_LIMITS.bullet);
    expect(sanitizeFollowAlong({ heading: '  two\n\n words  ' })).toEqual({ heading: 'two words' });
  });

  it('is idempotent: sanitizing a sanitized card changes nothing', () => {
    const once = sanitizeFollowAlong({ heading: ' Step  one ', bullets: [' a ', 'b'], install: true });
    expect(sanitizeFollowAlong(once)).toEqual(once);
  });
});
