import axios from 'axios';
import { OpenclawSignal } from '../../../models';
import { getOptimizedScanConfig } from './openclawSignalScaler';
import type { AgentExecutionResult, AgentAction } from '../types';

interface PlatformResult {
  platform: string;
  source_url: string;
  author: string;
  title: string;
  content_excerpt: string;
  details: Record<string, any>;
}

/**
 * OpenClaw Market Signal Agent
 * Scans public platform APIs for AI-related conversations matching target keywords.
 */
export async function runOpenclawMarketSignalAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const baseKeywords: string[] = config.keywords || ['AI training', 'enterprise AI', 'AI leadership'];
  const platforms: string[] = config.platforms || ['reddit', 'hackernews', 'devto', 'hashnode', 'discourse', 'twitter', 'bluesky', 'youtube', 'producthunt', 'facebook_groups', 'linkedin_comments'];
  const baseMaxSignals = config.max_signals_per_scan || 50;
  let totalCreated = 0;

  // Phase 4: Dynamic keyword + platform priority from learnings
  let keywords = baseKeywords;
  let platformMultipliers: Map<string, number> = new Map();
  try {
    const optimized = await getOptimizedScanConfig(baseKeywords, platforms);
    // Merge primary (top-performing) + secondary (base) keywords, deduped
    const allKeywords = [...optimized.keywords.primary, ...optimized.keywords.secondary];
    keywords = [...new Set(allKeywords)];
    for (const pp of optimized.platformPriorities) {
      platformMultipliers.set(pp.platform, pp.scan_frequency_multiplier);
    }
  } catch {
    // Non-fatal -fall back to base config
  }

  for (const platform of platforms) {
    try {
      const multiplier = platformMultipliers.get(platform) || 1.0;
      const maxSignals = Math.round(baseMaxSignals * multiplier);
      const results = await scanPlatform(platform, keywords, maxSignals, config);

      for (const item of results) {
        // Deduplicate by source_url
        const existing = await OpenclawSignal.findOne({
          where: { source_url: item.source_url },
        });
        if (existing) continue;

        await OpenclawSignal.create({
          platform: item.platform as any,
          source_url: item.source_url,
          author: item.author,
          title: item.title,
          content_excerpt: item.content_excerpt,
          topic_tags: keywords.filter((kw) =>
            (item.title + ' ' + item.content_excerpt).toLowerCase().includes(kw.toLowerCase()),
          ),
          status: 'discovered',
          discovered_at: new Date(),
          details: item.details,
          created_at: new Date(),
        });
        totalCreated++;
      }

      actions.push({
        campaign_id: '',
        action: 'scan_platform',
        reason: `Scanned ${platform}: found ${results.length} results, created ${totalCreated} new signals`,
        confidence: 0.85,
        before_state: null,
        after_state: { platform, results_found: results.length },
        result: 'success',
        entity_type: 'system',
      });
    } catch (err: any) {
      errors.push(`${platform}: ${err.message}`);
      actions.push({
        campaign_id: '',
        action: 'scan_platform_error',
        reason: `Failed to scan ${platform}: ${err.message}`,
        confidence: 1,
        before_state: null,
        after_state: { platform, error: err.message },
        result: 'failed',
        entity_type: 'system',
      });
    }
  }

  return {
    agent_name: 'OpenclawMarketSignalAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: totalCreated,
  };
}

async function scanPlatform(
  platform: string,
  keywords: string[],
  maxResults: number,
  config: Record<string, any> = {},
): Promise<PlatformResult[]> {
  const query = keywords.slice(0, 3).join(' OR ');
  const results: PlatformResult[] = [];

  switch (platform) {
    case 'reddit': {
      // old.reddit.com is less aggressive with datacenter IP blocking than www.reddit.com
      const resp = await axios.get('https://old.reddit.com/search.json', {
        params: { q: query, sort: 'new', limit: Math.min(maxResults, 25), t: 'day' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000,
      });
      const posts = resp.data?.data?.children || [];
      for (const post of posts) {
        const d = post.data;
        results.push({
          platform: 'reddit',
          source_url: `https://www.reddit.com${d.permalink}`,
          author: d.author || '',
          title: d.title || '',
          content_excerpt: (d.selftext || '').slice(0, 500),
          details: {
            subreddit: d.subreddit,
            score: d.score,
            num_comments: d.num_comments,
            created_utc: d.created_utc,
            name: d.name,
            id: d.id,
          },
        });
      }
      break;
    }

    case 'hackernews': {
      const resp = await axios.get('https://hn.algolia.com/api/v1/search_by_date', {
        params: { query, tags: 'story', hitsPerPage: Math.min(maxResults, 30) },
        timeout: 15000,
      });
      const hits = resp.data?.hits || [];
      for (const hit of hits) {
        results.push({
          platform: 'hackernews',
          source_url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          author: hit.author || '',
          title: hit.title || '',
          content_excerpt: (hit.story_text || '').slice(0, 500),
          details: {
            objectID: hit.objectID,
            points: hit.points,
            num_comments: hit.num_comments,
            created_at: hit.created_at,
          },
        });
      }
      break;
    }

    case 'devto': {
      const resp = await axios.get('https://dev.to/api/articles', {
        params: { tag: 'ai', per_page: Math.min(maxResults, 30), state: 'rising' },
        timeout: 15000,
      });
      const articles = resp.data || [];
      for (const art of articles) {
        results.push({
          platform: 'devto',
          source_url: art.url || '',
          author: art.user?.username || '',
          title: art.title || '',
          content_excerpt: (art.description || '').slice(0, 500),
          details: {
            id: art.id,
            positive_reactions_count: art.positive_reactions_count,
            comments_count: art.comments_count,
            published_at: art.published_at,
            tags: art.tag_list,
          },
        });
      }
      break;
    }

    case 'hashnode': {
      // Hashnode GraphQL API -feed query with tag ObjectIDs
      // Tag IDs: ai=56744721958ef13879b9488e, artificial-intelligence=56744721958ef13879b94927,
      //          machine-learning=56744722958ef13879b950a8, llm=635ad52efe8087002dee4707
      // Use only high-quality tags (artificial-intelligence, machine-learning, llm)
      // Exclude generic "ai" tag which attracts crypto/spam posts
      const tagIds = [
        '56744721958ef13879b94927',    // artificial-intelligence
        '56744722958ef13879b950a8',    // machine-learning
        '635ad52efe8087002dee4707',    // llm
      ];
      const query = `query {
        feed(first: ${Math.min(maxResults, 20)}, filter: { tags: [${tagIds.map(id => `"${id}"`).join(', ')}], type: RELEVANT }) {
          edges {
            node {
              id
              title
              brief
              url
              publishedAt
              reactionCount
              responseCount
              author { username }
              tags { name slug }
            }
          }
        }
      }`;
      try {
        const resp = await axios.post('https://gql.hashnode.com', { query }, {
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.HASHNODE_ACCESS_TOKEN ? { Authorization: process.env.HASHNODE_ACCESS_TOKEN } : {}),
          },
          timeout: 30000,
        });
        const edges = resp.data?.data?.feed?.edges || [];
        for (const edge of edges) {
          const node = edge.node;
          if (!node) continue;
          results.push({
            platform: 'hashnode',
            source_url: node.url || '',
            author: node.author?.username || '',
            title: node.title || '',
            content_excerpt: (node.brief || '').slice(0, 500),
            details: {
              id: node.id,
              positive_reactions_count: node.reactionCount || 0,
              comments_count: node.responseCount || 0,
              published_at: node.publishedAt,
              tags: (node.tags || []).map((t: any) => t.slug || t.name),
            },
          });
        }
      } catch (err: any) {
        console.warn('[OpenClaw] Hashnode scan failed:', err?.message?.slice(0, 200));
      }
      break;
    }

    case 'medium': {
      // Medium tag RSS feeds -parse XML for article discovery
      const mediumTags = ['artificial-intelligence', 'machine-learning', 'ai-leadership'];
      for (const tag of mediumTags.slice(0, 2)) {
        try {
          const resp = await axios.get(`https://medium.com/feed/tag/${tag}`, {
            headers: { 'User-Agent': 'OpenclawBot/1.0', Accept: 'application/rss+xml,application/xml' },
            timeout: 15000,
          });
          const xml: string = resp.data;
          // Simple RSS item extraction -no XML parser dependency needed
          const itemRegex = /<item>([\s\S]*?)<\/item>/g;
          let match;
          while ((match = itemRegex.exec(xml)) !== null && results.length < maxResults) {
            const item = match[1];
            const getTag = (tag: string) => {
              const m = item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
              return m ? (m[1] || m[2] || '').trim() : '';
            };
            const link = getTag('link');
            const title = getTag('title');
            const creator = getTag('dc:creator');
            const pubDate = getTag('pubDate');
            // Extract categories
            const cats: string[] = [];
            const catRegex = /<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/g;
            let catMatch;
            while ((catMatch = catRegex.exec(item)) !== null) cats.push(catMatch[1].trim());

            if (link) {
              results.push({
                platform: 'medium',
                source_url: link.split('?')[0], // strip query params
                author: creator,
                title,
                content_excerpt: '', // RSS doesn't include clean excerpts
                details: { published_at: pubDate, categories: cats },
              });
            }
          }
        } catch (err: any) {
          console.warn(`[OpenClaw] Medium tag "${tag}" scan failed:`, err?.message?.slice(0, 200));
        }
      }
      break;
    }

    case 'discourse': {
      // Scan configured Discourse forums for AI discussions
      const forums: Array<{ name: string; base_url: string }> = config.discourse_forums || [
        { name: 'Hugging Face', base_url: 'https://discuss.huggingface.co' },
        { name: 'OpenAI', base_url: 'https://community.openai.com' },
      ];
      const perForum = Math.max(5, Math.floor(maxResults / forums.length));
      for (const forum of forums) {
        try {
          const resp = await axios.get(`${forum.base_url}/search.json`, {
            params: { q: `${query} in:first order:latest` },
            headers: { 'User-Agent': 'OpenclawBot/1.0' },
            timeout: 15000,
          });
          const topics = resp.data?.topics || [];
          for (const topic of topics.slice(0, perForum)) {
            results.push({
              platform: 'discourse',
              source_url: `${forum.base_url}/t/${topic.slug}/${topic.id}`,
              author: topic.last_poster_username || '',
              title: topic.title || '',
              content_excerpt: (topic.excerpt || '').slice(0, 500),
              details: {
                forum_name: forum.name,
                forum_url: forum.base_url,
                topic_id: topic.id,
                posts_count: topic.posts_count,
                views: topic.views,
                like_count: topic.like_count,
                created_at: topic.created_at,
              },
            });
          }
        } catch (err: any) {
          console.warn(`[OpenClaw] Discourse scan failed for ${forum.name}:`, err?.message?.slice(0, 200));
        }
      }
      break;
    }

    case 'twitter': {
      // Twitter/X Search API v2 -recent tweet search
      const twitterBearer = process.env.TWITTER_BEARER_TOKEN;
      if (!twitterBearer) break;
      try {
        const resp = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
          params: {
            query: query + ' -is:retweet lang:en',
            max_results: Math.min(maxResults, 25),
            'tweet.fields': 'author_id,created_at,public_metrics,conversation_id',
            expansions: 'author_id',
            'user.fields': 'username',
          },
          headers: { Authorization: `Bearer ${twitterBearer}` },
          timeout: 15000,
        });
        const tweets = resp.data?.data || [];
        const users: Record<string, string> = {};
        for (const u of resp.data?.includes?.users || []) {
          users[u.id] = u.username;
        }
        for (const tweet of tweets) {
          const metrics = tweet.public_metrics || {};
          results.push({
            platform: 'twitter',
            source_url: `https://twitter.com/i/status/${tweet.id}`,
            author: users[tweet.author_id] || '',
            title: '',
            content_excerpt: (tweet.text || '').slice(0, 500),
            details: {
              tweet_id: tweet.id,
              conversation_id: tweet.conversation_id,
              retweet_count: metrics.retweet_count || 0,
              reply_count: metrics.reply_count || 0,
              like_count: metrics.like_count || 0,
              quote_count: metrics.quote_count || 0,
              created_at: tweet.created_at,
            },
          });
        }
      } catch (err: any) {
        console.warn('[OpenClaw] Twitter scan failed:', err?.message?.slice(0, 200));
      }
      break;
    }

    case 'bluesky': {
      // Bluesky AT Protocol -public search (no auth needed)
      try {
        const resp = await axios.get('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts', {
          params: { q: query, limit: Math.min(maxResults, 25), sort: 'latest' },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json',
          },
          timeout: 15000,
        });
        const posts = resp.data?.posts || [];
        for (const post of posts) {
          // Convert AT URI at://did/app.bsky.feed.post/rkey → web URL
          const handle = post.author?.handle || '';
          const rkey = post.uri?.split('/').pop() || '';
          results.push({
            platform: 'bluesky',
            source_url: handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : post.uri || '',
            author: handle,
            title: '',
            content_excerpt: (post.record?.text || '').slice(0, 500),
            details: {
              uri: post.uri,
              cid: post.cid,
              reply_count: post.replyCount || 0,
              repost_count: post.repostCount || 0,
              like_count: post.likeCount || 0,
              created_at: post.record?.createdAt,
            },
          });
        }
      } catch (err: any) {
        console.warn('[OpenClaw] Bluesky scan failed:', err?.message?.slice(0, 200));
      }
      break;
    }

    case 'youtube': {
      // YouTube Data API v3 -search for AI-related videos
      const ytApiKey = process.env.YOUTUBE_API_KEY;
      if (!ytApiKey) break;
      try {
        const publishedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const resp = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: {
            part: 'snippet',
            q: query,
            type: 'video',
            order: 'date',
            maxResults: Math.min(maxResults, 15),
            publishedAfter,
            key: ytApiKey,
          },
          timeout: 15000,
        });
        const items = resp.data?.items || [];
        // Batch fetch video stats to save quota (1 call for all IDs = 1 unit vs N calls)
        const videoIds = items.map((i: any) => i.id?.videoId).filter(Boolean).join(',');
        let statsMap: Record<string, any> = {};
        if (videoIds) {
          try {
            const statsResp = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
              params: { part: 'statistics', id: videoIds, key: ytApiKey },
              timeout: 15000,
            });
            for (const v of statsResp.data?.items || []) {
              statsMap[v.id] = v.statistics || {};
            }
          } catch { /* stats are optional -continue without them */ }
        }
        for (const item of items) {
          const videoId = item.id?.videoId;
          if (!videoId) continue;
          const stats = statsMap[videoId] || {};
          results.push({
            platform: 'youtube',
            source_url: `https://www.youtube.com/watch?v=${videoId}`,
            author: item.snippet?.channelTitle || '',
            title: item.snippet?.title || '',
            content_excerpt: (item.snippet?.description || '').slice(0, 500),
            details: {
              video_id: videoId,
              channel_id: item.snippet?.channelId,
              published_at: item.snippet?.publishedAt,
              view_count: parseInt(stats.viewCount || '0', 10),
              comment_count: parseInt(stats.commentCount || '0', 10),
            },
          });
        }
      } catch (err: any) {
        console.warn('[OpenClaw] YouTube scan failed:', err?.message?.slice(0, 200));
      }
      break;
    }

    case 'producthunt': {
      // Product Hunt GraphQL API -recent AI product launches
      const phToken = process.env.PRODUCTHUNT_ACCESS_TOKEN;
      if (!phToken) break;
      try {
        const graphqlQuery = `query {
          posts(first: ${Math.min(maxResults, 20)}, order: NEWEST, topic: "artificial-intelligence") {
            edges {
              node {
                id name tagline description url
                votesCount commentsCount
                createdAt
                makers { username }
                topics { edges { node { name } } }
              }
            }
          }
        }`;
        const resp = await axios.post('https://api.producthunt.com/v2/api/graphql',
          { query: graphqlQuery },
          {
            headers: {
              Authorization: `Bearer ${phToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        );
        const edges = resp.data?.data?.posts?.edges || [];
        for (const edge of edges) {
          const node = edge.node;
          if (!node) continue;
          const topics = (node.topics?.edges || []).map((e: any) => e.node?.name).filter(Boolean);
          results.push({
            platform: 'producthunt',
            source_url: node.url || '',
            author: node.makers?.[0]?.username || '',
            title: node.name || '',
            content_excerpt: ((node.tagline || '') + ' ' + (node.description || '')).trim().slice(0, 500),
            details: {
              ph_id: node.id,
              votes_count: node.votesCount || 0,
              comments_count: node.commentsCount || 0,
              created_at: node.createdAt,
              topics,
            },
          });
        }
      } catch (err: any) {
        console.warn('[OpenClaw] Product Hunt scan failed:', err?.message?.slice(0, 200));
      }
      break;
    }

    case 'quora':
      // Quora has no public API -signals are submitted manually via admin UI
      break;

    case 'facebook_groups':
      // Facebook Groups has no public API -signals are submitted manually via admin UI
      break;

    case 'linkedin_comments':
      // LinkedIn comment opportunities have no public search API -signals are submitted manually via admin UI
      break;

    default:
      // Unsupported platform -skip silently
      break;
  }

  return results.slice(0, maxResults);
}
