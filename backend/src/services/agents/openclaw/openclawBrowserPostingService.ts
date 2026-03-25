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
  await page.goto('https://dev.to/enter', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await randomDelay(1000, 2000);

  // Check for captcha
  const hasCaptcha = await page.locator('iframe[src*="captcha"], iframe[src*="recaptcha"], .h-captcha').first().isVisible({ timeout: 2000 }).catch(() => false);
  if (hasCaptcha) throw new Error('captcha detected on login page');

  // Fill email field
  const emailField = page.getByLabel('Email').or(page.locator('input[name="user[email]"], input[type="email"]').first());
  await emailField.click();
  await emailField.type(email, { delay: 40 });

  // Fill password field
  const passwordField = page.getByLabel('Password').or(page.locator('input[name="user[password]"], input[type="password"]').first());
  await passwordField.click();
  await passwordField.type(password, { delay: 40 });

  await randomDelay(500, 1000);

  // Click the email/password "Log in" button (not social login buttons)
  const loginBtn = page.locator('input[type="submit"][value="Log in"], input[name="commit"]').first();
  await loginBtn.click();

  // Wait for navigation
  await page.waitForURL('**/*', { timeout: 15000 });
  await randomDelay(1000, 2000);

  // Verify login succeeded
  const loggedIn = await checkDevtoLoggedIn(page);
  if (!loggedIn) {
    // Check for error messages
    const errorText = await page.locator('.crayons-notice--danger, .flash-error, [role="alert"]').first().textContent({ timeout: 3000 }).catch(() => '');
    throw new Error(`Dev.to login failed${errorText ? ': ' + errorText.trim() : ' — check DEVTO_EMAIL and DEVTO_PASSWORD'}`);
  }
}

async function submitDevtoComment(page: Page, commentBody: string, articleUrl: string): Promise<string> {
  // Scroll to comment section
  const commentSection = page.locator('#comment-form-area, #comments, .comment-form, [data-testid="comments-section"]').first();
  await commentSection.scrollIntoViewIfNeeded({ timeout: 10000 });
  await randomDelay(500, 1000);

  // Find and focus the comment textarea
  const textarea = page.locator('textarea[placeholder*="comment" i], textarea[name="comment[body_markdown]"], #text-area, .comment-textarea').first()
    .or(page.getByRole('textbox', { name: /comment/i }));
  await textarea.click();
  await randomDelay(300, 600);

  // Type the comment with realistic keystroke delays
  await textarea.fill(''); // Clear any existing text
  await textarea.type(commentBody, { delay: 15 });
  await randomDelay(1000, 2000);

  // Submit the comment
  const submitBtn = page.getByRole('button', { name: /submit|post comment/i })
    .or(page.locator('button.comment-submit, input[type="submit"][value*="Submit"], button[data-testid="comment-submit"]').first());
  await submitBtn.click();

  // Wait for the comment to appear
  await randomDelay(3000, 5000);

  // Try to extract the comment permalink
  // Dev.to comments have anchors like #comment-xxxxx
  try {
    // Look for the most recent comment by this user
    const latestComment = page.locator('.comment--mine, .single-comment-node').last();
    const commentLink = await latestComment.locator('a[href*="#comment-"]').first().getAttribute('href', { timeout: 5000 });
    if (commentLink) {
      return commentLink.startsWith('http') ? commentLink : `${articleUrl.replace(/\/$/, '')}${commentLink}`;
    }
  } catch { /* fall through */ }

  // Fallback: return article URL with timestamp-based anchor
  return `${articleUrl.replace(/\/$/, '')}#comment-posted-${Date.now()}`;
}
