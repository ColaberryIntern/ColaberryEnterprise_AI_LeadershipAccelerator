import { Op } from 'sequelize';
import OpenclawSignal from '../../../models/OpenclawSignal';
import OpenclawResponse from '../../../models/OpenclawResponse';
import { scrapeLinkedInPost } from './openclawLinkedInScraper';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * LinkedInCommentMonitorAgent - periodically scans tracked LinkedIn posts for new comments.
 * For each new commenter, generates a reply via GPT-4o and queues it for manual posting.
 *
 * Schedule: 0 8,12,16 * * 1-5 (8am, 12pm, 4pm UTC, weekdays)
 */
export async function runLinkedInCommentMonitorAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const maxPostsPerRun = config.max_posts_per_run || 10;

  try {
    // 1. Find all actively tracked LinkedIn posts
    const trackedPosts = await OpenclawSignal.findAll({
      where: {
        platform: 'linkedin_post_tracking' as any,
        status: 'active' as any,
      },
      order: [['created_at', 'DESC']],
      limit: maxPostsPerRun,
    });

    if (trackedPosts.length === 0) {
      actions.push({
        campaign_id: null,
        action: 'skip_linkedin_comment_monitor',
        reason: 'No tracked posts',
        confidence: 1.0,
        before_state: null,
        after_state: null,
        result: 'skipped',
      });
      return { agent_name: 'OpenclawLinkedInCommentMonitorAgent', campaigns_processed: 0, actions_taken: actions, errors, duration_ms: Date.now() - start, entities_processed: 0 };
    }

    let totalNewReplies = 0;

    for (const tracker of trackedPosts) {
      const postUrl = tracker.source_url;
      const knownCommenters: string[] = (tracker as any).details?.known_commenters || [];

      try {
        // 2. Scrape post for comments (uses authenticated persistent profile)
        const scraped = await scrapeLinkedInPost(postUrl);

        if (!scraped.comments || scraped.comments.length === 0) {
          actions.push({
            campaign_id: null,
            action: 'scan_linkedin_post',
            reason: 'No comments found (may need re-auth)',
            confidence: 0.5,
            before_state: null,
            after_state: { post_url: postUrl },
            result: 'skipped',
          });
          continue;
        }

        // 3. Find new commenters
        const knownSet = new Set(knownCommenters);
        const newComments = scraped.comments.filter(c => !knownSet.has(c.commenter_name));

        if (newComments.length === 0) {
          // Update last_scanned_at even if no new comments
          await tracker.update({
            details: { ...(tracker as any).details, last_scanned_at: new Date().toISOString() },
            updated_at: new Date(),
          });
          actions.push({
            campaign_id: null,
            action: 'scan_linkedin_post',
            reason: `All ${scraped.comments.length} commenters already known`,
            confidence: 1.0,
            before_state: null,
            after_state: { post_url: postUrl, total_commenters: scraped.comments.length },
            result: 'skipped',
          });
          continue;
        }

        // 4. Generate replies for new comments
        const { getOpenAIClient } = await import('../../../intelligence/assistant/openaiHelper');
        const client = getOpenAIClient();

        const systemPrompt = `You are Ali Moiz, founder of an enterprise AI leadership accelerator. You built a system with 18 departments and 172 AI agents managed by an AI COO. You respond to comments on your LinkedIn posts as a practitioner who builds real AI systems daily.

Rules:
1. Address each commenter by first name
2. Reply directly to their specific point - don't be generic
3. If they asked a question, answer it with real details from your system
4. If they affirmed your point, acknowledge their insight and build on it
5. Be conversational and professional - like talking to a peer
6. Never use em dashes - use hyphens or rewrite
7. Never mention "Colaberry" - say "our system" or "the accelerator"
8. Keep replies concise: 2-4 sentences for affirmations, 4-8 for questions
9. Sound like a real founder, not a chatbot - be opinionated and specific
10. Do NOT include any URLs or links in the reply

Return a JSON array of objects with: { "commenter_name": string, "reply": string }
One entry per comment. Return ONLY the JSON array, no markdown fencing.`;

        const commentList = newComments.map((c, i) =>
          `${i + 1}. ${c.commenter_name}${c.commenter_title ? ` (${c.commenter_title})` : ''}: "${c.comment_text}"`
        ).join('\n');

        let replies: Array<{ commenter_name: string; reply: string }> = [];

        if (client) {
          try {
            const result = await client.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                {
                  role: 'user',
                  content: `My LinkedIn post:\n${scraped.post_content.slice(0, 3000)}\n\nNew comments:\n${commentList}\n\nGenerate a reply for each comment.`,
                },
              ],
              max_tokens: 2000,
              temperature: 0.7,
            });
            const raw = result.choices[0]?.message?.content || '[]';
            replies = JSON.parse(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
          } catch (err: any) {
            errors.push(`LLM failed for ${postUrl}: ${err?.message?.slice(0, 100)}`);
          }
        }

        if (replies.length === 0) {
          replies = newComments.map(c => ({
            commenter_name: c.commenter_name,
            reply: `Great point ${c.commenter_name.split(' ')[0]}. This is exactly the kind of insight that matters when building autonomous systems. Happy to go deeper on this.`,
          }));
        }

        // 5. Create signal + response for each reply
        const crypto = await import('crypto');
        for (const r of replies) {
          const shortId = `oc-linkedin_comments-${crypto.randomBytes(4).toString('hex')}`;
          let content = r.reply
            .replace(/\b[Cc]olaberry\b(?![./])/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\u2014/g, ' - ')
            .replace(/\u2013/g, ' - ');

          const signal = await OpenclawSignal.create({
            platform: 'linkedin_comments',
            source_url: postUrl,
            title: `Reply to ${r.commenter_name} on LinkedIn`,
            content_excerpt: (newComments.find(c => c.commenter_name === r.commenter_name)?.comment_text || '').slice(0, 500),
            details: {
              source: 'linkedin_comment_monitor_agent',
              commenter_name: r.commenter_name,
              post_content: scraped.post_content.slice(0, 2000),
              post_author: scraped.post_author,
              comment_text: newComments.find(c => c.commenter_name === r.commenter_name)?.comment_text || '',
            },
            relevance_score: 0.95,
            engagement_score: 0.9,
            risk_score: 0.0,
            status: 'queued',
            topic_tags: [],
            created_at: new Date(),
          });

          const response = await OpenclawResponse.create({
            signal_id: signal.id,
            platform: 'linkedin_comments',
            content,
            tone: 'professional',
            short_id: shortId,
            execution_type: 'human_execution',
            post_status: 'ready_for_manual_post',
            created_at: new Date(),
          });

          await signal.update({ response_id: response.id, status: 'responded', updated_at: new Date() });
          totalNewReplies++;
        }

        // 6. Update tracker with new known commenters
        const allCommenters = scraped.comments.map(c => c.commenter_name);
        const merged = [...new Set([...knownCommenters, ...allCommenters])];
        await tracker.update({
          details: {
            ...(tracker as any).details,
            last_scanned_at: new Date().toISOString(),
            known_commenters: merged,
          },
          updated_at: new Date(),
        });

        actions.push({
          campaign_id: null,
          action: 'generate_linkedin_replies',
          reason: `Found ${newComments.length} new commenters, generated ${replies.length} replies`,
          confidence: 0.9,
          before_state: { known_commenters: knownCommenters.length },
          after_state: { known_commenters: merged.length, new_replies: replies.length },
          result: 'success',
          details: { post_url: postUrl },
        });

      } catch (err: any) {
        errors.push(`Failed to scan ${postUrl}: ${err?.message?.slice(0, 200)}`);
        actions.push({
          campaign_id: null,
          action: 'scan_linkedin_post',
          reason: err.message,
          confidence: 0,
          before_state: null,
          after_state: null,
          result: 'failed',
          details: { post_url: postUrl },
        });
      }
    }

    return {
      agent_name: 'OpenclawLinkedInCommentMonitorAgent',
      campaigns_processed: 0,
      actions_taken: actions,
      errors,
      duration_ms: Date.now() - start,
      entities_processed: trackedPosts.length,
    };

  } catch (err: any) {
    errors.push(err.message);
    return { agent_name: 'OpenclawLinkedInCommentMonitorAgent', campaigns_processed: 0, actions_taken: actions, errors, duration_ms: Date.now() - start };
  }
}
