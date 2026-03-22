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
 * Check if a platform has API credentials configured for automated posting.
 */
export function hasPlatformCredentials(platform: string): boolean {
  switch (platform) {
    case 'devto':
      return !!process.env.DEVTO_API_KEY;
    default:
      return false;
  }
}
