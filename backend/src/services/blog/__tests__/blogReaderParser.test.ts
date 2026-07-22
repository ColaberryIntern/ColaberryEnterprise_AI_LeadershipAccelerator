import { parseBlogPostHtml, sanitizeArticleHtml } from '../blogReaderParser';

/** Minimal Next.js post page with the real __NEXT_DATA__ shape training.colaberry.com
 *  uses for a single post: props.pageProps.post. */
function postPage(post: unknown): string {
  const data = { props: { pageProps: { post } } };
  // Next.js escapes `<` as < inside __NEXT_DATA__ so a `</script>` in the JSON
  // (e.g. a post body containing <script>) can't prematurely close the tag. Mirror it.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head><title>Post</title></head><body>
    <main class="snav-pad"><article>rendered</article></main>
    <script id="__NEXT_DATA__" type="application/json">${json}</script>
  </body></html>`;
}

const REAL_SHAPE = {
  slug: 'rctf-prompting-for-accurate-data-code',
  title: 'RCTF: Prompting for Accurate Data Code.',
  excerpt: 'Unlock the potential of AI in data analysis with the RCTF framework.',
  body: '<div><h2>The landscape of data analysis is shifting.</h2><p>We are part of the AI Co-Pilot revolution.</p><img src="https://1641429.fs1.hubspotusercontent-na1.net/hubfs/1641429/x.png"></div>',
  authorName: 'Colaberry School',
  featuredImage: 'https://info.colaberry.com/hubfs/rctf.png',
  publishedAt: '2026-01-30T13:00:16Z',
  hubspotPostId: '206392403370',
};

describe('parseBlogPostHtml', () => {
  it('extracts the sanitized article from a real-shaped post page', () => {
    const a = parseBlogPostHtml(postPage(REAL_SHAPE));
    expect(a).not.toBeNull();
    expect(a!.title).toBe('RCTF: Prompting for Accurate Data Code.');
    expect(a!.excerpt).toContain('RCTF framework');
    expect(a!.author).toBe('Colaberry School');
    expect(a!.featured_image).toBe('https://info.colaberry.com/hubfs/rctf.png');
    expect(a!.body_html).toContain('AI Co-Pilot revolution');
    expect(a!.body_html).toContain('<img');   // images preserved
  });

  it('strips scripts, styles, inline handlers, and javascript: urls from the body', () => {
    const dirty = {
      ...REAL_SHAPE,
      body: '<div>ok<script>steal()</script><style>*{}</style>'
        + '<img src="https://x/y.png" onerror="alert(1)">'
        + '<a href="javascript:alert(2)">x</a></div>',
    };
    const a = parseBlogPostHtml(postPage(dirty));
    expect(a).not.toBeNull();
    expect(a!.body_html).not.toMatch(/<script/i);
    expect(a!.body_html).not.toMatch(/<style/i);
    expect(a!.body_html).not.toMatch(/onerror/i);
    expect(a!.body_html).not.toMatch(/javascript:/i);
    expect(a!.body_html).toContain('<img');   // the image tag itself survives, only its handler is stripped
  });

  it('returns null on shape mismatch (no __NEXT_DATA__, bad JSON, or missing body/title)', () => {
    expect(parseBlogPostHtml('<html><body>no next data</body></html>')).toBeNull();
    expect(parseBlogPostHtml(postPage({ title: 'x' /* no body */ }))).toBeNull();
    expect(parseBlogPostHtml(postPage({ body: '<p>x</p>' /* no title */ }))).toBeNull();
    expect(parseBlogPostHtml('<script id="__NEXT_DATA__">{not json}</script>')).toBeNull();
  });
});

describe('sanitizeArticleHtml', () => {
  it('is idempotent and preserves benign markup', () => {
    const clean = '<div><h2>Title</h2><p>text</p><ul><li>a</li></ul><img src="https://x/y.png"></div>';
    expect(sanitizeArticleHtml(clean)).toBe(clean);
    expect(sanitizeArticleHtml(sanitizeArticleHtml(clean))).toBe(clean);
  });
});
