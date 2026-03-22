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
): Promise<PostResult> {
  const apiKey = process.env.DEVTO_API_KEY;
  if (!apiKey) throw new Error('DEVTO_API_KEY not configured');

  const resp = await axios.post(
    'https://dev.to/api/comments',
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

  return {
    post_url: `https://dev.to/comment/${commentId}`,
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

  return {
    post_url: `https://hashnode.com/comment/${commentId}`,
    platform_post_id: String(commentId),
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
    default:
      return false;
  }
}
