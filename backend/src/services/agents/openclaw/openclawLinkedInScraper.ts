import { chromium } from 'playwright';

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
 * Scrape a public LinkedIn post and its comments using headless Playwright.
 * Read-only - no login, no interactions, just viewing a public page.
 */
export async function scrapeLinkedInPost(postUrl: string): Promise<LinkedInPostData> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  try {
    await page.goto(postUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait a bit for dynamic content to render
    await page.waitForTimeout(3000);

    // Extract post + comments using page.evaluate for maximum flexibility
    const data = await page.evaluate(() => {
      // --- Post content extraction ---
      // LinkedIn uses various selectors depending on the page type
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
    // by grabbing the full page text and letting the caller (LLM) parse it
    if (data.comments.length === 0 && data.post_content) {
      // Get full visible text as fallback for LLM parsing
      const fullText = await page.evaluate(() => document.body.innerText);
      data.post_content = fullText.slice(0, 8000); // cap for LLM context
      // Mark that we're returning raw text, not structured comments
      (data as any).raw_text_fallback = true;
    }

    return data;
  } finally {
    await browser.close();
  }
}
