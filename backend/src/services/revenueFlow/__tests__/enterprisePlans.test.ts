import {
  SERVICE_ANSWERS,
  SERVICE_NOT_SURE,
  SERVICE_NOT_SURE_LABEL,
  attributionOf,
  normalizeService,
  serviceLabel,
} from '../enterprisePlans';

/**
 * R23 Phase 5 — what the intake form is allowed to say, and what the stored value means.
 *
 * These are pure functions over strings, so they are tested exhaustively here rather than
 * through a mocked query. Every case below is one a real submission can produce: today's
 * display words, the canonical keys the form now posts, a buyer's own phrasing, and the
 * things that arrive when something posts to the endpoint that is not our form.
 */

describe('normalizeService maps what arrived onto what we store', () => {
  it('passes the four canonical answers through untouched', () => {
    for (const answer of SERVICE_ANSWERS) {
      expect(normalizeService(answer)).toBe(answer);
    }
  });

  it('is idempotent, which is what makes the write path safe to re-run', () => {
    // normalize(normalize(x)) === normalize(x) for everything this function can be handed.
    // Without it, a replayed or retried submission could canonicalize a second time into a
    // different value, and the repo's idempotency rule is not negotiable about that.
    const corpus = [
      'Build', 'guide', 'TRAIN', 'Not sure yet', 'not_sure', '', '   ',
      'Training your team (10 people)', 'something nobody anticipated',
      'we want to work with your team', 'not sure, maybe training',
      'x'.repeat(80),
    ];
    for (const raw of corpus) {
      const once = normalizeService(raw);
      expect(normalizeService(once)).toBe(once);
    }
  });

  it('reads the display words the form posted BEFORE this phase', () => {
    // The compatibility case that decides the whole design. A page loaded before the deploy
    // still posts these, and they must keep working rather than 400.
    expect(normalizeService('Build')).toBe('build');
    expect(normalizeService('Guide')).toBe('guide');
    expect(normalizeService('Train')).toBe('train');
    expect(normalizeService('Not sure yet')).toBe(SERVICE_NOT_SURE);
  });

  it('is insensitive to case and surrounding whitespace', () => {
    expect(normalizeService('  BUILD  ')).toBe('build');
    expect(normalizeService('\tTrAiN\n')).toBe('train');
    expect(normalizeService('  Not Sure Yet ')).toBe(SERVICE_NOT_SURE);
  });

  it('lets an explicit "I have not decided" OUTRANK a plan name later in the sentence', () => {
    // The ordering trap, and the reason NOT_SURE_PHRASES is checked before planOf. Reading
    // the plan word out of this would file someone under Train who said the opposite.
    expect(normalizeService('not sure, maybe training')).toBe(SERVICE_NOT_SURE);
    expect(normalizeService('unsure between a new build and training')).toBe(SERVICE_NOT_SURE);
    expect(normalizeService("I don't know yet, perhaps guide")).toBe(SERVICE_NOT_SURE);
    expect(normalizeService('no idea, work with your team maybe')).toBe(SERVICE_NOT_SURE);
  });

  it('still reads a plan from a buyer\'s own phrasing when there is no disclaimer', () => {
    expect(normalizeService('Training your team (10 people)')).toBe('train');
    expect(normalizeService('we want to work with your team')).toBe('guide');
    expect(normalizeService('a new build please')).toBe('build');
    expect(normalizeService('upskill engineering')).toBe('train');
  });

  it('returns empty for blank, whitespace, null and undefined alike', () => {
    for (const raw of ['', '   ', '\n\t', null, undefined]) {
      expect(normalizeService(raw)).toBe('');
    }
  });

  it('keeps unmatched text verbatim rather than blanking it', () => {
    // Blanking would throw away the buyer's words AND make a failed match look identical to
    // a question nobody answered. Those are different problems with different fixes.
    expect(normalizeService('something nobody anticipated')).toBe('something nobody anticipated');
    expect(normalizeService('consulting')).toBe('consulting');
  });

  it('caps unmatched text at the column width, on the exact boundary', () => {
    // `enterprise_intakes.service` is STRING(50). 50 characters survive whole; 51 do not.
    expect(normalizeService('x'.repeat(50))).toHaveLength(50);
    expect(normalizeService('x'.repeat(51))).toHaveLength(50);
    expect(normalizeService('y'.repeat(400))).toBe('y'.repeat(50));
  });

  it('does not treat a word merely CONTAINING a canonical value as canonical', () => {
    // 'not_sureish' is not the answer "not sure"; it is unmatched text, and reporting it as
    // a recorded answer would overstate what we know.
    expect(normalizeService('not_sureish')).toBe('not_sureish');
  });
});

describe('attributionOf splits one old number into four meanings', () => {
  it('names each plan', () => {
    expect(attributionOf('build')).toBe('build');
    expect(attributionOf('Guide')).toBe('guide');
    expect(attributionOf('Training your team')).toBe('train');
  });

  it('distinguishes their undecided from our missing answer from unreadable text', () => {
    expect(attributionOf('not_sure')).toBe('not_sure');
    expect(attributionOf('Not sure yet')).toBe('not_sure');
    expect(attributionOf('')).toBe('unrecorded');
    expect(attributionOf(null)).toBe('unrecorded');
    expect(attributionOf(undefined)).toBe('unrecorded');
    expect(attributionOf('something nobody anticipated')).toBe('unreadable');
  });

  it('is total: every input lands in exactly one of the six outcomes', () => {
    const allowed = ['build', 'guide', 'train', 'not_sure', 'unrecorded', 'unreadable'];
    for (const raw of ['build', 'Guide', 'train', 'not_sure', '', '  ', null, undefined, 'zzz', 'x'.repeat(99)]) {
      expect(allowed).toContain(attributionOf(raw as string | null | undefined));
    }
  });
});

describe('serviceLabel renders a stored key for a human', () => {
  it('turns a key into the plan\'s own words', () => {
    expect(serviceLabel('build')).toBe('A new build');
    expect(serviceLabel('guide')).toBe('Work with your team');
    expect(serviceLabel('train')).toBe('Training your team');
  });

  it('words the undecided answer from the one constant that defines it', () => {
    expect(serviceLabel('not_sure')).toBe(SERVICE_NOT_SURE_LABEL);
    expect(serviceLabel('Not sure yet')).toBe(SERVICE_NOT_SURE_LABEL);
  });

  it('returns empty for a blank, leaving the caller\'s own wording for an unanswered question', () => {
    // `writtenBrief` prints "not stated" for this, and should keep being the one place that
    // decides how an unanswered question reads in the brief.
    expect(serviceLabel('')).toBe('');
    expect(serviceLabel(null)).toBe('');
  });

  it('echoes unmatched text rather than inventing a plan for it', () => {
    expect(serviceLabel('consulting')).toBe('consulting');
  });
});
