import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import path from 'path';
import OpenclawSession from '../../../models/OpenclawSession';

const BROWSER_PROFILES_DIR = '/data/browser-profiles';
const SCREENSHOTS_DIR = '/data/screenshots';

interface BrowserPostResult {
  post_url: string;
  screenshot_path: string | null;
  session_id: string;
}

interface BrowserPostConfig {
  headless: boolean;
  screenshot_on_post: boolean;
  min_delay_ms: number;
  max_delay_ms: number;
}

// Singleton browser instance — stays alive between cron runs
let browserInstance: Browser | null = null;

async function getBrowser(headless: boolean): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  browserInstance = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  // Clean up on process exit
  const cleanup = () => { browserInstance?.close().catch(() => {}); browserInstance = null; };
  process.once('SIGTERM', cleanup);
  process.once('SIGINT', cleanup);
  return browserInstance;
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Check which platforms support browser-based posting.
 */
export function hasBrowserSupport(platform: string): boolean {
  return ['devto'].includes(platform);
}

/**
 * Post a comment via Playwright browser automation.
 * Falls back with a thrown error if anything fails.
 */
export async function postViaBrowser(
  platform: string,
  articleUrl: string,
  commentBody: string,
  config: BrowserPostConfig,
): Promise<BrowserPostResult> {
  if (platform === 'devto') {
    return postToDevtoBrowser(articleUrl, commentBody, config);
  }
  throw new Error(`Browser posting not implemented for platform: ${platform}`);
}

// ── Dev.to Browser Strategy ────────────────────────────────────────

async function postToDevtoBrowser(
  articleUrl: string,
  commentBody: string,
  config: BrowserPostConfig,
): Promise<BrowserPostResult> {
  const email = process.env.DEVTO_EMAIL;
  const password = process.env.DEVTO_PASSWORD;
  if (!email || !password) throw new Error('DEVTO_EMAIL and DEVTO_PASSWORD env vars required for browser posting');

  // Get or create session record
  let session = await OpenclawSession.findOne({
    where: { platform: 'devto', session_status: ['active', 'idle'] as any },
    order: [['last_activity_at', 'DESC']],
  });
  if (!session) {
    session = await OpenclawSession.create({
      platform: 'devto',
      session_status: 'active',
      health_score: 1.0,
      pages_visited: 0,
      actions_performed: 0,
      errors: [],
    });
  }

  const browser = await getBrowser(config.headless);
  const profileDir = path.join(BROWSER_PROFILES_DIR, 'devto');
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Use persistent context for cookie reuse across runs
    context = await chromium.launchPersistentContext(profileDir, {
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });
    page = context.pages()[0] || await context.newPage();

    await session.update({ session_status: 'active', updated_at: new Date() });

    // 1. Navigate to article
    await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(1000, 2000);

    // 2. Check if logged in
    const isLoggedIn = await checkDevtoLoggedIn(page);
    if (!isLoggedIn) {
      await loginToDevto(page, email, password);
      // Navigate back to article after login
      await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(1000, 2000);
    }

    // 3. Anti-detection delay
    await randomDelay(config.min_delay_ms, config.max_delay_ms);

    // 4. Post the comment
    const postUrl = await submitDevtoComment(page, commentBody, articleUrl);

    // 5. Screenshot
    let screenshotPath: string | null = null;
    if (config.screenshot_on_post) {
      const filename = `devto_${Date.now()}.png`;
      screenshotPath = path.join(SCREENSHOTS_DIR, filename);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    // 6. Update session
    await session.update({
      session_status: 'idle',
      last_activity_at: new Date(),
      pages_visited: (session.pages_visited || 0) + 1,
      actions_performed: (session.actions_performed || 0) + 1,
      screenshot_path: screenshotPath || session.screenshot_path,
      updated_at: new Date(),
    });

    // Close page but keep context alive for next run
    await page.close();

    return {
      post_url: postUrl,
      screenshot_path: screenshotPath,
      session_id: session.id,
    };
  } catch (err: any) {
    // Take error screenshot if possible
    if (page && !page.isClosed()) {
      try {
        const errFile = path.join(SCREENSHOTS_DIR, `devto_error_${Date.now()}.png`);
        await page.screenshot({ path: errFile });
      } catch { /* ignore screenshot failure */ }
    }

    // Detect error type and update session
    const errMsg = err.message || '';
    let status: 'captcha_blocked' | 'rate_limited' | 'crashed' = 'crashed';
    if (errMsg.includes('captcha') || errMsg.includes('CAPTCHA')) status = 'captcha_blocked';
    if (errMsg.includes('rate limit') || errMsg.includes('429')) status = 'rate_limited';

    const errors = Array.isArray(session.errors) ? session.errors : [];
    errors.push({ message: errMsg.slice(0, 500), timestamp: new Date().toISOString(), status });

    await session.update({
      session_status: status,
      health_score: Math.max(0, (Number(session.health_score) || 1) - 0.2),
      errors,
      updated_at: new Date(),
    });

    // Clean up
    if (context) await context.close().catch(() => {});

    throw err;
  }
}

async function checkDevtoLoggedIn(page: Page): Promise<boolean> {
  try {
    // Dev.to shows user menu when logged in
    const userMenu = await page.locator('#user-menu-toggle, [data-testid="navbar-user-menu"], .crayons-avatar--l').first();
    return await userMenu.isVisible({ timeout: 3000 });
  } catch {
    return false;
  }
}

async function loginToDevto(page: Page, email: string, password: string): Promise<void> {
  // Load login page to get session cookies + CSRF token
  await page.goto('https://dev.to/enter', { waitUntil: 'networkidle', timeout: 30000 });
  await randomDelay(1000, 2000);

  // Extract CSRF token from the email login form
  const csrfToken = await page.evaluate(() => {
    const form = document.querySelector('input#user_email')?.closest('form');
    if (!form) return null;
    const token = form.querySelector('input[name="authenticity_token"]') as HTMLInputElement;
    return token ? token.value : null;
  });
  if (!csrfToken) throw new Error('Could not extract CSRF token from Dev.to login page');

  // Submit login via direct POST (bypasses Forem's client-side bot detection)
  const result = await page.evaluate(async (data: { csrf: string; email: string; password: string }) => {
    const formData = new URLSearchParams();
    formData.append('utf8', '\u2713');
    formData.append('authenticity_token', data.csrf);
    formData.append('user[email]', data.email);
    formData.append('user[password]', data.password);
    formData.append('user[remember_me]', '1');
    formData.append('commit', 'Log in');

    const resp = await fetch('/users/sign_in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      redirect: 'follow',
      credentials: 'same-origin',
    });
    return { status: resp.status, url: resp.url, ok: resp.ok };
  }, { csrf: csrfToken, email, password });

  if (!result.ok) throw new Error(`Dev.to login POST failed with status ${result.status}`);

  // Reload to apply session cookies
  await page.goto('https://dev.to', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await randomDelay(1000, 2000);

  // Verify login succeeded
  const loggedIn = await checkDevtoLoggedIn(page);
  if (!loggedIn) {
    throw new Error('Dev.to login failed — POST succeeded but session not established. Check DEVTO_EMAIL and DEVTO_PASSWORD');
  }
}

async function submitDevtoComment(page: Page, commentBody: string, articleUrl: string): Promise<string> {
  // Navigate to article to get its ID and CSRF token
  await page.goto(articleUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await randomDelay(1000, 2000);

  // Extract article ID and CSRF token from the page
  const pageData = await page.evaluate(() => {
    // Article ID from data attributes or meta tags
    const articleEl = document.querySelector('[data-article-id]');
    const articleId = articleEl?.getAttribute('data-article-id')
      || document.querySelector('meta[name="article-id"]')?.getAttribute('content');
    // CSRF token from meta tag
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    return { articleId, csrfToken };
  });

  if (!pageData.articleId) throw new Error('Could not extract article ID from page');
  if (!pageData.csrfToken) throw new Error('Could not extract CSRF token from article page');

  // Submit comment via direct POST (bypasses client-side bot detection)
  const result = await page.evaluate(async (data: { articleId: string; csrf: string; body: string }) => {
    const resp = await fetch('/comments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': data.csrf,
      },
      body: JSON.stringify({
        comment: {
          body_markdown: data.body,
          commentable_id: parseInt(data.articleId, 10),
          commentable_type: 'Article',
        },
      }),
      credentials: 'same-origin',
    });
    const text = await resp.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: resp.status, ok: resp.ok, json, text: text.substring(0, 500) };
  }, { articleId: pageData.articleId, csrf: pageData.csrfToken, body: commentBody });

  if (!result.ok) {
    const errDetail = result.json?.error || result.text?.substring(0, 200) || `status ${result.status}`;
    throw new Error(`Comment POST failed: ${errDetail}`);
  }

  // Extract comment URL from response
  if (result.json?.url) {
    return result.json.url.startsWith('http') ? result.json.url : `https://dev.to${result.json.url}`;
  }
  if (result.json?.id) {
    return `${articleUrl.replace(/\/$/, '')}#comment-${result.json.id}`;
  }

  return `${articleUrl.replace(/\/$/, '')}#comment-posted-${Date.now()}`;
}
