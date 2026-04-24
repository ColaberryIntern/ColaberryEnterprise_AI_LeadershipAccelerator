/**
 * Skool Signal Detection Agent
 *
 * Scans the AI Automation Agency Hub on Skool via Playwright browser automation.
 * Extracts posts from each category, scores them for engagement priority,
 * and stores qualified signals in the database for reply generation.
 *
 * Flow:
 *   1. Check SKOOL_ENABLED env var
 *   2. Launch headless Playwright browser
 *   3. Login to Skool
 *   4. For each category: navigate, extract posts, dedupe, score, store
 *   5. Create generate_reply tasks for high-scoring signals
 *   6. Close browser, return counts
 *
 * Execution: Triggered by scheduler. Not user-facing.
 * Safety: All browser errors are caught and logged. Agent never crashes.
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import {
  getCategoryConfig,
  scoreSignal,
  shouldEngage,
  SkoolSignalInput,
} from './skoolPlatformStrategy';

const LOG_PREFIX = '[Skool][SignalDetection]';
const SKOOL_BASE_URL = 'https://www.skool.com/learn-ai';
const POST_BODY_MAX_LENGTH = 500;
const SCROLL_PAUSE_MS = 1500;
const NAV_TIMEOUT_MS = 30000;
const LOGIN_URL = 'https://www.skool.com/login';

// ─── Model Imports (lazy, with fallback) ─────────────────────────────────────

interface SkoolSignalRecord {
  id?: number;
  url: string;
  title: string;
  body: string;
  author: string;
  category: string;
  comment_count: number;
  like_count: number;
  score: number;
  posted_at: Date;
  detected_at: Date;
  status: string;
}

interface SkoolTaskRecord {
  signal_id: number;
  task_type: string;
  status: string;
  created_at: Date;
}

function getModels(): { SkoolSignal: any; SkoolTask: any } | null {
  try {
    const SkoolSignal = require('../../models/SkoolSignal').default || require('../../models/SkoolSignal');
    const SkoolTask = require('../../models/SkoolTask').default || require('../../models/SkoolTask');
    return { SkoolSignal, SkoolTask };
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to load models - DB operations will be skipped:`, err);
    return null;
  }
}

// ─── Extracted Post Shape ────────────────────────────────────────────────────

interface ExtractedPost {
  title: string;
  body: string;
  author: string;
  url: string;
  commentCount: number;
  likeCount: number;
}

// ─── Browser Helpers ─────────────────────────────────────────────────────────

async function loginToSkool(page: Page): Promise<boolean> {
  const email = process.env.SKOOL_EMAIL;
  const password = process.env.SKOOL_PASSWORD;

  if (!email || !password) {
    console.error(`${LOG_PREFIX} SKOOL_EMAIL or SKOOL_PASSWORD env vars not set`);
    return false;
  }

  try {
    console.log(`${LOG_PREFIX} Navigating to login page...`);
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });

    // Fill email
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(email);

    // Fill password
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(password);

    // Click login button
    const loginButton = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();
    await loginButton.click();

    // Wait for navigation away from login page
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15000 });

    console.log(`${LOG_PREFIX} Login successful`);
    return true;
  } catch (err) {
    console.error(`${LOG_PREFIX} Login failed:`, err);
    return false;
  }
}

async function scrollToLoadPosts(page: Page, scrollCount: number = 3): Promise<void> {
  for (let i = 0; i < scrollCount; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(SCROLL_PAUSE_MS);
  }
}

async function navigateToCategory(page: Page, category: string): Promise<boolean> {
  try {
    // Navigate to the community page
    await page.goto(SKOOL_BASE_URL, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });

    // Look for the category filter/tab. Skool uses clickable category labels.
    // Try multiple selector strategies since Skool's DOM may change.
    const categorySelectors = [
      `button:has-text("${category}")`,
      `a:has-text("${category}")`,
      `[data-category="${category}"]`,
      `div:has-text("${category}")`,
    ];

    for (const selector of categorySelectors) {
      try {
        const element = page.locator(selector).first();
        const isVisible = await element.isVisible().catch(() => false);
        if (isVisible) {
          await element.click();
          await page.waitForTimeout(2000);
          console.log(`${LOG_PREFIX} Navigated to category: ${category}`);
          return true;
        }
      } catch {
        // Try next selector
      }
    }

    // Fallback: try URL-based category navigation
    const categoryUrl = `${SKOOL_BASE_URL}?c=${encodeURIComponent(category)}`;
    await page.goto(categoryUrl, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    console.log(`${LOG_PREFIX} Navigated to category via URL: ${category}`);
    return true;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to navigate to category ${category}:`, err);
    return false;
  }
}

async function extractPostsFromPage(page: Page): Promise<ExtractedPost[]> {
  const posts: ExtractedPost[] = [];

  try {
    // Extract post data from the page. Skool renders posts in feed cards.
    // We use multiple selectors to handle DOM variations.
    const postData = await page.evaluate((maxBodyLength: number) => {
      const results: Array<{
        title: string;
        body: string;
        author: string;
        url: string;
        commentCount: number;
        likeCount: number;
      }> = [];

      // Skool post containers - try multiple selectors
      const postElements = document.querySelectorAll(
        '[data-testid="post-card"], .post-card, article, [class*="PostCard"], [class*="post-item"]'
      );

      // If no specific post cards found, try a broader approach
      const elements = postElements.length > 0
        ? postElements
        : document.querySelectorAll('[class*="feed"] > div > div');

      elements.forEach((el) => {
        try {
          // Title: look for heading or strong text inside the post
          const titleEl = el.querySelector('h2, h3, h4, [class*="title"], [class*="Title"], strong');
          const title = titleEl?.textContent?.trim() || '';

          // Body: look for paragraph or body text
          const bodyEl = el.querySelector('p, [class*="body"], [class*="Body"], [class*="content"], [class*="Content"]');
          let body = bodyEl?.textContent?.trim() || '';
          if (body.length > maxBodyLength) {
            body = body.substring(0, maxBodyLength);
          }

          // Author
          const authorEl = el.querySelector('[class*="author"], [class*="Author"], [class*="user"], [class*="name"]');
          const author = authorEl?.textContent?.trim() || 'Unknown';

          // URL: look for a link to the post
          const linkEl = el.querySelector('a[href*="/post/"], a[href*="/learn-ai/"]') as HTMLAnchorElement | null;
          const url = linkEl?.href || '';

          // Comment count
          const commentEl = el.querySelector('[class*="comment"], [class*="Comment"], [class*="reply"], [class*="Reply"]');
          const commentText = commentEl?.textContent?.trim() || '0';
          const commentCount = parseInt(commentText.replace(/\D/g, ''), 10) || 0;

          // Like count
          const likeEl = el.querySelector('[class*="like"], [class*="Like"], [class*="upvote"], [class*="Upvote"]');
          const likeText = likeEl?.textContent?.trim() || '0';
          const likeCount = parseInt(likeText.replace(/\D/g, ''), 10) || 0;

          if (title || body) {
            results.push({ title, body, author, url, commentCount, likeCount });
          }
        } catch {
          // Skip malformed elements
        }
      });

      return results;
    }, POST_BODY_MAX_LENGTH);

    posts.push(...postData);
    console.log(`${LOG_PREFIX} Extracted ${posts.length} posts from page`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to extract posts:`, err);
  }

  return posts;
}

// ─── DB Helpers ──────────────────────────────────────────────────────────────

async function signalExistsInDb(models: { SkoolSignal: any }, url: string): Promise<boolean> {
  try {
    const existing = await models.SkoolSignal.findOne({ where: { url } });
    return !!existing;
  } catch (err) {
    console.error(`${LOG_PREFIX} DB lookup failed for URL ${url}:`, err);
    return false;
  }
}

async function storeSignal(
  models: { SkoolSignal: any },
  post: ExtractedPost,
  category: string,
  score: number,
): Promise<number | null> {
  try {
    const record = await models.SkoolSignal.create({
      url: post.url,
      title: post.title,
      body: post.body,
      author: post.author,
      category,
      comment_count: post.commentCount,
      like_count: post.likeCount,
      score,
      posted_at: new Date(),
      detected_at: new Date(),
      status: 'new',
    });
    return record.id;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to store signal:`, err);
    return null;
  }
}

async function createReplyTask(
  models: { SkoolTask: any },
  signalId: number,
): Promise<void> {
  try {
    await models.SkoolTask.create({
      signal_id: signalId,
      task_type: 'generate_reply',
      status: 'pending',
      created_at: new Date(),
    });
    console.log(`${LOG_PREFIX} Created generate_reply task for signal ${signalId}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to create reply task for signal ${signalId}:`, err);
  }
}

async function getDailyCategoryCount(
  models: { SkoolSignal: any },
  category: string,
): Promise<number> {
  try {
    const { Op } = require('sequelize');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const count = await models.SkoolSignal.count({
      where: {
        category,
        detected_at: { [Op.gte]: todayStart },
        status: { [Op.in]: ['engaged', 'reply_generated'] },
      },
    });
    return count;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to get daily category count:`, err);
    return 0;
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function runSkoolSignalDetection(): Promise<{ scanned: number; newSignals: number }> {
  const result = { scanned: 0, newSignals: 0 };

  // Gate: check if Skool engagement is enabled
  if (process.env.SKOOL_ENABLED !== 'true') {
    console.log(`${LOG_PREFIX} SKOOL_ENABLED is not true. Skipping signal detection.`);
    return result;
  }

  // Load models
  const models = getModels();
  if (!models) {
    console.error(`${LOG_PREFIX} Models not available. Aborting signal detection.`);
    return result;
  }

  let browser: Browser | null = null;

  try {
    console.log(`${LOG_PREFIX} Starting signal detection...`);

    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context: BrowserContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    const page: Page = await context.newPage();

    // Login
    const loginSuccess = await loginToSkool(page);
    if (!loginSuccess) {
      console.error(`${LOG_PREFIX} Login failed. Aborting.`);
      return result;
    }

    // Process each category
    const categories = getCategoryConfig();

    for (const [categoryName] of Object.entries(categories)) {
      try {
        console.log(`${LOG_PREFIX} Processing category: ${categoryName}`);

        // Navigate to category
        const navSuccess = await navigateToCategory(page, categoryName);
        if (!navSuccess) {
          console.warn(`${LOG_PREFIX} Skipping category ${categoryName} - navigation failed`);
          continue;
        }

        // Scroll to load posts
        await scrollToLoadPosts(page);

        // Extract posts
        const posts = await extractPostsFromPage(page);
        result.scanned += posts.length;

        // Get daily count for rate limiting
        const dailyCount = await getDailyCategoryCount(models, categoryName);

        // Process each post
        for (const post of posts) {
          try {
            // Skip posts without URLs (can't dedupe)
            if (!post.url) {
              console.log(`${LOG_PREFIX} Skipping post without URL: "${post.title.substring(0, 50)}"`);
              continue;
            }

            // Dedupe: check if already in DB
            const exists = await signalExistsInDb(models, post.url);
            if (exists) {
              continue;
            }

            // Build signal input for scoring
            const signalInput: SkoolSignalInput = {
              category: categoryName,
              title: post.title,
              body: post.body,
              commentCount: post.commentCount,
              postedAt: new Date(), // Approximate - Skool doesn't always show exact timestamps
            };

            // Score the signal
            const score = scoreSignal(signalInput);

            // Store in DB regardless of score (for analytics)
            const signalId = await storeSignal(models, post, categoryName, score);

            if (signalId !== null) {
              result.newSignals++;
              console.log(
                `${LOG_PREFIX} New signal: "${post.title.substring(0, 60)}" [${categoryName}] score=${score}`,
              );

              // Create reply task if engagement criteria met
              if (shouldEngage(signalInput, dailyCount)) {
                await createReplyTask(models, signalId);
              }
            }
          } catch (postErr) {
            console.error(
              `${LOG_PREFIX} Error processing post "${post.title.substring(0, 40)}":`,
              postErr,
            );
          }
        }
      } catch (catErr) {
        console.error(`${LOG_PREFIX} Error processing category ${categoryName}:`, catErr);
      }
    }

    // Close browser context
    await context.close();

    console.log(
      `${LOG_PREFIX} Signal detection complete. Scanned: ${result.scanned}, New signals: ${result.newSignals}`,
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} Fatal error during signal detection:`, err);
  } finally {
    // Always close the browser
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.error(`${LOG_PREFIX} Failed to close browser:`, closeErr);
      }
    }
  }

  return result;
}
