import axios from 'axios';
import crypto from 'crypto';

interface PostResult {
  post_url: string;
  platform_post_id: string;
}

/**
 * Post a comment on a Dev.to article via their API.
 * Requires DEVTO_API_KEY environment variable.
 */
export async function postToDevTo(
  articleId: number | string,
  bodyMarkdown: string,
  articleUrl?: string,
): Promise<PostResult> {
  const apiKey = process.env.DEVTO_API_KEY;
  if (!apiKey) throw new Error('DEVTO_API_KEY not configured');

  const resp = await axios.post(
    'https://dev.to/api/v1/comments',
    {
      comment: {
        body_markdown: bodyMarkdown,
        commentable_id: Number(articleId),
        commentable_type: 'Article',
      },
    },
    {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    },
  );

  const comment = resp.data;
  const commentId = comment.id_code || comment.id;

  // Dev.to renders comments client-side — fragment anchors cause refresh loops.
  // Link to the article page directly; comment is visible in the comments section.
  const postUrl = articleUrl
    ? articleUrl.replace(/\/$/, '')
    : `https://dev.to/comment/${commentId}`;

  return {
    post_url: postUrl,
    platform_post_id: String(commentId),
  };
}

/**
 * Post a comment (reply) on a Hashnode article via their GraphQL API.
 * Requires HASHNODE_ACCESS_TOKEN environment variable.
 */
export async function postToHashnode(
  postId: string,
  contentMarkdown: string,
  articleUrl?: string,
): Promise<PostResult> {
  const token = process.env.HASHNODE_ACCESS_TOKEN;
  if (!token) throw new Error('HASHNODE_ACCESS_TOKEN not configured');

  const mutation = `mutation AddComment($input: AddCommentInput!) {
    addComment(input: $input) {
      comment {
        id
      }
    }
  }`;

  const resp = await axios.post(
    'https://gql.hashnode.com',
    {
      query: mutation,
      variables: {
        input: {
          postId,
          contentMarkdown,
        },
      },
    },
    {
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    },
  );

  const errors = resp.data?.errors;
  if (errors && errors.length > 0) {
    throw new Error(`Hashnode API error: ${errors[0].message}`);
  }

  const commentId = resp.data?.data?.addComment?.comment?.id;
  if (!commentId) throw new Error('Hashnode comment creation returned no ID');

  // Hashnode comments live on the article page — link to the article directly
  const postUrl = articleUrl
    ? articleUrl.replace(/\/$/, '')
    : `https://hashnode.com/comment/${commentId}`;

  return {
    post_url: postUrl,
    platform_post_id: String(commentId),
  };
}

/**
 * Publish an article to Medium via their API.
 * Requires MEDIUM_INTEGRATION_TOKEN environment variable.
 * Medium publishes articles (not comments) -content is repurposed as a standalone piece.
 */
export async function postToMedium(
  title: string,
  contentMarkdown: string,
  tags: string[] = ['artificial-intelligence', 'ai', 'machine-learning'],
): Promise<PostResult> {
  const token = process.env.MEDIUM_INTEGRATION_TOKEN;
  if (!token) throw new Error('MEDIUM_INTEGRATION_TOKEN not configured');

  // Get authenticated user ID
  const meResp = await axios.get('https://api.medium.com/v1/me', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  const userId = meResp.data?.data?.id;
  if (!userId) throw new Error('Could not retrieve Medium user ID');

  // Publish article as draft (admin reviews on Medium before publishing)
  const resp = await axios.post(
    `https://api.medium.com/v1/users/${userId}/posts`,
    {
      title,
      contentFormat: 'markdown',
      content: contentMarkdown,
      tags: tags.slice(0, 5),
      publishStatus: 'draft',
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    },
  );

  const post = resp.data?.data;
  if (!post?.id) throw new Error('Medium post creation returned no ID');

  return {
    post_url: post.url || `https://medium.com/p/${post.id}`,
    platform_post_id: String(post.id),
  };
}

/**
 * Post a reply on a Discourse forum topic.
 * Requires DISCOURSE_{FORUM}_API_KEY and DISCOURSE_{FORUM}_USERNAME env vars,
 * where {FORUM} is the forum name uppercased (e.g., DISCOURSE_HF_API_KEY).
 */
export async function postToDiscourse(
  forumBaseUrl: string,
  topicId: number,
  content: string,
  forumEnvPrefix?: string,
): Promise<PostResult> {
  // Try forum-specific env vars, fall back to generic
  const prefix = forumEnvPrefix || 'DISCOURSE';
  const apiKey = process.env[`${prefix}_API_KEY`] || process.env.DISCOURSE_API_KEY;
  const apiUsername = process.env[`${prefix}_USERNAME`] || process.env.DISCOURSE_USERNAME;
  if (!apiKey) throw new Error(`${prefix}_API_KEY not configured`);
  if (!apiUsername) throw new Error(`${prefix}_USERNAME not configured`);

  const resp = await axios.post(
    `${forumBaseUrl}/posts.json`,
    {
      topic_id: topicId,
      raw: content,
    },
    {
      headers: {
        'Api-Key': apiKey,
        'Api-Username': apiUsername,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    },
  );

  const post = resp.data;
  if (!post?.id) throw new Error('Discourse post creation returned no ID');

  return {
    post_url: `${forumBaseUrl}/t/${post.topic_slug || 'topic'}/${topicId}/${post.post_number || ''}`,
    platform_post_id: String(post.id),
  };
}

/**
 * Post a reply to a tweet on Twitter/X via API v2.
 * Requires OAuth 1.0a User Context (TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET).
 */
export async function postToTwitter(
  tweetId: string,
  content: string,
): Promise<PostResult> {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error('Twitter OAuth credentials not configured (TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET)');
  }

  const url = 'https://api.twitter.com/2/tweets';
  const method = 'POST';
  const body = JSON.stringify({ text: content, reply: { in_reply_to_tweet_id: tweetId } });

  // OAuth 1.0a signature generation using Node crypto
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const paramStr = Object.keys(oauthParams).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
    .join('&');
  const baseStr = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramStr)}`;
  const sigKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;
  oauthParams.oauth_signature = crypto.createHmac('sha1', sigKey).update(baseStr).digest('base64');

  const authHeader = 'OAuth ' + Object.keys(oauthParams).sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  const resp = await axios.post(url, body, {
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  const newTweetId = resp.data?.data?.id;
  if (!newTweetId) throw new Error('Twitter tweet creation returned no ID');

  return {
    post_url: `https://twitter.com/i/status/${newTweetId}`,
    platform_post_id: String(newTweetId),
  };
}

/**
 * Post a reply on Bluesky via AT Protocol.
 * Requires BLUESKY_HANDLE and BLUESKY_APP_PASSWORD environment variables.
 */
export async function postToBluesky(
  parentUri: string,
  content: string,
  parentCid?: string,
): Promise<PostResult> {
  const handle = process.env.BLUESKY_HANDLE;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !appPassword) throw new Error('BLUESKY_HANDLE and BLUESKY_APP_PASSWORD not configured');

  // Authenticate -get session token
  const sessionResp = await axios.post('https://bsky.social/xrpc/com.atproto.server.createSession', {
    identifier: handle,
    password: appPassword,
  }, { timeout: 15000 });
  const { accessJwt, did } = sessionResp.data;
  if (!accessJwt || !did) throw new Error('Bluesky authentication failed');

  // If we don't have the CID, fetch the parent post to get it
  let resolvedCid = parentCid;
  if (!resolvedCid) {
    const threadResp = await axios.get('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread', {
      params: { uri: parentUri, depth: 0 },
      timeout: 15000,
    });
    resolvedCid = threadResp.data?.thread?.post?.cid;
    if (!resolvedCid) throw new Error('Could not resolve Bluesky parent CID');
  }

  // Create reply record
  const rkey = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const resp = await axios.post('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    repo: did,
    collection: 'app.bsky.feed.post',
    rkey,
    record: {
      $type: 'app.bsky.feed.post',
      text: content,
      reply: {
        root: { uri: parentUri, cid: resolvedCid },
        parent: { uri: parentUri, cid: resolvedCid },
      },
      createdAt: new Date().toISOString(),
    },
  }, {
    headers: { Authorization: `Bearer ${accessJwt}`, 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  const newUri = resp.data?.uri;
  const newRkey = newUri?.split('/').pop() || rkey;

  return {
    post_url: `https://bsky.app/profile/${handle}/post/${newRkey}`,
    platform_post_id: newUri || newRkey,
  };
}

/**
 * Post a comment on a YouTube video via Data API v3.
 * Requires YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN.
 */
export async function postToYouTube(
  videoId: string,
  content: string,
): Promise<PostResult> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('YouTube OAuth credentials not configured (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)');
  }

  // Refresh the access token
  const tokenResp = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }, { timeout: 15000 });
  const accessToken = tokenResp.data?.access_token;
  if (!accessToken) throw new Error('YouTube token refresh failed');

  // Post comment
  const resp = await axios.post(
    'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet',
    {
      snippet: {
        videoId,
        topLevelComment: {
          snippet: { textOriginal: content },
        },
      },
    },
    {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    },
  );

  const commentId = resp.data?.id;
  if (!commentId) throw new Error('YouTube comment creation returned no ID');

  return {
    post_url: `https://www.youtube.com/watch?v=${videoId}&lc=${commentId}`,
    platform_post_id: String(commentId),
  };
}

/**
 * Post a comment on a Product Hunt launch via GraphQL API.
 * Requires PRODUCTHUNT_ACCESS_TOKEN environment variable.
 */
export async function postToProductHunt(
  postId: string,
  content: string,
): Promise<PostResult> {
  const token = process.env.PRODUCTHUNT_ACCESS_TOKEN;
  if (!token) throw new Error('PRODUCTHUNT_ACCESS_TOKEN not configured');

  const mutation = `mutation {
    commentCreate(input: { postId: "${postId}", body: "${content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" }) {
      comment { id url }
    }
  }`;

  const resp = await axios.post(
    'https://api.producthunt.com/v2/api/graphql',
    { query: mutation },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    },
  );

  const errors = resp.data?.errors;
  if (errors && errors.length > 0) {
    throw new Error(`Product Hunt API error: ${errors[0].message}`);
  }

  const comment = resp.data?.data?.commentCreate?.comment;
  if (!comment?.id) throw new Error('Product Hunt comment creation returned no ID');

  return {
    post_url: comment.url || `https://www.producthunt.com/posts/${postId}#comment-${comment.id}`,
    platform_post_id: String(comment.id),
  };
}

/**
 * Check if a platform has API credentials configured for automated posting.
 */
export function hasPlatformCredentials(platform: string): boolean {
  switch (platform) {
    case 'devto':
      return !!process.env.DEVTO_API_KEY;
    case 'hashnode':
      return !!process.env.HASHNODE_ACCESS_TOKEN;
    case 'medium':
      return !!process.env.MEDIUM_INTEGRATION_TOKEN;
    case 'discourse':
      return !!process.env.DISCOURSE_API_KEY;
    case 'twitter':
      return !!process.env.TWITTER_BEARER_TOKEN && !!process.env.TWITTER_ACCESS_TOKEN;
    case 'bluesky':
      return !!process.env.BLUESKY_HANDLE && !!process.env.BLUESKY_APP_PASSWORD;
    case 'youtube':
      return !!process.env.YOUTUBE_API_KEY && !!process.env.YOUTUBE_REFRESH_TOKEN;
    case 'producthunt':
      return !!process.env.PRODUCTHUNT_ACCESS_TOKEN;
    // Reddit uses browser-based posting (cookie auth), not API credentials
    default:
      return false;
  }
}
