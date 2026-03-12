import axios from 'axios';
import { OpenclawLearning } from '../../../models';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * OpenClaw Tech Research Agent
 * Daily scan of Playwright releases, anti-bot detection changes,
 * and platform API updates. Logs findings as tech_update learnings.
 */
export async function runOpenclawTechResearchAgent(
  _agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // 1. Check Playwright releases
    const pwResult = await checkPlaywrightReleases();
    if (pwResult) {
      await OpenclawLearning.create({
        learning_type: 'tech_update' as any,
        metric_key: 'playwright_release',
        metric_value: 1,
        sample_size: 1,
        confidence: 0.95,
        insight: pwResult.insight,
        details: pwResult.details,
        created_at: new Date(),
      });

      actions.push({
        campaign_id: '',
        action: 'playwright_update',
        reason: pwResult.insight,
        confidence: 0.95,
        before_state: null,
        after_state: pwResult.details,
        result: 'success',
        entity_type: 'system',
      });
    }

    // 2. Check for platform API changes (lightweight)
    const platformChecks = await checkPlatformAPIs();
    for (const check of platformChecks) {
      await OpenclawLearning.create({
        learning_type: 'tech_update' as any,
        platform: check.platform,
        metric_key: `api_status_${check.platform}`,
        metric_value: check.healthy ? 1 : 0,
        sample_size: 1,
        confidence: 0.9,
        insight: check.insight,
        details: check.details,
        created_at: new Date(),
      });

      if (!check.healthy) {
        actions.push({
          campaign_id: '',
          action: 'platform_api_issue',
          reason: check.insight,
          confidence: 0.9,
          before_state: null,
          after_state: check.details,
          result: 'flagged',
          entity_type: 'system',
        });
      }
    }

    actions.push({
      campaign_id: '',
      action: 'tech_research_complete',
      reason: `Checked Playwright releases and ${platformChecks.length} platform APIs`,
      confidence: 1,
      before_state: null,
      after_state: {
        playwright_update: !!pwResult,
        platforms_checked: platformChecks.length,
        issues: platformChecks.filter((c) => !c.healthy).length,
      },
      result: 'success',
      entity_type: 'system',
    });
  } catch (err: any) {
    errors.push(err.message || 'Tech research error');
  }

  return {
    agent_name: 'OpenclawTechResearchAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.length,
  };
}

async function checkPlaywrightReleases(): Promise<{
  insight: string;
  details: Record<string, any>;
} | null> {
  try {
    const resp = await axios.get(
      'https://api.github.com/repos/microsoft/playwright/releases/latest',
      { timeout: 10000, headers: { 'User-Agent': 'OpenclawBot/1.0' } },
    );

    const release = resp.data;
    const publishedAt = new Date(release.published_at);
    const daysSinceRelease = (Date.now() - publishedAt.getTime()) / 86400000;

    // Only report if release is within last 7 days
    if (daysSinceRelease <= 7) {
      return {
        insight: `New Playwright release: ${release.tag_name} (${daysSinceRelease.toFixed(0)} days ago). Review changelog for anti-detection changes.`,
        details: {
          version: release.tag_name,
          published_at: release.published_at,
          url: release.html_url,
          days_since: Math.round(daysSinceRelease),
        },
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function checkPlatformAPIs(): Promise<
  Array<{ platform: string; healthy: boolean; insight: string; details: Record<string, any> }>
> {
  const results: Array<{
    platform: string;
    healthy: boolean;
    insight: string;
    details: Record<string, any>;
  }> = [];

  const checks = [
    { platform: 'reddit', url: 'https://www.reddit.com/r/artificial.json?limit=1' },
    { platform: 'hackernews', url: 'https://hn.algolia.com/api/v1/search?query=test&hitsPerPage=1' },
    { platform: 'devto', url: 'https://dev.to/api/articles?per_page=1' },
  ];

  for (const check of checks) {
    try {
      const resp = await axios.get(check.url, {
        timeout: 10000,
        headers: { 'User-Agent': 'OpenclawBot/1.0' },
      });

      results.push({
        platform: check.platform,
        healthy: resp.status === 200,
        insight: `${check.platform} API responding normally (${resp.status})`,
        details: { status: resp.status, response_time_ms: Date.now() },
      });
    } catch (err: any) {
      results.push({
        platform: check.platform,
        healthy: false,
        insight: `${check.platform} API issue: ${err.message}`,
        details: { error: err.message, status: err.response?.status },
      });
    }
  }

  return results;
}
