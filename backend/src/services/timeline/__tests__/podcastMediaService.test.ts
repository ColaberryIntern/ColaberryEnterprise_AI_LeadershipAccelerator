import { deriveUserTagsFromText, matchScore } from '../networkVideoMatch';
import { buildPodcastMeta } from '../timelineAdminService';

describe('podcast personalization', () => {
  describe('matching a student to catalog episodes (shared matcher)', () => {
    it('an agents-focused student outranks a robotics episode', () => {
      const user = deriveUserTagsFromText('Goal: build AI agents to automate customer support');
      const agentsEp = matchScore(['agents', 'automation', 'openai'], 'The Rise of Agentic AI and Global Integration', user);
      const roboticsEp = matchScore(['robotics', 'hardware'], 'The Global Humanoid Robot Race', user);
      expect(agentsEp).toBeGreaterThan(roboticsEp);
    });

    it('a governance-focused student outranks a coding episode', () => {
      const user = deriveUserTagsFromText('AI governance and safety policy for the enterprise');
      const govEp = matchScore(['governance', 'safety'], 'The Crisis of Hidden AI Safety Throttling', user);
      const codeEp = matchScore(['coding'], 'Harness Engineering: the new architecture', user);
      expect(govEp).toBeGreaterThan(codeEp);
    });

    it('scores zero when nothing matches (pure-random fallback relies on jitter)', () => {
      expect(matchScore(['robotics'], 'humanoid robots', deriveUserTagsFromText('accounting'))).toBe(0);
    });
  });

  describe('buildPodcastMeta', () => {
    it('normalizes mode + optional lowercased category', () => {
      expect(buildPodcastMeta({ mode: 'random', category: ' Frontier-Models ' })).toEqual({ mode: 'random', podcast_category: 'frontier-models' });
      expect(buildPodcastMeta({ mode: 'link', category: null })).toEqual({ mode: 'link' });
    });

    it('omits podcast_category when blank (blank = whole catalog)', () => {
      expect(buildPodcastMeta({ mode: 'random', category: '   ' })).toEqual({ mode: 'random' });
      expect(buildPodcastMeta({ mode: 'random' })).toEqual({ mode: 'random' });
    });

    it('returns null for missing/invalid mode (no metadata written)', () => {
      expect(buildPodcastMeta(null)).toBeNull();
      expect(buildPodcastMeta(undefined)).toBeNull();
      expect(buildPodcastMeta({ mode: 'bogus', category: 'x' })).toBeNull();
      expect(buildPodcastMeta({ category: 'x' })).toBeNull();
    });
  });
});
