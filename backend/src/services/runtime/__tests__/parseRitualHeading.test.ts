/**
 * `parseRitualHeading` is the inverse of `composeBody`'s first line, and lives
 * beside it so the two cannot drift. Every surface that shows a ritual post
 * outside the Community feed needs it, to name the ritual ONCE: the Classroom
 * rail puts it on a pill and the body below it must not repeat it.
 */
import { parseRitualHeading, composeBody, RITUALS, DEFAULT_RITUAL } from '../communityRituals';

describe('parseRitualHeading', () => {
  it('round-trips what composeBody writes, for every ritual we ship', () => {
    for (const ritual of Object.values(RITUALS)) {
      const body = composeBody(ritual, Object.fromEntries(ritual.fields.filter((f) => f.kind !== 'link').map((f) => [f.key, 'an answer'])));
      const parsed = parseRitualHeading(body);
      expect(parsed).not.toBeNull();
      expect(parsed!.icon).toBe(ritual.icon);
      expect(parsed!.name).toBe(ritual.name);
      expect(parsed!.week).toBe(ritual.week);
      expect(parsed!.heading).toBe(`${ritual.icon} ${ritual.name} · Week ${ritual.week}`);
      // Everything after the heading survives, so a caller can render the body
      // without printing the ritual's name a second time.
      expect(parsed!.rest).toContain('an answer');
      expect(parsed!.rest).not.toContain(ritual.name);
    }
  });

  it('returns null for a free-text post — the normal case in the feed', () => {
    expect(parseRitualHeading('Shoutout to everyone grinding through this cohort.')).toBeNull();
    expect(parseRitualHeading('A line · with a dot but no week')).toBeNull();
    expect(parseRitualHeading('')).toBeNull();
    expect(parseRitualHeading(null)).toBeNull();
    expect(parseRitualHeading(undefined)).toBeNull();
  });

  it('requires the WEEK, which is what keeps prose containing a dot from matching', () => {
    expect(parseRitualHeading('🧩 Skill Drop · Week 2\n\nbody')).not.toBeNull();
    expect(parseRitualHeading('🧩 Skill Drop · Something Else\n\nbody')).toBeNull();
  });

  it('reads a heading with no body after it, and reports an empty rest', () => {
    const p = parseRitualHeading(`${DEFAULT_RITUAL.icon} ${DEFAULT_RITUAL.name} · Week ${DEFAULT_RITUAL.week}`);
    expect(p).not.toBeNull();
    expect(p!.rest).toBe('');
  });

  it('keeps every paragraph of the body, not just the first', () => {
    const p = parseRitualHeading('👋 Roll Call · Week 7\n\nfirst\n\nsecond\n\nthird')!;
    expect(p.rest).toBe('first\n\nsecond\n\nthird');
  });
});
