import { parseBlogIndexHtml } from '../blogFeedParser';
import { deriveBlogTags, scoreBlogPost } from '../blogTagger';
import { deriveUserTagsFromText } from '../../timeline/networkVideoMatch';

/** Minimal Next.js page with the real __NEXT_DATA__ shape training.colaberry.com uses. */
function pageWith(posts: unknown): string {
  const data = { props: { pageProps: { posts } } };
  return `<!DOCTYPE html><html><head><title>Blog</title></head><body>
    <div id="__next">…</div>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>
  </body></html>`;
}

const POSTS = [
  {
    slug: 'rctf-prompting-for-accurate-data-code',
    title: 'RCTF Prompting for Accurate Data Code',
    excerpt: 'A prompt engineering framework for accurate Claude outputs.',
    authorName: 'Colaberry School',
    featuredImage: 'https://info.colaberry.com/hubfs/rctf.png',
    publishedAt: '2026-02-01T12:00:00Z',
    hubspotPostId: '111',
  },
  {
    slug: 'the-ai-layoff-wave-whos-safe-whos-not',
    title: "The AI Layoff Wave: Who's Safe, Who's Not",
    excerpt: 'What the wave of AI-driven layoffs means for your career.',
    authorName: 'Colaberry School',
    featuredImage: null,
    publishedAt: '2025-01-01T12:00:00Z',
    hubspotPostId: '222',
  },
];

describe('parseBlogIndexHtml', () => {
  it('parses posts out of __NEXT_DATA__ with url/thumbnail/date', () => {
    const posts = parseBlogIndexHtml(pageWith(POSTS));
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      slug: 'rctf-prompting-for-accurate-data-code',
      title: 'RCTF Prompting for Accurate Data Code',
      url: 'https://training.colaberry.com/blog/rctf-prompting-for-accurate-data-code',
      thumbnail_url: 'https://info.colaberry.com/hubfs/rctf.png',
      published_at: '2026-02-01T12:00:00Z',
      hubspot_post_id: '111',
    });
    expect(posts[1].thumbnail_url).toBeNull();
  });

  it('skips rows without a slug or title and survives junk shapes', () => {
    expect(parseBlogIndexHtml(pageWith([{ slug: '', title: 'x' }, { slug: 'ok', title: 'Ok' }]))).toHaveLength(1);
    expect(parseBlogIndexHtml(pageWith('not-an-array'))).toEqual([]);
    expect(parseBlogIndexHtml('<html><body>no next data</body></html>')).toEqual([]);
    expect(parseBlogIndexHtml('<script id="__NEXT_DATA__">{broken json</script>')).toEqual([]);
  });
});

describe('deriveBlogTags', () => {
  it('tags a prompt-engineering post with curriculum topics', () => {
    const tags = deriveBlogTags('RCTF Prompting for Accurate Data Code', 'A prompt engineering framework for Claude.');
    expect(tags).toEqual(expect.arrayContaining(['blog', 'prompt-engineering', 'claude']));
  });

  it('tags a career post', () => {
    const tags = deriveBlogTags("The AI Layoff Wave: Who's Safe, Who's Not", 'What layoffs mean for your career.');
    expect(tags).toContain('career');
  });
});

describe('scoreBlogPost — week match dominates', () => {
  const userTags = deriveUserTagsFromText('Registered Nurse in healthcare');
  const weekTags = deriveUserTagsFromText('Prompt Engineering + Prompt Library week with Claude');

  it('ranks the week-topic post above an unrelated post for the same student', () => {
    const promptPost = scoreBlogPost(
      deriveBlogTags('RCTF Prompting for Accurate Data Code', 'prompt engineering framework for Claude'),
      'RCTF Prompting for Accurate Data Code prompt engineering framework for Claude',
      userTags, weekTags, '2026-02-01T12:00:00Z',
    );
    const careerPost = scoreBlogPost(
      deriveBlogTags('The AI Layoff Wave', 'career impact of layoffs'),
      'The AI Layoff Wave career impact of layoffs',
      userTags, weekTags, '2026-02-01T12:00:00Z',
    );
    expect(promptPost).toBeGreaterThan(careerPost);
  });

  it('newer post wins a tie on matching', () => {
    const now = new Date('2026-07-16T00:00:00Z').getTime();
    const newer = scoreBlogPost(['blog'], 'same text', userTags, weekTags, '2026-07-01T00:00:00Z', now);
    const older = scoreBlogPost(['blog'], 'same text', userTags, weekTags, '2023-01-01T00:00:00Z', now);
    expect(newer).toBeGreaterThan(older);
  });
});
