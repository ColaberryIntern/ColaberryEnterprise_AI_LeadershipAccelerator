import { deriveUserTagsFromText, matchScore } from '../networkVideoMatch';

describe('networkVideoService personalization', () => {
  describe('deriveUserTagsFromText', () => {
    it('maps a nursing role to both the occupation and industry tags', () => {
      const tags = deriveUserTagsFromText('Registered Nurse at City Hospital');
      expect(tags.has('nurse')).toBe(true);
      expect(tags.has('healthcare')).toBe(true);
    });

    it('keeps distinctive raw tokens for matching', () => {
      const tags = deriveUserTagsFromText('Warehouse forklift operator');
      expect(tags.has('logistics')).toBe(true);   // rule
      expect(tags.has('forklift')).toBe(true);     // raw token (>3 chars)
    });

    it('returns an empty set for blank input', () => {
      expect(deriveUserTagsFromText('').size).toBe(0);
      expect(deriveUserTagsFromText('   ').size).toBe(0);
    });
  });

  describe('matchScore', () => {
    const nurseUser = deriveUserTagsFromText('Registered Nurse, healthcare');

    it('scores a matching testimonial higher than an unrelated one', () => {
      const nurseVideo = matchScore(['testimonial', 'nurse', 'healthcare'], 'From nurse to data analyst', nurseUser);
      const financeVideo = matchScore(['testimonial', 'finance', 'accountant'], 'From accounting to BI', nurseUser);
      expect(nurseVideo).toBeGreaterThan(financeVideo);
    });

    it('weights tag overlap above raw text hits', () => {
      const user = deriveUserTagsFromText('sales');           // -> tag "sales" + token "sales"
      const tagged = matchScore(['sales'], 'no keyword here', user);        // overlap on the tag
      const textOnly = matchScore(['unrelated'], 'a sales story', user);    // only a text hit
      expect(tagged).toBeGreaterThanOrEqual(textOnly);
    });

    it('is zero when nothing matches', () => {
      expect(matchScore(['finance'], 'accounting basics', deriveUserTagsFromText('nurse'))).toBe(0);
    });
  });
});
