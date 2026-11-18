import { sanitizeClassification, GENERAL_CLASSIFICATION } from '../needClassifier';

describe('needClassifier.sanitizeClassification (pure)', () => {
  it('accepts a known group + subject', () => {
    const c = sanitizeClassification({ groupSlug: 'past_performance', subject: 'reporting', confidence: 0.9, newCategory: null });
    expect(c).toEqual({ groupSlug: 'past_performance', subject: 'reporting', confidence: 0.9, newCategory: null });
  });

  it('falls back to general for unknown group/subject', () => {
    const c = sanitizeClassification({ groupSlug: 'nonsense', subject: 'nonsense', confidence: 0.5 });
    expect(c.groupSlug).toBe('general');
    expect(c.subject).toBe('general');
  });

  it('accepts a well-formed new category and routes the group to it', () => {
    const c = sanitizeClassification({ groupSlug: 'cyber_attestation', subject: 'security', confidence: 0.7, newCategory: { slug: 'Cyber Attestation!', label: 'Cybersecurity attestation', kind: 'fact' } });
    expect(c.newCategory).toEqual({ slug: 'cyber_attestation', label: 'Cybersecurity attestation', kind: 'fact' });
    expect(c.groupSlug).toBe('cyber_attestation');
    expect(c.subject).toBe('security');
  });

  it('never lets a new category shadow a built-in slug', () => {
    const c = sanitizeClassification({ groupSlug: 'registrations', subject: 'general', newCategory: { slug: 'registrations', label: 'Dupe', kind: 'fact' } });
    expect(c.newCategory).toBeNull();
    expect(c.groupSlug).toBe('registrations');
  });

  it('clamps confidence to [0,1] and defaults to 0', () => {
    expect(sanitizeClassification({ groupSlug: 'pricing', confidence: 5 }).confidence).toBe(1);
    expect(sanitizeClassification({ groupSlug: 'pricing', confidence: -3 }).confidence).toBe(0);
    expect(sanitizeClassification({ groupSlug: 'pricing' }).confidence).toBe(0);
  });

  it('is total on garbage input', () => {
    expect(sanitizeClassification(null)).toEqual(GENERAL_CLASSIFICATION);
    expect(sanitizeClassification('x')).toEqual(GENERAL_CLASSIFICATION);
    expect(sanitizeClassification({})).toEqual(GENERAL_CLASSIFICATION);
  });
});
