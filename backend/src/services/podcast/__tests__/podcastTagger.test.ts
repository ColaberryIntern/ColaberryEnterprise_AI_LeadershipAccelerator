import {
  derivePodcastTags,
  derivePodcastCategory,
  DEFAULT_PODCAST_CATEGORY,
} from '../podcastTagger';

describe('derivePodcastTags', () => {
  it('extracts vendor + topic tags from title/description', () => {
    const tags = derivePodcastTags(
      'OpenAI Daybreak: GPT 5.5 Cyber and the Global Defense Push',
      'A look at agents, security, and model governance.'
    );
    expect(tags).toEqual(expect.arrayContaining(['openai', 'gpt', 'agents', 'security', 'governance']));
  });

  it('detects Anthropic/Claude and robotics', () => {
    expect(derivePodcastTags("Anthropic's Evolution and the Cryptography of AI Reasoning")).toEqual(
      expect.arrayContaining(['anthropic', 'reasoning'])
    );
    expect(derivePodcastTags('The Rise of Functional Humanoids: Atlas, G1, and Gatsby')).toEqual(
      expect.arrayContaining(['robotics'])
    );
  });

  it('keeps distinctive title tokens but drops stopwords', () => {
    const tags = derivePodcastTags('Subquadratic SSA Shattering the Quadratic Bottleneck');
    expect(tags).toEqual(expect.arrayContaining(['subquadratic', 'bottleneck']));
    expect(tags).not.toContain('the');
  });

  it('is deterministic and capped', () => {
    const a = derivePodcastTags('Claude 4.8 agents robotics governance', 'models reasoning voice hardware');
    const b = derivePodcastTags('Claude 4.8 agents robotics governance', 'models reasoning voice hardware');
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(14);
  });
});

describe('derivePodcastCategory', () => {
  it('buckets by dominant subject (specific before general)', () => {
    expect(derivePodcastCategory('The Rise of Functional Humanoids')).toBe('robotics-hardware');
    expect(derivePodcastCategory('Microsoft Copilot: The Rise of Agentic AI')).toBe('agents-automation');
    expect(derivePodcastCategory('The Crisis of Hidden AI Safety Throttling')).toBe('governance-safety');
    expect(derivePodcastCategory('Harness Engineering: coding with Cursor')).toBe('tools-coding');
    expect(derivePodcastCategory('Claude 4.8: Performance Gains and the Honesty Paradox')).toBe('frontier-models');
  });

  it('defaults to industry-news when nothing matches', () => {
    expect(derivePodcastCategory('A Quiet Week in Business Funding')).toBe(DEFAULT_PODCAST_CATEGORY);
  });
});
