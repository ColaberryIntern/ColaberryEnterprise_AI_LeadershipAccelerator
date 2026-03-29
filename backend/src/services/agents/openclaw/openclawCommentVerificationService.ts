import axios from 'axios';

export interface VerificationResult {
  visible: boolean;
  checked_at: Date;
  method: string;
  details?: string;
}

/**
 * Verify a Dev.to comment is publicly visible.
 * Uses the public comments API (no auth required).
 */
export async function verifyDevToComment(
  articleUrl: string,
  platformPostId: string,
): Promise<VerificationResult> {
  const checked_at = new Date();
  try {
    // Extract article ID from URL pattern: /username/slug-{id}
    // Dev.to articles have numeric IDs in the page source, but we can use the comments API
    // which accepts article slug as a_id parameter
    const slugMatch = articleUrl.match(/dev\.to\/[^/]+\/(.+?)(?:\?|#|$)/);
    if (!slugMatch) {
      return { visible: false, checked_at, method: 'devto_api', details: 'Could not parse article URL' };
    }

    // Fetch article to get its numeric ID
    const articleResp = await axios.get(`https://dev.to/api/articles/${slugMatch[1]}`, { timeout: 10000 });
    const articleId = articleResp.data?.id;
    if (!articleId) {
      return { visible: false, checked_at, method: 'devto_api', details: 'Could not resolve article ID' };
    }

    // Fetch all comments for this article
    const commentsResp = await axios.get(`https://dev.to/api/comments?a_id=${articleId}`, { timeout: 10000 });
    const comments = commentsResp.data || [];

    // Search recursively through comments and their children
    const findComment = (list: any[]): boolean => {
      for (const c of list) {
        const cId = String(c.id_code || c.id || '');
        if (cId === platformPostId || String(c.id) === platformPostId) return true;
        if (c.children && c.children.length > 0 && findComment(c.children)) return true;
      }
      return false;
    };

    const found = findComment(comments);
    return {
      visible: found,
      checked_at,
      method: 'devto_api',
      details: found ? `Comment ${platformPostId} found in ${comments.length} comments` : `Comment ${platformPostId} not found in ${comments.length} comments (possibly filtered)`,
    };
  } catch (err: any) {
    return { visible: false, checked_at, method: 'devto_api', details: `Error: ${err.message}` };
  }
}

/**
 * Verify a Hashnode comment is publicly visible.
 * Uses the public GraphQL API.
 */
export async function verifyHashnodeComment(
  postId: string,
  commentId: string,
): Promise<VerificationResult> {
  const checked_at = new Date();
  try {
    const query = `query {
      post(id: "${postId}") {
        comments(first: 50) {
          edges {
            node { id }
          }
        }
      }
    }`;

    const resp = await axios.post('https://gql.hashnode.com', { query }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    const edges = resp.data?.data?.post?.comments?.edges || [];
    const found = edges.some((e: any) => e.node?.id === commentId);

    return {
      visible: found,
      checked_at,
      method: 'hashnode_gql',
      details: found ? `Comment ${commentId} found` : `Comment ${commentId} not found in ${edges.length} comments`,
    };
  } catch (err: any) {
    return { visible: false, checked_at, method: 'hashnode_gql', details: `Error: ${err.message}` };
  }
}

/**
 * Verify a comment based on platform.
 */
export async function verifyComment(
  platform: string,
  articleUrl: string,
  platformPostId: string,
  signalDetails?: Record<string, any>,
): Promise<VerificationResult> {
  switch (platform) {
    case 'devto':
      return verifyDevToComment(articleUrl, platformPostId);
    case 'hashnode': {
      const postId = signalDetails?.post_id || '';
      return verifyHashnodeComment(postId, platformPostId);
    }
    default:
      return {
        visible: false,
        checked_at: new Date(),
        method: 'unsupported',
        details: `Verification not supported for platform: ${platform}`,
      };
  }
}
