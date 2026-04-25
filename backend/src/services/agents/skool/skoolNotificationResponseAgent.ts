// @ts-nocheck
/**
 * Skool Notification Response Agent
 *
 * Scans Skool notifications and DM inbox for messages that contain questions.
 * Only replies if a genuine question is detected — avoids AI-to-AI loops.
 * Runs every 30 minutes.
 */
import { Op } from 'sequelize';

const LOG_PREFIX = '[Skool][NotifResponse]';

// Question detection patterns
const QUESTION_INDICATORS = [
  '?',
  'how do',
  'how can',
  'how does',
  'how would',
  'what is',
  'what are',
  'what do',
  'what does',
  'what would',
  'can you',
  'could you',
  'would you',
  'do you',
  'are you',
  'have you',
  'is there',
  'is it',
  'any advice',
  'any suggestions',
  'any tips',
  'what tools',
  'which tool',
  'where do',
  'where can',
  'when should',
  'why do',
  'why does',
  'thoughts on',
  'opinion on',
  'recommend',
  'suggestion',
];

// Skip patterns — don't reply to these even if they contain a question mark
const SKIP_PATTERNS = [
  'thanks',
  'thank you',
  'tysm',
  'appreciate',
  'great post',
  'nice post',
  'love this',
  'amazing',
  'awesome',
  'well said',
  'exactly',
  'agreed',
  'this is fire',
  'fam',
  'goat',
  'legend',
  'lol',
  'haha',
  'wow',
];

function containsQuestion(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Skip if it's just a thank you or reaction
  for (const skip of SKIP_PATTERNS) {
    if (lower.startsWith(skip) || (lower.length < 30 && lower.includes(skip))) {
      return false;
    }
  }

  // Check for question indicators
  for (const indicator of QUESTION_INDICATORS) {
    if (lower.includes(indicator)) return true;
  }

  return false;
}

function getOpenAIClient(): any {
  try {
    const OpenAI = require('openai');
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch {
    return null;
  }
}

interface NotificationItem {
  type: 'mention' | 'dm';
  author: string;
  authorProfileUrl: string;
  message: string;
  postUrl?: string;
  postTitle?: string;
}

interface ReplyAction {
  type: 'comment_reply' | 'dm_reply';
  targetUrl: string; // post URL for comments, profile URL for DMs
  author: string;
  originalMessage: string;
  reply: string;
}

export async function runSkoolNotificationResponse(): Promise<{
  scanned: number;
  questionsFound: number;
  replied: number;
}> {
  const result = { scanned: 0, questionsFound: 0, replied: 0 };

  if (process.env.SKOOL_ENABLED !== 'true') {
    return result;
  }

  let chromium: any;
  try {
    chromium = require('playwright').chromium;
  } catch {
    console.error(`${LOG_PREFIX} Playwright not available`);
    return result;
  }

  const client = getOpenAIClient();
  if (!client) {
    console.error(`${LOG_PREFIX} OpenAI client not available`);
    return result;
  }

  let browser: any;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    // Login
    await page.goto('https://www.skool.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.fill('input[type=email]', process.env.SKOOL_EMAIL || '');
    await page.fill('input[type=password]', process.env.SKOOL_PASSWORD || '');
    await page.click('button[type=submit]');
    await page.waitForTimeout(5000);

    if (page.url().includes('/login')) {
      console.error(`${LOG_PREFIX} Login failed`);
      await browser.close();
      return result;
    }
    console.log(`${LOG_PREFIX} Logged in`);

    // ─── STEP 1: Check notifications for @mentions with questions ───

    console.log(`${LOG_PREFIX} Checking notifications...`);
    await page.goto('https://www.skool.com/learn-ai', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Click notification bell
    await page.mouse.click(1079, 24);
    await page.waitForTimeout(2000);

    const notifications = await page.evaluate(() => {
      const items: Array<{
        author: string;
        message: string;
        type: string;
        postUrl: string;
        authorUrl: string;
      }> = [];

      const panel = document.querySelector('[class*="Dropdown"]');
      if (!panel) return items;

      const text = panel.innerText;
      const lines = text.split('\n').filter((l: string) => l.trim());

      // Parse notification lines
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('mentioned you in reply') || line.includes('replied to your')) {
          // Next line should be the message preview
          const msgLine = lines[i + 1]?.trim() || '';
          if (msgLine.startsWith('@')) {
            // Extract the actual message after the @mention
            const msgContent = msgLine.replace(/@\S+\s*/, '').trim();
            // Find author from the line before
            const author = line.split(' mentioned')[0].split(' replied')[0].trim();
            items.push({
              author,
              message: msgContent,
              type: 'mention',
              postUrl: '',
              authorUrl: '',
            });
          }
        }
      }

      return items;
    });

    // Close notification panel
    await page.mouse.click(500, 400);
    await page.waitForTimeout(500);

    result.scanned += notifications.length;
    console.log(`${LOG_PREFIX} Found ${notifications.length} notification(s)`);

    // Filter for questions
    const mentionQuestions = notifications.filter(n => containsQuestion(n.message));
    result.questionsFound += mentionQuestions.length;
    console.log(`${LOG_PREFIX} ${mentionQuestions.length} contain questions`);

    // ─── STEP 2: Check DM inbox for unread messages with questions ───

    console.log(`${LOG_PREFIX} Checking DM inbox...`);
    await page.mouse.click(1023, 24);
    await page.waitForTimeout(2000);

    const dmItems = await page.evaluate(() => {
      const items: Array<{
        author: string;
        message: string;
        authorUrl: string;
        unread: boolean;
      }> = [];

      const panels = document.querySelectorAll('[class*="Dropdown"]');
      let chatPanel: Element | null = null;
      panels.forEach(p => {
        if (p.getBoundingClientRect().width > 200 && p.innerText.includes('Chats')) {
          chatPanel = p;
        }
      });

      if (!chatPanel) return items;

      const text = (chatPanel as HTMLElement).innerText;
      const lines = text.split('\n').filter((l: string) => l.trim());

      // Parse DM entries: name, time, message preview
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Check for unread indicator (number in parentheses)
        if (line.match(/^\(\d+\)$/)) {
          // Previous lines should be author + time, next line is message
          const author = lines[i - 2]?.trim() || '';
          const message = lines[i + 1]?.trim() || lines[i - 1]?.trim() || '';
          if (author && message && author !== 'Chats' && author !== 'All') {
            items.push({ author, message, authorUrl: '', unread: true });
          }
        }
      }

      // Also check for conversations without unread indicator but with recent timestamps
      // The chat panel shows conversations in order, most recent first
      const links = chatPanel.querySelectorAll('a[href*="/@"]');
      links.forEach(a => {
        const name = (a as HTMLElement).textContent?.trim() || '';
        if (name && name.length > 2 && name.length < 40) {
          // Check if this conversation has an unread badge
          const parent = (a as HTMLElement).closest('[class*="ChatItem"], [class*="chat-item"]') || a.parentElement?.parentElement;
          if (parent) {
            const badge = parent.querySelector('[class*="badge"], [class*="Badge"], [class*="unread"]');
            if (badge) {
              items.push({
                author: name,
                message: '',
                authorUrl: (a as HTMLAnchorElement).href,
                unread: true,
              });
            }
          }
        }
      });

      return items;
    });

    // Close chat panel
    await page.mouse.click(500, 400);
    await page.waitForTimeout(500);

    result.scanned += dmItems.length;
    console.log(`${LOG_PREFIX} Found ${dmItems.length} DM conversation(s) to check`);

    // For unread DMs, open each conversation to get the full message
    const dmQuestions: Array<{ author: string; message: string; profileUrl: string }> = [];

    for (const dm of dmItems.filter(d => d.unread)) {
      try {
        // Search for the member to get profile
        await page.goto('https://www.skool.com/learn-ai/-/members', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        const searchInput = page.locator('input[placeholder="Search members"]').first();
        if (await searchInput.isVisible().catch(() => false)) {
          await searchInput.fill(dm.author);
          await page.waitForTimeout(2000);

          const profileLink = await page.evaluate((name: string) => {
            const links = document.querySelectorAll('a[href*="/@"]');
            for (const a of links) {
              if (a.textContent?.trim() === name) return (a as HTMLAnchorElement).href;
            }
            return null;
          }, dm.author);

          if (profileLink) {
            await page.goto(profileLink, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(2000);

            const chatBtn = page.locator('button:has-text("Chat")').first();
            if (await chatBtn.isVisible().catch(() => false)) {
              await chatBtn.click();
              await page.waitForTimeout(3000);

              // Get the last message from the other person
              const lastMsg = await page.evaluate(() => {
                const textarea = document.querySelector('textarea[placeholder*="Message"]');
                if (!textarea) return '';
                const chatArea = textarea.closest('[class*="Chat"]') || textarea.parentElement?.parentElement?.parentElement;
                if (!chatArea) return '';
                const text = (chatArea as HTMLElement).innerText;
                // Get the last message that isn't from "Ali Muwwakkil"
                const lines = text.split('\n').filter((l: string) => l.trim());
                let lastOtherMsg = '';
                let isOtherPerson = false;
                for (const line of lines) {
                  if (line.includes('Ali Muwwakkil')) { isOtherPerson = false; continue; }
                  if (line.match(/^\d+:\d+\s*(am|pm)$/i)) continue; // Skip timestamps
                  if (line.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)) { isOtherPerson = true; continue; }
                  if (isOtherPerson && line.trim().length > 5) {
                    lastOtherMsg = line.trim();
                  }
                }
                return lastOtherMsg;
              });

              if (lastMsg && containsQuestion(lastMsg)) {
                dmQuestions.push({ author: dm.author, message: lastMsg, profileUrl: profileLink });
                console.log(`${LOG_PREFIX} DM question from ${dm.author}: "${lastMsg.slice(0, 80)}"`);
              }
            }
          }
        }
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Error checking DM from ${dm.author}:`, err.message?.slice(0, 80));
      }
    }

    result.questionsFound += dmQuestions.length;

    // ─── STEP 3: Generate and send replies ───

    const allQuestions = [
      ...mentionQuestions.map(q => ({ ...q, replyType: 'comment' as const })),
      ...dmQuestions.map(q => ({ ...q, replyType: 'dm' as const })),
    ];

    if (allQuestions.length === 0) {
      console.log(`${LOG_PREFIX} No questions to reply to`);
      await browser.close();
      return result;
    }

    // Limit to 5 replies per run
    const toReply = allQuestions.slice(0, 5);
    console.log(`${LOG_PREFIX} Generating ${toReply.length} replies...`);

    const { getSystemPrompt } = require('./skoolPlatformStrategy');

    for (const q of toReply) {
      try {
        // Generate reply
        const systemPrompt = getSystemPrompt('dev-help'); // Use dev-help tone for replies
        const response = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Someone ${q.replyType === 'dm' ? 'sent you a DM' : 'replied to your post'} on Skool. Their message:\n\n"${q.message}"\n\nAuthor: ${q.author}\n\nWrite a brief, helpful reply (under 150 words). Be conversational and genuine. Answer their question directly. If they are a potential client or partner, gently position yourself but keep it natural. Remember: NO URLs.`,
            },
          ],
          max_tokens: 300,
          temperature: 0.7,
        });

        const reply = response.choices?.[0]?.message?.content?.trim();
        if (!reply) continue;

        // Check for URLs (safety)
        if (/https?:\/\//.test(reply)) {
          console.log(`${LOG_PREFIX} Reply contains URL, skipping: ${q.author}`);
          continue;
        }

        console.log(`${LOG_PREFIX} Reply to ${q.author}: "${reply.slice(0, 100)}..."`);

        if (q.replyType === 'dm' && (q as any).profileUrl) {
          // Send DM reply
          await page.goto((q as any).profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(2000);
          const chatBtn = page.locator('button:has-text("Chat")').first();
          if (await chatBtn.isVisible().catch(() => false)) {
            await chatBtn.click();
            await page.waitForTimeout(3000);
            const msgInput = page.locator('textarea[placeholder*="Message"]').first();
            if (await msgInput.isVisible().catch(() => false)) {
              await msgInput.click();
              await msgInput.fill(reply);
              await page.waitForTimeout(500);
              await page.keyboard.press('Enter');
              await page.waitForTimeout(2000);
              result.replied++;
              console.log(`${LOG_PREFIX} DM reply sent to ${q.author}`);
            }
          }
        }
        // Comment replies would need post URL navigation — skip for now
        // The main post reply agent handles public comment engagement

        // Delay between replies
        await page.waitForTimeout(10000 + Math.floor(Math.random() * 10000));
      } catch (err: any) {
        console.error(`${LOG_PREFIX} Error replying to ${q.author}:`, err.message?.slice(0, 80));
      }
    }

    await browser.close();
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Fatal error:`, err.message?.slice(0, 100));
    if (browser) await browser.close().catch(() => {});
  }

  console.log(`${LOG_PREFIX} Complete: scanned=${result.scanned} questions=${result.questionsFound} replied=${result.replied}`);
  return result;
}
