import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'path';
import fs from 'fs/promises';
import OpenclawSession from '../../../models/OpenclawSession';
import { getFacebookCookiesForBrowser } from './openclawFacebookService';
import { getRedditCookiesForBrowser } from './openclawRedditService';

const BROWSER_PROFILES_DIR = '/data/browser-profiles';
const SCREENSHOTS_DIR = '/data/screenshots';

/**
 * Clear stale Chromium lock files from a persistent browser profile.
 * These files survive container restarts and crashed processes, causing
 * "profile appears to be in use by another Chromium process" errors.
 */
async function clearStaleLocks(profileDir: string): Promise<void> {
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  for (const f of lockFiles) {
    try { await fs.unlink(path.join(profileDir, f)); } catch { /* doesn't exist */ }
  }
}

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

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Check which platforms support browser-based posting.
 */
export function hasBrowserSupport(platform: string): boolean {
  return ['devto', 'medium', 'facebook_groups', 'reddit'].includes(platform);
}

/**
 * Post a comment via Playwright browser automation.
 * Uses persistent browser profile with Google OAuth session cookies.
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
  if (platform === 'medium') {
    return postToMediumBrowser(articleUrl, commentBody, config);
  }
  if (platform === 'facebook_groups') {
    return postToFacebookGroupBrowser(articleUrl, commentBody, config);
  }
  if (platform === 'reddit') {
    return postToRedditBrowser(articleUrl, commentBody, config);
  }
  throw new Error(`Browser posting not implemented for platform: ${platform}`);
}

// ── Dev.to Browser Strategy ────────────────────────────────────────
// Auth: Google OAuth session saved in persistent browser profile at /data/browser-profiles/devto/
// CSRF: Fetched from /async_info/base_data (CDN-cached page meta tags are stale)
// Comments: POST /comments with CSRF token from authenticated session

async function postToDevtoBrowser(
  articleUrl: string,
  commentBody: string,
  config: BrowserPostConfig,
): Promise<BrowserPostResult> {
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

  const profileDir = path.join(BROWSER_PROFILES_DIR, 'devto');
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Clear stale lock files from previous crashes/container restarts
    await clearStaleLocks(profileDir);

    // Persistent context reuses Google OAuth session cookies across runs
    context = await chromium.launchPersistentContext(profileDir, {
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });
    page = context.pages()[0] || await context.newPage();

    // Hide automation fingerprint
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

    await session.update({ session_status: 'active', updated_at: new Date() });

    // 1. Navigate to article page
    await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(1000, 2000);

    // 2. Check auth + get CSRF token via async_info (the real source of truth)
    const authData = await page.evaluate(`(async () => {
      const resp = await fetch('/async_info/base_data', { credentials: 'same-origin' });
      const data = await resp.json();
      return { user: data.user ? { id: data.user.id, name: data.user.name, username: data.user.username } : null, token: data.token || null };
    })()`) as { user: { id: number; name: string; username: string } | null; token: string | null };

    if (!authData.user) {
      throw new Error('Dev.to session expired -browser profile not authenticated. Re-run Google OAuth login to re-establish session.');
    }
    if (!authData.token) {
      throw new Error('Dev.to CSRF token missing from async_info despite valid session');
    }

    console.log(`[OpenClaw Browser] Authenticated as ${authData.user.name} (${authData.user.username})`);

    // 3. Extract article ID from the page DOM
    const articleId = await page.evaluate(`(() => {
      const el = document.querySelector('[data-article-id]');
      return el ? el.getAttribute('data-article-id') : null;
    })()`) as string | null;

    if (!articleId) throw new Error(`Could not extract article ID from ${articleUrl}`);

    // 4. Anti-detection delay
    await randomDelay(config.min_delay_ms, config.max_delay_ms);

    // 5. Post comment via fetch with async_info CSRF token
    const postResult = await page.evaluate(`(async () => {
      const resp = await fetch('/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': ${JSON.stringify(authData.token)},
        },
        body: JSON.stringify({
          comment: {
            body_markdown: ${JSON.stringify(commentBody)},
            commentable_id: ${parseInt(articleId, 10)},
            commentable_type: 'Article',
          },
        }),
        credentials: 'same-origin',
      });
      const text = await resp.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: resp.status, ok: resp.ok, json, text: text.substring(0, 500) };
    })()`) as { status: number; ok: boolean; json: any; text: string };

    if (!postResult.ok) {
      const errDetail = postResult.json?.error || postResult.text?.substring(0, 200) || `status ${postResult.status}`;
      throw new Error(`Comment POST failed (${postResult.status}): ${errDetail}`);
    }

    // 6. Extract comment URL
    let postUrl: string;
    if (postResult.json?.url) {
      postUrl = postResult.json.url.startsWith('http') ? postResult.json.url : `https://dev.to${postResult.json.url}`;
    } else if (postResult.json?.id_code) {
      postUrl = `https://dev.to/${authData.user.username}/comment/${postResult.json.id_code}`;
    } else if (postResult.json?.id) {
      postUrl = `${articleUrl.replace(/\/$/, '')}#comment-${postResult.json.id}`;
    } else {
      postUrl = `${articleUrl.replace(/\/$/, '')}#comment-posted-${Date.now()}`;
    }

    console.log(`[OpenClaw Browser] Comment posted: ${postUrl}`);

    // 7. Screenshot
    let screenshotPath: string | null = null;
    if (config.screenshot_on_post) {
      const filename = `devto_${Date.now()}.png`;
      screenshotPath = path.join(SCREENSHOTS_DIR, filename);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    // 8. Update session
    await session.update({
      session_status: 'idle',
      last_activity_at: new Date(),
      pages_visited: (session.pages_visited || 0) + 1,
      actions_performed: (session.actions_performed || 0) + 1,
      screenshot_path: screenshotPath || session.screenshot_path,
      updated_at: new Date(),
    });

    // Close context (saves cookies to persistent profile)
    await context.close();

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
    if (errMsg.includes('session expired')) status = 'crashed'; // Needs re-auth

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

// ── Medium Browser Strategy ──────────────────────────────────────────
// Auth: Email/Google OAuth session saved in persistent browser profile at /data/browser-profiles/medium/
// Responses: Navigate to article, click respond, type in editor, submit

async function postToMediumBrowser(
  articleUrl: string,
  commentBody: string,
  config: BrowserPostConfig,
): Promise<BrowserPostResult> {
  let session = await OpenclawSession.findOne({
    where: { platform: 'medium', session_status: ['active', 'idle'] as any },
    order: [['last_activity_at', 'DESC']],
  });
  if (!session) {
    session = await OpenclawSession.create({
      platform: 'medium',
      session_status: 'active',
      health_score: 1.0,
      pages_visited: 0,
      actions_performed: 0,
      errors: [],
    });
  }

  const profileDir = path.join(BROWSER_PROFILES_DIR, 'medium');
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Clear stale lock files from previous crashes/container restarts
    await clearStaleLocks(profileDir);

    context = await chromium.launchPersistentContext(profileDir, {
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });
    page = context.pages()[0] || await context.newPage();

    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    await session.update({ session_status: 'active', updated_at: new Date() });

    // 1. Navigate to the article
    await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 4000);

    // 2. Check if authenticated by looking for user avatar/menu
    const isLoggedIn = await page.evaluate(`(() => {
      return !!(document.querySelector('img[data-testid="headerUserImage"]')
        || document.querySelector('button[data-testid="headerUserMenuButton"]')
        || document.querySelector('[aria-label="user menu"]')
        || document.querySelector('button[aria-label="Write"]'));
    })()`) as boolean;

    if (!isLoggedIn) {
      throw new Error('Medium session expired. Re-run login in browser profile at /data/browser-profiles/medium/');
    }

    console.log('[OpenClaw Browser] Medium session authenticated');

    // 3. Scroll to bottom to find the response section
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await randomDelay(1000, 2000);

    // 4. Click the response/comment input area
    // Medium uses several possible selectors for the response section
    const responseOpened = await page.evaluate(`(async () => {
      // Try clicking "Write a response" or the response input area
      const selectors = [
        'button[data-testid="responsesIconButton"]',
        'button[data-action="open-responses"]',
        '[data-testid="responseComposer"]',
        'button[aria-label="responses"]',
        'button:has-text("Write a response")',
        'button:has-text("Respond")',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { (el as HTMLElement).click(); return true; }
      }
      return false;
    })()`) as boolean;

    if (!responseOpened) {
      // Try Playwright's text-based click as fallback
      try {
        await page.getByRole('button', { name: /respond/i }).first().click({ timeout: 5000 });
      } catch {
        try {
          await page.locator('button:has-text("Write a response")').first().click({ timeout: 5000 });
        } catch {
          throw new Error('Could not find Medium response/comment button. DOM structure may have changed.');
        }
      }
    }

    await randomDelay(1500, 3000);

    // 5. Type into the response editor (contenteditable div)
    const typed = await page.evaluate(`(async () => {
      // Medium uses a contenteditable paragraph inside the response composer
      const editorSelectors = [
        '[data-testid="responseComposer"] [contenteditable="true"]',
        '[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"][data-placeholder]',
        '.postArticle-content [contenteditable="true"]',
        'section[data-testid="responses"] [contenteditable="true"]',
      ];
      for (const sel of editorSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          (el as HTMLElement).focus();
          (el as HTMLElement).innerText = '';
          return { found: true, selector: sel };
        }
      }
      return { found: false, selector: null };
    })()`) as { found: boolean; selector: string | null };

    if (!typed.found) {
      throw new Error('Could not find Medium response editor. DOM structure may have changed.');
    }

    // Type character by character with human-like delays
    await page.locator(typed.selector!).first().click();
    await randomDelay(300, 600);
    await page.keyboard.type(commentBody, { delay: 15 + Math.random() * 25 });

    await randomDelay(config.min_delay_ms, config.max_delay_ms);

    // 6. Click the publish/submit button
    const submitted = await page.evaluate(`(async () => {
      const submitSelectors = [
        'button[data-testid="publishResponseButton"]',
        'button[data-action="publish-response"]',
        'button:has-text("Respond")',
        'button:has-text("Publish")',
      ];
      for (const sel of submitSelectors) {
        const el = document.querySelector(sel);
        if (el && !(el as HTMLButtonElement).disabled) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    })()`) as boolean;

    if (!submitted) {
      try {
        await page.getByRole('button', { name: /respond/i }).last().click({ timeout: 5000 });
      } catch {
        throw new Error('Could not find Medium submit/respond button. DOM structure may have changed.');
      }
    }

    // Wait for submission to complete
    await randomDelay(3000, 5000);

    // 7. Capture the response URL (Medium redirects or shows the response inline)
    const currentUrl = page.url();
    const postUrl = currentUrl.includes('medium.com')
      ? currentUrl
      : `${articleUrl}#response-posted-${Date.now()}`;

    console.log(`[OpenClaw Browser] Medium response posted: ${postUrl}`);

    // 8. Screenshot
    let screenshotPath: string | null = null;
    if (config.screenshot_on_post) {
      const filename = `medium_${Date.now()}.png`;
      screenshotPath = path.join(SCREENSHOTS_DIR, filename);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    // 9. Update session
    await session.update({
      session_status: 'idle',
      last_activity_at: new Date(),
      pages_visited: (session.pages_visited || 0) + 1,
      actions_performed: (session.actions_performed || 0) + 1,
      screenshot_path: screenshotPath || session.screenshot_path,
      updated_at: new Date(),
    });

    await context.close();

    return { post_url: postUrl, screenshot_path: screenshotPath, session_id: session.id };
  } catch (err: any) {
    if (page && !page.isClosed()) {
      try {
        const errFile = path.join(SCREENSHOTS_DIR, `medium_error_${Date.now()}.png`);
        await page.screenshot({ path: errFile });
      } catch { /* ignore */ }
    }

    const errMsg = err.message || '';
    let status: 'captcha_blocked' | 'rate_limited' | 'crashed' = 'crashed';
    if (errMsg.includes('captcha') || errMsg.includes('CAPTCHA')) status = 'captcha_blocked';
    if (errMsg.includes('rate limit') || errMsg.includes('429')) status = 'rate_limited';
    if (errMsg.includes('session expired')) status = 'crashed';

    const errors = Array.isArray(session.errors) ? session.errors : [];
    errors.push({ message: errMsg.slice(0, 500), timestamp: new Date().toISOString(), status });

    await session.update({
      session_status: status,
      health_score: Math.max(0, (Number(session.health_score) || 1) - 0.2),
      errors,
      updated_at: new Date(),
    });

    if (context) await context.close().catch(() => {});
    throw err;
  }
}

// ── Facebook Groups Browser Strategy ─────────────────────────────────────────
// Auth: Cookie-based (c_user + xs) injected into persistent browser profile
// Modes: Comment on existing post OR create new group post
// Non-headless required (Facebook blocks headless Chrome) — uses Xvfb :99

async function postToFacebookGroupBrowser(
  targetUrl: string,
  content: string,
  config: BrowserPostConfig,
): Promise<BrowserPostResult> {
  let session = await OpenclawSession.findOne({
    where: { platform: 'facebook_groups', session_status: ['active', 'idle'] as any },
    order: [['last_activity_at', 'DESC']],
  });
  if (!session) {
    session = await OpenclawSession.create({
      platform: 'facebook_groups',
      session_status: 'active',
      health_score: 1.0,
      pages_visited: 0,
      actions_performed: 0,
      errors: [],
    });
  }

  const profileDir = path.join(BROWSER_PROFILES_DIR, 'facebook');
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  // Determine mode: comment on specific post vs create new group post
  const isCommentMode = /\/(posts|permalink)\//.test(targetUrl);

  try {
    await clearStaleLocks(profileDir);
    await fs.mkdir(profileDir, { recursive: true });

    // Facebook blocks headless browsers — use non-headless with Xvfb
    process.env.DISPLAY = process.env.DISPLAY || ':99';
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    // Inject saved Facebook cookies
    try {
      const fbCookies = await getFacebookCookiesForBrowser();
      await context.addCookies(fbCookies);
    } catch (err: any) {
      throw new Error(`Facebook cookies not found: ${err.message}. Save your session cookies first.`);
    }

    page = context.pages()[0] || await context.newPage();
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    await session.update({ session_status: 'active', updated_at: new Date() });

    // Navigate to target URL
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 5000);

    // Check if authenticated
    const isLoggedIn = await page.evaluate(`(() => {
      // Check for login redirect or login form
      if (window.location.href.includes('/login') || window.location.href.includes('checkpoint')) return false;
      // Check for user nav elements
      return !!(document.querySelector('[aria-label="Your profile"]')
        || document.querySelector('[aria-label="Account"]')
        || document.querySelector('[data-pagelet="ProfileActions"]')
        || document.querySelector('div[role="navigation"] image')
        || document.querySelector('svg[aria-label="Your profile"]'));
    })()`) as boolean;

    if (!isLoggedIn) {
      throw new Error('Facebook session expired. Re-paste your c_user and xs cookies.');
    }

    console.log(`[OpenClaw Browser] Facebook session authenticated, mode: ${isCommentMode ? 'comment' : 'new post'}`);

    let postUrl: string;

    if (isCommentMode) {
      postUrl = await facebookCommentOnPost(page, content, config);
    } else {
      postUrl = await facebookCreateGroupPost(page, content, config);
    }

    console.log(`[OpenClaw Browser] Facebook ${isCommentMode ? 'comment' : 'post'} created: ${postUrl}`);

    // Screenshot
    let screenshotPath: string | null = null;
    if (config.screenshot_on_post) {
      const filename = `facebook_${Date.now()}.png`;
      screenshotPath = path.join(SCREENSHOTS_DIR, filename);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    await session.update({
      session_status: 'idle',
      last_activity_at: new Date(),
      pages_visited: (session.pages_visited || 0) + 1,
      actions_performed: (session.actions_performed || 0) + 1,
      screenshot_path: screenshotPath || session.screenshot_path,
      updated_at: new Date(),
    });

    await context.close();
    return { post_url: postUrl, screenshot_path: screenshotPath, session_id: session.id };
  } catch (err: any) {
    if (page && !page.isClosed()) {
      try {
        const errFile = path.join(SCREENSHOTS_DIR, `facebook_error_${Date.now()}.png`);
        await page.screenshot({ path: errFile });
      } catch { /* ignore */ }
    }

    const errMsg = err.message || '';
    let status: 'captcha_blocked' | 'rate_limited' | 'crashed' = 'crashed';
    if (errMsg.includes('captcha') || errMsg.includes('CAPTCHA') || errMsg.includes('checkpoint')) status = 'captcha_blocked';
    if (errMsg.includes('rate limit') || errMsg.includes('429') || errMsg.includes('try again later')) status = 'rate_limited';
    if (errMsg.includes('session expired')) status = 'crashed';

    const errors = Array.isArray(session.errors) ? session.errors : [];
    errors.push({ message: errMsg.slice(0, 500), timestamp: new Date().toISOString(), status });

    await session.update({
      session_status: status,
      health_score: Math.max(0, (Number(session.health_score) || 1) - 0.2),
      errors,
      updated_at: new Date(),
    });

    if (context) await context.close().catch(() => {});
    throw err;
  }
}

/**
 * Comment on an existing Facebook group post.
 * Finds the comment box, types content, and submits.
 */
async function facebookCommentOnPost(page: Page, content: string, config: BrowserPostConfig): Promise<string> {
  // Scroll to see the comment section
  await page.evaluate('window.scrollTo(0, document.body.scrollHeight * 0.6)');
  await randomDelay(1500, 2500);

  // Click on the comment input area to activate it
  const commentBoxOpened = await page.evaluate(`(() => {
    const selectors = [
      '[aria-label="Write a comment"]',
      '[aria-label="Write a comment…"]',
      'div[contenteditable="true"][aria-label*="comment"]',
      'div[contenteditable="true"][aria-label*="Comment"]',
      '[data-testid="UFI2CommentInput"]',
      'form[method="POST"] div[contenteditable="true"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { (el as HTMLElement).click(); (el as HTMLElement).focus(); return true; }
    }
    return false;
  })()`) as boolean;

  if (!commentBoxOpened) {
    // Fallback: try Playwright locator
    try {
      await page.getByPlaceholder(/write a comment/i).first().click({ timeout: 5000 });
    } catch {
      try {
        await page.locator('[contenteditable="true"]').last().click({ timeout: 5000 });
      } catch {
        throw new Error('Could not find Facebook comment box. DOM structure may have changed.');
      }
    }
  }

  await randomDelay(800, 1500);

  // Type the comment with human-like delays
  await page.keyboard.type(content, { delay: 15 + Math.random() * 25 });
  await randomDelay(config.min_delay_ms, config.max_delay_ms);

  // Submit: press Enter (Facebook submits comments on Enter)
  await page.keyboard.press('Enter');
  await randomDelay(3000, 5000);

  // Try to extract comment URL or return the post URL with timestamp
  const currentUrl = page.url();
  return `${currentUrl.split('?')[0]}#comment-${Date.now()}`;
}

/**
 * Create a new post in a Facebook group.
 * Clicks the compose box, types content, and publishes.
 */
async function facebookCreateGroupPost(page: Page, content: string, config: BrowserPostConfig): Promise<string> {
  // Click the "Write something..." compose trigger
  const composerOpened = await page.evaluate(`(() => {
    const selectors = [
      '[aria-label="Write something..."]',
      '[aria-label="Create a public post…"]',
      '[aria-label="Create a post"]',
      '[role="button"] span:has-text("Write something")',
      'div[role="button"][tabindex="0"]',
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) { (el as HTMLElement).click(); return true; }
      } catch {}
    }
    return false;
  })()`) as boolean;

  if (!composerOpened) {
    // Fallback: try Playwright text locator
    try {
      await page.getByText('Write something...').first().click({ timeout: 5000 });
    } catch {
      try {
        await page.getByRole('button', { name: /write something/i }).first().click({ timeout: 5000 });
      } catch {
        throw new Error('Could not find Facebook group compose box. DOM structure may have changed.');
      }
    }
  }

  // Wait for the post composer modal/dialog to appear
  await randomDelay(2000, 3500);

  // Find the composer editor (contenteditable div in the modal)
  const editorFound = await page.evaluate(`(() => {
    const selectors = [
      'div[role="dialog"] div[contenteditable="true"]',
      'form div[contenteditable="true"][aria-label*="post"]',
      'form div[contenteditable="true"][data-lexical-editor="true"]',
      'div[contenteditable="true"][aria-label="Create a public post…"]',
      'div[contenteditable="true"][aria-label="What\\'s on your mind"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { (el as HTMLElement).focus(); return true; }
    }
    // Last resort: find the last contenteditable in any dialog
    const dialogs = document.querySelectorAll('div[role="dialog"] div[contenteditable="true"]');
    if (dialogs.length > 0) { (dialogs[dialogs.length - 1] as HTMLElement).focus(); return true; }
    return false;
  })()`) as boolean;

  if (!editorFound) {
    throw new Error('Could not find Facebook post editor. The compose dialog may not have opened.');
  }

  await randomDelay(500, 1000);

  // Type the post content with human-like delays
  await page.keyboard.type(content, { delay: 15 + Math.random() * 25 });
  await randomDelay(config.min_delay_ms, config.max_delay_ms);

  // Click the "Post" button
  const submitted = await page.evaluate(`(() => {
    const selectors = [
      'div[role="dialog"] div[aria-label="Post"][role="button"]',
      'div[role="dialog"] button[type="submit"]',
      'div[role="dialog"] span:has-text("Post")',
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) { (el as HTMLElement).click(); return true; }
      } catch {}
    }
    return false;
  })()`) as boolean;

  if (!submitted) {
    try {
      await page.getByRole('button', { name: 'Post' }).click({ timeout: 5000 });
    } catch {
      throw new Error('Could not find Facebook Post button. DOM structure may have changed.');
    }
  }

  // Wait for post to be published
  await randomDelay(4000, 6000);

  // Return the group URL with timestamp (extracting exact post URL from FB is unreliable)
  const currentUrl = page.url();
  return `${currentUrl.split('?')[0]}#post-${Date.now()}`;
}

// ── Reddit Browser Strategy ──────────────────────────────────────────────────
// Auth: Cookie-based (reddit_session + optional token_v2) injected into browser
// Mode: Comment on existing Reddit post/thread via old.reddit.com (simpler DOM)
// Uses headless browser (Reddit doesn't block headless like Facebook does)

async function postToRedditBrowser(
  targetUrl: string,
  content: string,
  config: BrowserPostConfig,
): Promise<BrowserPostResult> {
  let session = await OpenclawSession.findOne({
    where: { platform: 'reddit', session_status: ['active', 'idle'] as any },
    order: [['last_activity_at', 'DESC']],
  });
  if (!session) {
    session = await OpenclawSession.create({
      platform: 'reddit',
      session_status: 'active',
      health_score: 1.0,
      pages_visited: 0,
      actions_performed: 0,
      errors: [],
    });
  }

  const profileDir = path.join(BROWSER_PROFILES_DIR, 'reddit');
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    await clearStaleLocks(profileDir);
    await fs.mkdir(profileDir, { recursive: true });

    context = await chromium.launchPersistentContext(profileDir, {
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    // Inject saved Reddit cookies
    try {
      const redditCookies = await getRedditCookiesForBrowser();
      await context.addCookies(redditCookies);
    } catch (err: any) {
      throw new Error(`Reddit cookies not found: ${err.message}. Save your session cookies first.`);
    }

    page = context.pages()[0] || await context.newPage();
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    await session.update({ session_status: 'active', updated_at: new Date() });

    // Use old.reddit.com for simpler, more stable DOM
    const oldRedditUrl = targetUrl.replace('www.reddit.com', 'old.reddit.com').replace('reddit.com', 'old.reddit.com');
    await page.goto(oldRedditUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 4000);

    // Check if authenticated — old Reddit shows username in top-right
    const isLoggedIn = await page.evaluate(`(() => {
      // old.reddit.com: logged-in user shown in span.user
      const userEl = document.querySelector('span.user a');
      if (userEl && userEl.textContent && userEl.textContent !== 'login') return true;
      // new reddit fallback
      const loginBtn = document.querySelector('a[href*="/login"]');
      if (loginBtn && document.querySelector('#USER_DROPDOWN_ID')) return true;
      return false;
    })()`) as boolean;

    if (!isLoggedIn) {
      throw new Error('Reddit session expired. Re-paste your reddit_session cookie from DevTools.');
    }

    console.log('[OpenClaw Browser] Reddit session authenticated, posting comment');

    // Find and click the comment textarea on old.reddit.com
    const commentBoxFound = await page.evaluate(`(() => {
      // Old Reddit: find the comment form textarea
      const textarea = document.querySelector('form.cloneable textarea[name="text"]')
        || document.querySelector('.commentarea textarea[name="text"]')
        || document.querySelector('textarea.c-form-control');
      if (textarea) { (textarea as HTMLElement).click(); (textarea as HTMLElement).focus(); return true; }
      return false;
    })()`) as boolean;

    if (!commentBoxFound) {
      // Fallback: try Playwright locator
      try {
        await page.locator('textarea[name="text"]').first().click({ timeout: 5000 });
      } catch {
        throw new Error('Could not find Reddit comment box. You may need to re-login or the DOM changed.');
      }
    }

    await randomDelay(500, 1000);

    // Type the comment
    await page.keyboard.type(content, { delay: 15 + Math.random() * 25 });
    await randomDelay(config.min_delay_ms, config.max_delay_ms);

    // Click the submit/save button
    const submitted = await page.evaluate(`(() => {
      // Old Reddit: button with text "save" or class "save"
      const btns = document.querySelectorAll('button[type="submit"], .save-form button, button.btn');
      for (const btn of btns) {
        const text = (btn as HTMLElement).textContent?.trim().toLowerCase() || '';
        if (text === 'save' || text === 'comment' || text === 'submit') {
          (btn as HTMLElement).click();
          return true;
        }
      }
      // Direct form submit fallback
      const form = document.querySelector('form.cloneable') || document.querySelector('.commentarea form');
      if (form) {
        const saveBtn = form.querySelector('button[type="submit"]');
        if (saveBtn) { (saveBtn as HTMLElement).click(); return true; }
      }
      return false;
    })()`) as boolean;

    if (!submitted) {
      try {
        await page.getByRole('button', { name: /save|comment|submit/i }).first().click({ timeout: 5000 });
      } catch {
        throw new Error('Could not find Reddit submit button. DOM structure may have changed.');
      }
    }

    // Wait for comment to be posted
    await randomDelay(3000, 5000);

    // Try to get the permalink of the new comment
    const postUrl = page.url();

    console.log(`[OpenClaw Browser] Reddit comment posted on: ${postUrl}`);

    // Screenshot
    let screenshotPath: string | null = null;
    if (config.screenshot_on_post) {
      const filename = `reddit_${Date.now()}.png`;
      screenshotPath = path.join(SCREENSHOTS_DIR, filename);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    await session.update({
      session_status: 'idle',
      last_activity_at: new Date(),
      pages_visited: (session.pages_visited || 0) + 1,
      actions_performed: (session.actions_performed || 0) + 1,
      screenshot_path: screenshotPath || session.screenshot_path,
      updated_at: new Date(),
    });

    await context.close();
    return { post_url: `${postUrl}#comment-${Date.now()}`, screenshot_path: screenshotPath, session_id: session.id };
  } catch (err: any) {
    if (page && !page.isClosed()) {
      try {
        const errFile = path.join(SCREENSHOTS_DIR, `reddit_error_${Date.now()}.png`);
        await page.screenshot({ path: errFile });
      } catch { /* ignore */ }
    }

    const errMsg = err.message || '';
    let status: 'captcha_blocked' | 'rate_limited' | 'crashed' = 'crashed';
    if (errMsg.includes('captcha') || errMsg.includes('CAPTCHA')) status = 'captcha_blocked';
    if (errMsg.includes('rate limit') || errMsg.includes('429') || errMsg.includes('try again later')) status = 'rate_limited';
    if (errMsg.includes('session expired')) status = 'crashed';

    const errors = Array.isArray(session.errors) ? session.errors : [];
    errors.push({ message: errMsg.slice(0, 500), timestamp: new Date().toISOString(), status });

    await session.update({
      session_status: status,
      health_score: Math.max(0, (Number(session.health_score) || 1) - 0.2),
      errors,
      updated_at: new Date(),
    });

    if (context) await context.close().catch(() => {});
    throw err;
  }
}
