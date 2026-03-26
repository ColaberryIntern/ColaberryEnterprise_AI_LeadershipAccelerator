/// <reference lib="dom" />
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs/promises';

const BROWSER_PROFILES_DIR = '/data/browser-profiles';

export interface LinkedInComment {
  commenter_name: string;
  commenter_title: string;
  comment_text: string;
}

export interface LinkedInPostData {
  post_content: string;
  post_author: string;
  comments: LinkedInComment[];
}

/**
 * Scrape a LinkedIn post and its comments using headless Playwright.
 * Uses persistent browser profile at /data/browser-profiles/linkedin/ for authenticated access.
 * Read-only - no interactions beyond viewing the page.
 */
export async function scrapeLinkedInPost(postUrl: string): Promise<LinkedInPostData> {
  const profileDir = path.join(BROWSER_PROFILES_DIR, 'linkedin');

  // Ensure profile directory exists
  await fs.mkdir(profileDir, { recursive: true });

  // Use persistent context to reuse LinkedIn session cookies
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = await context.newPage();

  try {
    await page.goto(postUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for dynamic content to render
    await page.waitForTimeout(3000);

    // Extract post + comments using page.evaluate for maximum flexibility
    const data = await page.evaluate(() => {
      // --- Post content extraction ---
      const postSelectors = [
        '.feed-shared-update-v2__description',
        '.update-components-text',
        '[data-test-id="main-feed-activity-content"]',
        '.break-words',
        'article .feed-shared-text',
      ];

      let postContent = '';
      for (const sel of postSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 50) {
          postContent = el.textContent.trim();
          break;
        }
      }

      // Fallback: grab the largest text block on the page
      if (!postContent) {
        const allText = Array.from(document.querySelectorAll('span, p, div'))
          .map(el => ({ el, len: (el.textContent || '').trim().length }))
          .filter(x => x.len > 100)
          .sort((a, b) => b.len - a.len);
        if (allText.length > 0) {
          postContent = allText[0].el.textContent?.trim() || '';
        }
      }

      // --- Post author ---
      const authorSelectors = [
        '.feed-shared-actor__name',
        '.update-components-actor__name',
        '[data-test-id="main-feed-activity-card__entity-lockup"] span',
      ];
      let postAuthor = '';
      for (const sel of authorSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 2) {
          postAuthor = el.textContent.trim();
          break;
        }
      }

      // --- Comments extraction ---
      const commentSelectors = [
        '.comments-comment-item',
        '.comments-comment-entity',
        '[data-test-id="comments-comment-item"]',
      ];

      const comments: Array<{ commenter_name: string; commenter_title: string; comment_text: string }> = [];

      for (const containerSel of commentSelectors) {
        const commentEls = document.querySelectorAll(containerSel);
        if (commentEls.length === 0) continue;

        commentEls.forEach(commentEl => {
          // Name
          const nameSelectors = [
            '.comments-post-meta__name-text',
            '.comments-comment-item__post-meta .hoverable-link-text',
            '.comment-entity-name',
            'a[data-test-id="comment-entity-name"]',
          ];
          let name = '';
          for (const ns of nameSelectors) {
            const nel = commentEl.querySelector(ns);
            if (nel && nel.textContent) { name = nel.textContent.trim(); break; }
          }

          // Title/headline
          const titleSelectors = [
            '.comments-post-meta__headline',
            '.comments-comment-item__post-meta .comments-post-meta__headline',
            '.comment-entity-headline',
          ];
          let title = '';
          for (const ts of titleSelectors) {
            const tel = commentEl.querySelector(ts);
            if (tel && tel.textContent) { title = tel.textContent.trim(); break; }
          }

          // Comment text
          const textSelectors = [
            '.comments-comment-item__main-content',
            '.comments-comment-texteditor .update-components-text',
            '.comment-entity-body',
            'span.break-words',
          ];
          let text = '';
          for (const cs of textSelectors) {
            const cel = commentEl.querySelector(cs);
            if (cel && cel.textContent && cel.textContent.trim().length > 5) {
              text = cel.textContent.trim();
              break;
            }
          }

          if (name && text) {
            comments.push({ commenter_name: name, commenter_title: title, comment_text: text });
          }
        });

        if (comments.length > 0) break; // found comments with this selector set
      }

      return { post_content: postContent, post_author: postAuthor, comments };
    });

    // If Playwright couldn't find structured comments, try a text-based fallback
    if (data.comments.length === 0 && data.post_content) {
      const fullText = await page.evaluate(() => document.body.innerText);
      data.post_content = fullText.slice(0, 8000);
      (data as any).raw_text_fallback = true;
    }

    return data;
  } finally {
    await context.close(); // saves cookies back to profileDir
  }
}

/**
 * Save LinkedIn session cookies to the persistent browser profile.
 * User provides li_at (and optionally JSESSIONID) from their browser DevTools.
 */
export async function saveLinkedInCookies(li_at: string, jsessionId?: string): Promise<void> {
  const profileDir = path.join(BROWSER_PROFILES_DIR, 'linkedin');
  await fs.mkdir(profileDir, { recursive: true });

  // Launch a headless persistent context, inject cookies, then close to save
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const cookies = [
    { name: 'li_at', value: li_at, domain: '.linkedin.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' as const },
  ];
  if (jsessionId) {
    cookies.push({ name: 'JSESSIONID', value: jsessionId, domain: '.linkedin.com', path: '/', httpOnly: false, secure: true, sameSite: 'None' as const });
  }

  await context.addCookies(cookies);

  // Navigate to LinkedIn to verify the session and let the browser save state
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);
  await context.close(); // saves cookies to profileDir
}

/**
 * Check if LinkedIn session cookies exist and are likely valid.
 */
export async function checkLinkedInSession(): Promise<{ authenticated: boolean; message: string }> {
  const profileDir = path.join(BROWSER_PROFILES_DIR, 'linkedin');
  try {
    await fs.access(profileDir);
  } catch {
    return { authenticated: false, message: 'No LinkedIn browser profile found. Save your li_at cookie first.' };
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const cookies = await context.cookies('https://www.linkedin.com');
    const liAt = cookies.find(c => c.name === 'li_at');
    if (!liAt || !liAt.value) {
      return { authenticated: false, message: 'No li_at cookie found in profile. Save your cookie first.' };
    }
    return { authenticated: true, message: `Session active. li_at cookie expires: ${liAt.expires > 0 ? new Date(liAt.expires * 1000).toISOString() : 'session'}` };
  } finally {
    await context.close();
  }
}
