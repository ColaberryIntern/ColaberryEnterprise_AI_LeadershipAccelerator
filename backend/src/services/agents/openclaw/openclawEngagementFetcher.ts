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
 * Fetch replies to a tweet on Twitter/X via Search API v2.
 */
export async function fetchTwitterReplies(postUrl: string): Promise<FetchedEngagement[]> {
  try {
    const bearer = process.env.TWITTER_BEARER_TOKEN;
    if (!bearer) return [];
    // Extract tweet ID from URL: https://twitter.com/i/status/123456
    const tweetIdMatch = postUrl.match(/status\/(\d+)/);
    if (!tweetIdMatch) return [];
    const tweetId = tweetIdMatch[1];

    const res = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?query=conversation_id:${tweetId}&max_results=20&tweet.fields=author_id,created_at&expansions=author_id&user.fields=username`,
      { headers: { Authorization: `Bearer ${bearer}` } },
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    const tweets = data?.data || [];
    const users: Record<string, string> = {};
    for (const u of data?.includes?.users || []) users[u.id] = u.username;

    return tweets
      .filter((t: any) => t.id !== tweetId) // exclude original tweet
      .map((t: any) => ({
        platform: 'twitter',
        source_url: `https://twitter.com/i/status/${t.id}`,
        engagement_type: 'reply' as const,
        user_name: users[t.author_id] || 'unknown',
        content: t.text || '',
        created_at: t.created_at,
      }));
  } catch {
    return [];
  }
}

/**
 * Fetch replies to a Bluesky post via public AT Protocol API.
 */
export async function fetchBlueskyReplies(postUrl: string): Promise<FetchedEngagement[]> {
  try {
    // Convert URL https://bsky.app/profile/{handle}/post/{rkey} to AT URI
    const match = postUrl.match(/bsky\.app\/profile\/([^/]+)\/post\/([^/]+)/);
    if (!match) return [];
    const [, handle, rkey] = match;

    // Resolve handle to DID first
    const didRes = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`);
    if (!didRes.ok) return [];
    const didData: any = await didRes.json();
    const did = didData?.did;
    if (!did) return [];

    const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
    const threadRes = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=1`);
    if (!threadRes.ok) return [];
    const threadData: any = await threadRes.json();
    const replies = threadData?.thread?.replies || [];

    return replies.map((r: any) => {
      const post = r.post || {};
      const replyHandle = post.author?.handle || 'unknown';
      const replyRkey = post.uri?.split('/').pop() || '';
      return {
        platform: 'bluesky',
        source_url: `https://bsky.app/profile/${replyHandle}/post/${replyRkey}`,
        engagement_type: 'reply' as const,
        user_name: replyHandle,
        content: post.record?.text || '',
        created_at: post.record?.createdAt || '',
      };
    });
  } catch {
    return [];
  }
}

/**
 * Fetch replies to a YouTube comment via Data API v3.
 */
export async function fetchYouTubeComments(postUrl: string): Promise<FetchedEngagement[]> {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return [];
    // Extract comment ID from URL: ...&lc=commentId
    const lcMatch = postUrl.match(/[&?]lc=([^&]+)/);
    if (!lcMatch) return [];
    const commentId = lcMatch[1];

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/comments?part=snippet&parentId=${commentId}&maxResults=20&key=${apiKey}`,
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    const items = data?.items || [];

    return items.map((item: any) => ({
      platform: 'youtube',
      source_url: postUrl,
      engagement_type: 'reply' as const,
      user_name: item.snippet?.authorDisplayName || 'unknown',
      content: item.snippet?.textOriginal || item.snippet?.textDisplay || '',
      created_at: item.snippet?.publishedAt || '',
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch replies on a Product Hunt discussion via GraphQL.
 */
export async function fetchProductHuntComments(postUrl: string): Promise<FetchedEngagement[]> {
  try {
    const token = process.env.PRODUCTHUNT_ACCESS_TOKEN;
    if (!token) return [];
    // Extract post slug from URL: https://www.producthunt.com/posts/{slug}
    const slugMatch = postUrl.match(/producthunt\.com\/posts\/([^#?/]+)/);
    if (!slugMatch) return [];
    const slug = slugMatch[1];

    const query = `query {
      post(slug: "${slug}") {
        comments(first: 30) {
          edges {
            node {
              id body url createdAt
              user { username name }
            }
          }
        }
      }
    }`;

    const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const edges = data?.data?.post?.comments?.edges || [];

    return edges.map((e: any) => ({
      platform: 'producthunt',
      source_url: e.node.url || postUrl,
      engagement_type: 'comment' as const,
      user_name: e.node.user?.username || e.node.user?.name || 'unknown',
      content: e.node.body || '',
      created_at: e.node.createdAt || '',
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
  if (postUrl.includes('twitter.com') || postUrl.includes('x.com')) return fetchTwitterReplies(postUrl);
  if (postUrl.includes('bsky.app')) return fetchBlueskyReplies(postUrl);
  if (postUrl.includes('youtube.com')) return fetchYouTubeComments(postUrl);
  if (postUrl.includes('producthunt.com')) return fetchProductHuntComments(postUrl);
  return [];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export type { FetchedEngagement };
