import { Op } from 'sequelize';
import { sequelize } from '../../../config/database';

// Models loaded via require with try/catch since they may not be compiled yet
let SkoolResponse: any;
let SkoolTask: any;
let SkoolSignal: any;

try {
  SkoolResponse = require('../../../models').SkoolResponse;
  SkoolTask = require('../../../models').SkoolTask;
  SkoolSignal = require('../../../models').SkoolSignal;
} catch (err: any) {
  console.warn('[Skool][BrowserWorker] Failed to load models:', err.message);
}

const SKOOL_DAILY_LIMIT = parseInt(process.env.SKOOL_DAILY_LIMIT || '10', 10);
const SKOOL_EMAIL = process.env.SKOOL_EMAIL || '';
const SKOOL_PASSWORD = process.env.SKOOL_PASSWORD || '';
const SKOOL_COMMUNITY_URL = process.env.SKOOL_COMMUNITY_URL || 'https://www.skool.com/learn-ai';

/**
 * Generate a random delay between min and max milliseconds.
 */
function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Skool Browser Worker Agent
 *
 * Posts approved content to Skool via Playwright browser automation.
 * Enforces daily post limits, uses anti-detection delays, and handles
 * both reply and new_post response types.
 */
export async function runSkoolBrowserWorker(): Promise<{
  posted: number;
  failed: number;
}> {
  let posted = 0;
  let failed = 0;

  if (!SkoolResponse || !SkoolTask || !SkoolSignal) {
    console.error('[Skool][BrowserWorker] Models not available, skipping run');
    return { posted, failed };
  }

  if (!SKOOL_EMAIL || !SKOOL_PASSWORD) {
    console.error('[Skool][BrowserWorker] SKOOL_EMAIL or SKOOL_PASSWORD not configured');
    return { posted, failed };
  }

  // Check daily post count using America/Chicago day boundary so the cap
  // doesn't reset at server-local UTC midnight (which clipped CT evening posts
  // into the "next day" bucket).
  const [{ count: todayCountRaw }] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM skool_responses
     WHERE posted_at IS NOT NULL
       AND posted_at AT TIME ZONE 'America/Chicago' >= DATE_TRUNC('day', NOW() AT TIME ZONE 'America/Chicago')`,
    { type: 'SELECT' as any }
  ) as any;
  const todayCount = Number(todayCountRaw) || 0;

  if (todayCount >= SKOOL_DAILY_LIMIT) {
    console.log(`[Skool][BrowserWorker] Daily limit reached (${todayCount}/${SKOOL_DAILY_LIMIT}), skipping run`);
    return { posted, failed };
  }

  const remainingSlots = SKOOL_DAILY_LIMIT - todayCount;

  // Pull approved responses, limit 3 per run (and respect remaining daily slots)
  const maxThisRun = Math.min(3, remainingSlots);
  const approvedResponses = await SkoolResponse.findAll({
    where: {
      post_status: 'approved',
    },
    order: [['created_at', 'ASC']],
    limit: maxThisRun,
  });

  if (approvedResponses.length === 0) {
    console.log('[Skool][BrowserWorker] No approved responses to post');
    return { posted, failed };
  }

  console.log(`[Skool][BrowserWorker] Posting ${approvedResponses.length} response(s) (${todayCount}/${SKOOL_DAILY_LIMIT} today)`);

  // Dynamically import Playwright (may not be installed in all environments)
  let chromium: any;
  try {
    const pw = require('playwright');
    chromium = pw.chromium;
  } catch (err: any) {
    console.error('[Skool][BrowserWorker] Playwright not available:', err.message);
    // Mark all as failed
    for (const response of approvedResponses) {
      await response.update({
        post_status: 'failed',
        metadata: {
          ...(response.metadata || {}),
          error: 'Playwright not installed',
          failed_at: new Date().toISOString(),
        },
      });
    }
    return { posted, failed: approvedResponses.length };
  }

  let browser: any = null;
  let page: any = null;

  try {
    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    // Login to Skool
    console.log('[Skool][BrowserWorker] Logging in to Skool...');
    await page.goto('https://www.skool.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.fill('input[type=email], input[name=email]', SKOOL_EMAIL);
    await page.fill('input[type=password], input[name=password]', SKOOL_PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForTimeout(5000);

    // Verify login
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      throw new Error('Login failed - still on login page');
    }
    console.log('[Skool][BrowserWorker] Login successful');

    // Process each approved response
    for (const response of approvedResponses) {
      try {
        // Anti-detection random delay (10-30 seconds)
        const delay = randomDelay(10000, 30000);
        console.log(`[Skool][BrowserWorker] Waiting ${Math.round(delay / 1000)}s before posting...`);
        await page.waitForTimeout(delay);

        if (response.response_type === 'reply') {
          await postReply(page, response);
        } else {
          await postNewPost(page, response);
        }

        // Update response as posted
        await response.update({
          post_status: 'posted',
          posted_at: new Date(),
        });

        // Update associated task(s) to completed
        await SkoolTask.update(
          { status: 'completed', completed_at: new Date() },
          {
            where: {
              response_id: response.id,
              status: { [Op.in]: ['pending', 'assigned', 'running'] },
            },
          },
        );

        posted++;
        console.log(`[Skool][BrowserWorker] Response ${response.id} POSTED successfully`);
      } catch (err: any) {
        console.error(`[Skool][BrowserWorker] Failed to post response ${response.id}:`, err.message);

        await response.update({
          post_status: 'failed',
          metadata: {
            ...(response.metadata || {}),
            error: err.message?.slice(0, 500),
            failed_at: new Date().toISOString(),
          },
        });

        // Increment task attempts
        await SkoolTask.update(
          {
            status: 'failed',
            attempts: sequelize.literal('"attempts" + 1') as any,
            error_message: err.message?.slice(0, 500),
          },
          {
            where: {
              response_id: response.id,
              status: { [Op.in]: ['pending', 'assigned', 'running'] },
            },
          },
        );
        // Increment attempts separately since Op.col in update doesn't always work
        try {
          const relatedTasks = await SkoolTask.findAll({
            where: {
              response_id: response.id,
              status: 'failed',
            },
          });
          for (const t of relatedTasks) {
            await t.update({ attempts: (t.attempts || 0) + 1 });
          }
        } catch (_) {
          // Best effort
        }

        failed++;
      }
    }
  } catch (err: any) {
    console.error('[Skool][BrowserWorker] Browser session error:', err.message);
    // Mark remaining unprocessed responses as failed
    for (const response of approvedResponses) {
      if (response.post_status === 'approved') {
        await response.update({
          post_status: 'failed',
          metadata: {
            ...(response.metadata || {}),
            error: `Session error: ${err.message?.slice(0, 200)}`,
            failed_at: new Date().toISOString(),
          },
        });
        failed++;
      }
    }
  } finally {
    // Close browser
    if (browser) {
      try {
        await browser.close();
      } catch (_) {
        // Best effort cleanup
      }
    }
  }

  console.log(`[Skool][BrowserWorker] Run complete: ${posted} posted, ${failed} failed`);
  return { posted, failed };
}

/**
 * Post a reply to an existing Skool post.
 * Navigates to the signal's post URL and submits a comment.
 */
async function postReply(page: any, response: any): Promise<void> {
  // Load the signal to get the post URL
  const signal = response.signal_id
    ? await SkoolSignal.findByPk(response.signal_id)
    : null;

  if (!signal || !signal.post_url) {
    throw new Error('Cannot reply: signal or post_url not found');
  }

  console.log(`[Skool][BrowserWorker] Navigating to post: ${signal.post_url}`);
  await page.goto(signal.post_url, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Find the comment/reply input area (contenteditable or textarea at bottom of page)
  const commentBox = page.locator(
    '[contenteditable="true"], textarea, [placeholder*="comment"], [placeholder*="Comment"], [placeholder*="Write"], [placeholder*="reply"]',
  ).last();

  const isVisible = await commentBox.isVisible({ timeout: 10000 }).catch(() => false);
  if (!isVisible) {
    throw new Error('Comment box not found on page');
  }

  await commentBox.click();
  await page.waitForTimeout(500);

  // Type the response body
  await commentBox.fill(response.body);
  await page.waitForTimeout(500);

  // Click the submit/reply button
  const submitBtn = page.locator(
    'button:has-text("Reply"), button:has-text("Comment"), button:has-text("Post"), button[type="submit"]',
  ).last();

  const submitVisible = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (!submitVisible) {
    throw new Error('Reply/submit button not found');
  }

  await submitBtn.click();
  await page.waitForTimeout(3000);
  console.log(`[Skool][BrowserWorker] Reply submitted to ${signal.post_url}`);
}

/**
 * Create a new post in the Skool community.
 * Opens the post editor, selects category, fills title/body, and submits.
 */
async function postNewPost(page: any, response: any): Promise<void> {
  console.log(`[Skool][BrowserWorker] Creating new post in category: ${response.category}`);

  // Navigate to community feed
  await page.goto(SKOOL_COMMUNITY_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Click "Write something" to open post editor
  const writeBtn = page.locator('text=Write something');
  const writeVisible = await writeBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (!writeVisible) {
    throw new Error('"Write something" button not found');
  }
  await writeBtn.click();
  await page.waitForTimeout(2000);

  // Select category if applicable
  if (response.category) {
    try {
      const catBtn = page.locator(
        'button:has-text("Select category"), [class*="category"], [data-testid*="category"]',
      ).first();
      const catVisible = await catBtn.isVisible({ timeout: 3000 }).catch(() => false);

      if (catVisible) {
        await catBtn.click();
        await page.waitForTimeout(1000);
        const catOption = page.locator(`text=${response.category}`).last();
        await catOption.click({ timeout: 3000 });
        await page.waitForTimeout(500);
        console.log(`[Skool][BrowserWorker] Category selected: ${response.category}`);
      } else {
        // Try alternative approach: scan for category/select buttons
        const allBtns = await page.locator('button, [role="button"], [class*="select"]').all();
        for (const btn of allBtns) {
          const text = ((await btn.textContent()) || '').trim();
          if (text.includes('category') || text.includes('Category') || text.includes('Select')) {
            await btn.click();
            await page.waitForTimeout(1000);
            const opt = page.locator(`text=${response.category}`).last();
            await opt.click({ timeout: 3000 });
            console.log(`[Skool][BrowserWorker] Category selected (alt): ${response.category}`);
            break;
          }
        }
      }
    } catch (catErr: any) {
      console.warn(`[Skool][BrowserWorker] Could not select category: ${catErr.message?.slice(0, 100)}`);
      // Continue without category - some communities don't require it
    }
  }

  // Fill title
  const title = response.title || response.body.split('\n')[0].slice(0, 100);
  const titleInput = page.locator(
    'input[placeholder*="Title"], input[placeholder*="title"], [data-testid*="title"]',
  ).first();
  const titleVisible = await titleInput.isVisible({ timeout: 5000 }).catch(() => false);
  if (!titleVisible) {
    throw new Error('Title input not found');
  }
  await titleInput.fill(title);
  await page.waitForTimeout(300);

  // Fill body using the rich text editor (contenteditable div or textarea)
  const editor = page.locator(
    '[contenteditable="true"], [class*="editor"], [class*="Editor"], textarea[placeholder*="Write"], [data-testid*="body"]',
  ).first();
  const editorVisible = await editor.isVisible({ timeout: 5000 }).catch(() => false);

  if (editorVisible) {
    await editor.click();
    await page.waitForTimeout(300);
    await editor.fill(response.body);
  } else {
    // Fallback: type via keyboard
    await page.keyboard.type(response.body, { delay: 1 });
  }
  await page.waitForTimeout(500);

  // Click Post button
  const postBtn = page.locator(
    'button:has-text("Post"), button:has-text("Publish"), button[type="submit"]',
  ).first();
  const postVisible = await postBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (!postVisible) {
    throw new Error('Post button not found');
  }

  await postBtn.click();
  await page.waitForTimeout(3000);
  console.log(`[Skool][BrowserWorker] New post submitted: "${title.slice(0, 50)}..."`);
}
