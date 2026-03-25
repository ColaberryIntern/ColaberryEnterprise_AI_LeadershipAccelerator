import axios from 'axios';

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

  // Dev.to comment URLs: article page with #comment-{id_code} anchor
  const postUrl = articleUrl
    ? `${articleUrl.replace(/\/$/, '')}#comment-${commentId}`
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
  const postUrl = articleUrl || `https://hashnode.com/comment/${commentId}`;

  return {
    post_url: postUrl,
    platform_post_id: String(commentId),
  };
}

/**
 * Publish an article to Medium via their API.
 * Requires MEDIUM_INTEGRATION_TOKEN environment variable.
 * Medium publishes articles (not comments) — content is repurposed as a standalone piece.
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
    default:
      return false;
  }
}
