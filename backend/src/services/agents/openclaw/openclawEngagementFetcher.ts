/**
 * Platform API fetchers for engagement detection.
 * Supports Dev.to, Hashnode, and Discourse (public APIs).
 * LinkedIn/Reddit/Quora require manual entry via admin UI.
 */

interface FetchedEngagement {
  platform: string;
  source_url: string;
  engagement_type: 'reply' | 'comment' | 'mention' | 'reaction';
  user_name: string;
  user_title?: string;
  content: string;
  created_at: string;
}

/**
 * Fetch comments on a Dev.to article by URL.
 */
export async function fetchDevtoComments(postUrl: string): Promise<FetchedEngagement[]> {
  try {
    // Extract article ID from URL: https://dev.to/user/slug -> lookup via API
    const slug = postUrl.replace(/^https?:\/\/dev\.to\//, '');
    const articleRes = await fetch(`https://dev.to/api/articles/${slug}`);
    if (!articleRes.ok) return [];
    const article: any = await articleRes.json();
    const articleId = article.id;

    const commentsRes = await fetch(`https://dev.to/api/comments?a_id=${articleId}`);
    if (!commentsRes.ok) return [];
    const comments: any[] = await commentsRes.json() as any;

    return comments.map((c: any) => ({
      platform: 'devto',
      source_url: `https://dev.to/comment/${c.id_code}`,
      engagement_type: 'comment' as const,
      user_name: c.user?.username || 'unknown',
      content: stripHtml(c.body_html || ''),
      created_at: c.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch comments on a Hashnode article by URL.
 * Uses Hashnode GraphQL API.
 */
export async function fetchHashnodeComments(postUrl: string): Promise<FetchedEngagement[]> {
  try {
    // Extract slug from URL: https://blog.example.com/post-slug
    const urlParts = new URL(postUrl);
    const slug = urlParts.pathname.replace(/^\//, '').replace(/\/$/, '');

    const query = `
      query {
        post(slug: "${slug}", hostname: "${urlParts.hostname}") {
          comments(first: 50) {
            edges {
              node {
                id
                content { text }
                author { username name }
                dateAdded
              }
            }
          }
        }
      }
    `;

    const res = await fetch('https://gql.hashnode.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const edges = data?.data?.post?.comments?.edges || [];

    return edges.map((e: any) => ({
      platform: 'hashnode',
      source_url: postUrl,
      engagement_type: 'comment' as const,
      user_name: e.node.author?.username || e.node.author?.name || 'unknown',
      content: e.node.content?.text || '',
      created_at: e.node.dateAdded,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch replies on a Discourse topic by URL.
 */
export async function fetchDiscourseReplies(postUrl: string): Promise<FetchedEngagement[]> {
  try {
    // Extract topic path: https://forum.example.com/t/slug/123
    const urlParts = new URL(postUrl);
    const topicMatch = urlParts.pathname.match(/\/t\/[^/]+\/(\d+)/);
    if (!topicMatch) return [];
    const topicId = topicMatch[1];

    const res = await fetch(`${urlParts.origin}/t/${topicId}.json`);
    if (!res.ok) return [];
    const data: any = await res.json();
    const posts = data.post_stream?.posts || [];

    // Skip first post (it's the original), return replies
    return posts.slice(1).map((p: any) => ({
      platform: 'discourse',
      source_url: `${urlParts.origin}/t/${data.slug}/${topicId}/${p.post_number}`,
      engagement_type: 'reply' as const,
      user_name: p.username || 'unknown',
      user_title: p.user_title || undefined,
      content: stripHtml(p.cooked || ''),
      created_at: p.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Route to the correct platform fetcher based on URL.
 */
export async function fetchEngagementsForUrl(postUrl: string): Promise<FetchedEngagement[]> {
  if (postUrl.includes('dev.to')) return fetchDevtoComments(postUrl);
  if (postUrl.includes('hashnode.com')) return fetchHashnodeComments(postUrl);
  // Discourse forums — check for /t/ pattern
  if (/\/t\/[^/]+\/\d+/.test(postUrl)) return fetchDiscourseReplies(postUrl);
  return [];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export type { FetchedEngagement };
