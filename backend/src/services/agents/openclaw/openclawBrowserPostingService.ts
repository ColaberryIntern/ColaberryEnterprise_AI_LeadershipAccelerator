import { chromium, type BrowserContext, type Page } from 'playwright';
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

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Check which platforms support browser-based posting.
 */
export function hasBrowserSupport(platform: string): boolean {
  return ['devto', 'medium'].includes(platform);
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
