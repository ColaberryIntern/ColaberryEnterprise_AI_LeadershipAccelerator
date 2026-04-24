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
    const models = require('../../../models');
    const SkoolSignal = models.SkoolSignal;
    const SkoolTask = models.SkoolTask;
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
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(3000);

    // Fill credentials using simple selectors (proven to work)
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', password);
    await page.click('button[type=submit]');

    // Wait for login to complete (Skool uses client-side routing)
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      console.error(`${LOG_PREFIX} Still on login page after submit. URL: ${currentUrl}`);
      return false;
    }

    console.log(`${LOG_PREFIX} Login successful: ${currentUrl}`);
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
    await page.goto(SKOOL_BASE_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

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
    await page.goto(categoryUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
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
    // Extract post data using link-based detection (proven working pattern).
    // Skool uses styled-components with hashed class names — CSS selectors are
    // unreliable. Instead, find all links to /learn-ai/{slug} posts and extract
    // context from their parent containers.
    const postData = await page.evaluate((maxBodyLength: number) => {
      const results: Array<{
        title: string;
        body: string;
        author: string;
        url: string;
        commentCount: number;
        likeCount: number;
      }> = [];

      const allLinks = document.querySelectorAll('a[href*="/learn-ai/"]');
      const seen = new Set<string>();

      allLinks.forEach((link) => {
        const href = (link as HTMLAnchorElement).href || '';
        const path = href.replace('https://www.skool.com', '');
        // Must be a post URL: /learn-ai/{slug} (not /classroom, /about, etc.)
        if (!path.startsWith('/learn-ai/')) return;
        const slug = path.replace('/learn-ai/', '').split('?')[0];
        if (!slug || slug.length < 5) return;
        if (['classroom', 'calendar', 'members', 'about', 'leaderboards', 'map'].includes(slug)) return;
        if (seen.has(slug)) return;
        seen.add(slug);

        const title = link.textContent?.trim() || '';
        if (title.length < 10 || title === 'AI Automation Agency Hub') return;
        // Skip "New comment X ago" links
        if (title.startsWith('New comment') || title.startsWith('Last comment')) return;

        // Walk up to find post container
        let container = link.parentElement;
        for (let i = 0; i < 8 && container; i++) {
          if (container.children.length >= 3 && container.clientHeight > 80) break;
          container = container.parentElement;
        }

        // Extract body from container
        let body = container ? container.innerText.substring(0, maxBodyLength) : '';

        // Find author (link with /@)
        let author = 'Unknown';
        if (container) {
          const authorLink = container.querySelector('a[href*="/@"]');
          if (authorLink) author = authorLink.textContent?.trim() || 'Unknown';
        }

        // Extract like/comment counts (numbers at end of post text)
        let commentCount = 0;
        let likeCount = 0;
        if (container) {
          const nums = container.innerText.match(/^(\d+)$/gm);
          if (nums && nums.length >= 2) {
            likeCount = parseInt(nums[nums.length - 2], 10) || 0;
            commentCount = parseInt(nums[nums.length - 1], 10) || 0;
          }
        }

        results.push({ title, body, author, url: href, commentCount, likeCount });
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
    const existing = await models.SkoolSignal.findOne({ where: { post_url: url } });
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
      post_url: post.url,
      post_title: post.title,
      post_body_preview: post.body,
      author_name: post.author,
      category,
      comment_count: post.commentCount,
      like_count: post.likeCount,
      priority_score: score,
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
