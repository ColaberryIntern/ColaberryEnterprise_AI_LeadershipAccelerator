import axios from 'axios';
import { OpenclawSignal } from '../../../models';
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
  const keywords: string[] = config.keywords || ['AI training', 'enterprise AI', 'AI leadership'];
  const platforms: string[] = config.platforms || ['reddit', 'hackernews', 'devto'];
  const maxSignals = config.max_signals_per_scan || 50;
  let totalCreated = 0;

  for (const platform of platforms) {
    try {
      const results = await scanPlatform(platform, keywords, maxSignals);

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
): Promise<PlatformResult[]> {
  const query = keywords.slice(0, 3).join(' OR ');
  const results: PlatformResult[] = [];

  switch (platform) {
    case 'reddit': {
      const resp = await axios.get('https://www.reddit.com/search.json', {
        params: { q: query, sort: 'new', limit: Math.min(maxResults, 25), t: 'day' },
        headers: { 'User-Agent': 'OpenclawBot/1.0' },
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

    case 'quora':
      // Quora has no public API — signals are submitted manually via admin UI
      break;

    default:
      // Unsupported platform — skip silently
      break;
  }

  return results.slice(0, maxResults);
}
