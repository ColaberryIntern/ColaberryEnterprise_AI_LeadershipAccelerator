import { capabilityLabel } from '../StoryRelated';

describe('capabilityLabel (Keep reading card label)', () => {
  it('shows a slug as words', () => {
    expect(capabilityLabel('operational-ai-plain-english-to-safe-sql')).toBe('operational ai plain english to safe sql');
  });
  it('leaves a written label alone, hyphenated words included', () => {
    expect(capabilityLabel('A talent directory gated on published proof')).toBe('A talent directory gated on published proof');
    expect(capabilityLabel('Human-in-the-loop review')).toBe('Human-in-the-loop review');
  });
});
