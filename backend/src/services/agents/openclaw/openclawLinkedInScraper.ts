import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import fs from 'fs/promises';

const LINKEDIN_COOKIES_FILE = '/data/browser-profiles/linkedin-cookies.json';

// ── Interfaces ───────────────────────────────────────────────────────────────

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

export interface LinkedInLoginResult {
  success: boolean;
  message: string;
  needs_verification?: boolean;
}

// ── Cookie Helpers ───────────────────────────────────────────────────────────

async function getLinkedInCookies(): Promise<{ li_at: string; jsessionid: string }> {
  const raw = await fs.readFile(LINKEDIN_COOKIES_FILE, 'utf-8');
  const cookies = JSON.parse(raw);
  const liAt = cookies.find((c: any) => c.name === 'li_at');
  const jsession = cookies.find((c: any) => c.name === 'JSESSIONID');
  if (!liAt?.value) throw new Error('No li_at cookie found. Save your LinkedIn session first.');
  return { li_at: liAt.value, jsessionid: jsession?.value || '' };
}

/**
 * Auto-fetch JSESSIONID from LinkedIn if not already saved.
 * The Voyager API requires it as a CSRF token.
 */
async function ensureJsessionId(li_at: string): Promise<string> {
  try {
    const { jsessionid } = await getLinkedInCookies();
    if (jsessionid) return jsessionid;
  } catch { /* no cookies file yet */ }

  try {
    const res = await axios.get('https://www.linkedin.com/', {
      headers: {
        'Cookie': `li_at=${li_at}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      maxRedirects: 3,
      timeout: 10000,
      validateStatus: () => true,
    });

    const setCookie = res.headers['set-cookie'] || [];
    for (const cookie of setCookie) {
      const match = cookie.match(/JSESSIONID="?([^";]+)"?/);
      if (match) {
        const jsessionid = match[1];
        // Save it alongside existing cookies
        try {
          const raw = await fs.readFile(LINKEDIN_COOKIES_FILE, 'utf-8');
          const cookies = JSON.parse(raw);
          const existing = cookies.findIndex((c: any) => c.name === 'JSESSIONID');
          const entry = { name: 'JSESSIONID', value: jsessionid, domain: '.linkedin.com', path: '/', httpOnly: false, secure: true, sameSite: 'None' };
          if (existing >= 0) cookies[existing] = entry;
          else cookies.push(entry);
          await fs.writeFile(LINKEDIN_COOKIES_FILE, JSON.stringify(cookies, null, 2));
        } catch { /* ignore save failure */ }
        return jsessionid;
      }
    }
  } catch (err: any) {
    console.warn(`[LinkedIn] Failed to auto-fetch JSESSIONID: ${err.message?.slice(0, 100)}`);
  }

  return '';
}

// ── URL Parsing ──────────────────────────────────────────────────────────────

function extractActivityId(postUrl: string): string | null {
  // LinkedIn post URLs contain activity IDs in these formats:
  // https://www.linkedin.com/feed/update/urn:li:activity:7312345678901234567/
  // https://www.linkedin.com/posts/username_slug-activity-7312345678901234567-xxxx
  // https://www.linkedin.com/posts/username_slug-share-7312345678901234567-xxxx
  const match = postUrl.match(/(?:activity|share)[:-](\d{19,20})/);
  return match ? match[1] : null;
}

// ── Voyager API Helpers ──────────────────────────────────────────────────────

function buildVoyagerHeaders(li_at: string, jsessionid: string): Record<string, string> {
  const csrfToken = jsessionid.replace(/"/g, '');
  return {
    'Cookie': `li_at=${li_at}; JSESSIONID="${csrfToken}"`,
    'Csrf-Token': csrfToken,
    'X-Restli-Protocol-Version': '2.0.0',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/vnd.linkedin.normalized+json+2.1',
  };
}

function extractPostText(data: any): string {
  const included = data.included || [];
  for (const item of included) {
    if (item.commentary?.text?.text) return item.commentary.text.text;
    if (item.text?.text && item.text.text.length > 50) return item.text.text;
  }
  if (data.data?.commentary?.text?.text) return data.data.commentary.text.text;
  return '';
}

function extractAuthorName(data: any): string {
  const included = data.included || [];
  for (const item of included) {
    if (item.firstName && item.lastName) {
      return `${item.firstName} ${item.lastName}`.trim();
    }
  }
  return '';
}

async function fetchVoyagerComments(
  activityId: string, headers: Record<string, string>,
): Promise<LinkedInComment[]> {
  const comments: LinkedInComment[] = [];

  // Try both activity and ugPost URN formats
  const urns = [
    `urn:li:activity:${activityId}`,
    `urn:li:ugPost:${activityId}`,
  ];

  for (const updateUrn of urns) {
    try {
      const res = await axios.get('https://www.linkedin.com/voyager/api/feed/comments', {
        headers,
        timeout: 15000,
        params: { q: 'comments', updateId: updateUrn, count: 50, start: 0 },
      });

      const included = res.data?.included || [];
      const elements = res.data?.data?.elements || res.data?.elements || [];

      if (elements.length === 0) continue;

      // Build profile lookup from included entities
      const profiles: Record<string, { name: string; title: string }> = {};
      for (const item of included) {
        if (item.firstName || item.lastName) {
          const urn = item.entityUrn || item['*miniProfile'] || item.$id || '';
          profiles[urn] = {
            name: `${item.firstName || ''} ${item.lastName || ''}`.trim(),
            title: item.occupation || item.headline || '',
          };
        }
      }

      for (const el of elements) {
        // Extract comment text from various voyager response formats
        let text = '';
        if (el.comment?.values?.[0]?.value) {
          text = el.comment.values[0].value;
        } else if (el.commentV2?.text) {
          text = el.commentV2.text;
        } else if (el.message?.text) {
          text = el.message.text;
        }

        // Find commenter profile
        const commenterUrn = el.commenter || el.commenterForDashConversion ||
          el['*commenter'] || el.actor || '';
        let profile = profiles[commenterUrn];

        // Try to find profile by scanning included for matching URN fragments
        if (!profile && commenterUrn) {
          const urnSuffix = commenterUrn.split(':').pop() || '';
          for (const [key, val] of Object.entries(profiles)) {
            if (key.includes(urnSuffix)) { profile = val; break; }
          }
        }

        if (text) {
          comments.push({
            commenter_name: profile?.name || 'Unknown',
            commenter_title: profile?.title || '',
            comment_text: text,
          });
        }
      }

      if (comments.length > 0) break; // found comments with this URN format
    } catch (err: any) {
      console.warn(`[LinkedIn] Voyager comments failed for ${updateUrn}: ${err.message?.slice(0, 100)}`);
    }
  }

  return comments;
}

async function scrapeViaVoyagerApi(
  activityId: string, li_at: string, jsessionid: string,
): Promise<LinkedInPostData> {
  const headers = buildVoyagerHeaders(li_at, jsessionid);
  const activityUrn = `urn:li:activity:${activityId}`;

  // Fetch post content
  let post_content = '';
  let post_author = '';
  try {
    const postRes = await axios.get(
      `https://www.linkedin.com/voyager/api/feed/updates/${encodeURIComponent(activityUrn)}`,
      { headers, timeout: 15000 },
    );
    post_content = extractPostText(postRes.data);
    post_author = extractAuthorName(postRes.data);
  } catch (err: any) {
    console.warn(`[LinkedIn] Voyager post fetch failed: ${err.message?.slice(0, 100)}`);
  }

  // Fetch comments
  const comments = await fetchVoyagerComments(activityId, headers);

  return { post_content, post_author, comments };
}

// ── HTML Fallback Scraper ────────────────────────────────────────────────────

async function scrapeLinkedInPostViaHtml(
  postUrl: string, li_at: string,
): Promise<LinkedInPostData> {
  const res = await axios.get(postUrl, {
    headers: {
      'Cookie': `li_at=${li_at}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15000,
    maxRedirects: 3,
    validateStatus: (status) => status < 400,
  });

  const $ = cheerio.load(res.data);

  let post_content = '';
  let post_author = '';

  // Try JSON-LD first (most reliable if present)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).html() || '');
      if (ld.articleBody && !post_content) post_content = ld.articleBody;
      if (ld.author?.name && !post_author) post_author = ld.author.name;
    } catch { /* not valid JSON-LD */ }
  });

  // Fallback to meta tags
  if (!post_content) {
    post_content = $('meta[property="og:description"]').attr('content') || '';
  }
  if (!post_author) {
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    post_author = ogTitle.split(' on LinkedIn')[0] || '';
  }

  // Comments are not in SSR HTML (LinkedIn loads them client-side)
  return { post_content, post_author, comments: [] };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a LinkedIn post and its comments using HTTP requests.
 * Primary: LinkedIn Voyager API (structured JSON).
 * Fallback: HTML scrape with cheerio (post content only, no comments).
 */
export async function scrapeLinkedInPost(postUrl: string): Promise<LinkedInPostData> {
  const { li_at } = await getLinkedInCookies();
  const jsessionid = await ensureJsessionId(li_at);
  const activityId = extractActivityId(postUrl);

  if (!activityId) {
    console.warn(`[LinkedIn] Could not extract activity ID from URL, falling back to HTML scrape`);
    return scrapeLinkedInPostViaHtml(postUrl, li_at);
  }

  if (!jsessionid) {
    console.warn(`[LinkedIn] No JSESSIONID available for Voyager API, falling back to HTML scrape`);
    return scrapeLinkedInPostViaHtml(postUrl, li_at);
  }

  try {
    const result = await scrapeViaVoyagerApi(activityId, li_at, jsessionid);
    console.log(`[LinkedIn] Voyager API: post=${result.post_content.length} chars, comments=${result.comments.length}`);
    return result;
  } catch (err: any) {
    console.warn(`[LinkedIn] Voyager API failed (${err.message?.slice(0, 100)}), falling back to HTML`);
    return scrapeLinkedInPostViaHtml(postUrl, li_at);
  }
}

/**
 * Save LinkedIn session cookies to JSON file.
 * User provides li_at (and optionally JSESSIONID) from their browser DevTools.
 */
export async function saveLinkedInCookies(li_at: string, jsessionId?: string): Promise<void> {
  const dir = path.dirname(LINKEDIN_COOKIES_FILE);
  await fs.mkdir(dir, { recursive: true });

  const cookies: Array<Record<string, any>> = [
    { name: 'li_at', value: li_at, domain: '.linkedin.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' },
  ];
  if (jsessionId) {
    cookies.push({ name: 'JSESSIONID', value: jsessionId, domain: '.linkedin.com', path: '/', httpOnly: false, secure: true, sameSite: 'None' });
  }

  await fs.writeFile(LINKEDIN_COOKIES_FILE, JSON.stringify(cookies, null, 2));
  console.log(`[LinkedIn] Saved ${cookies.length} cookies to ${LINKEDIN_COOKIES_FILE}`);
}

/**
 * Check if LinkedIn session cookies exist and are likely valid.
 * Reads from JSON cookie store (no browser launch needed).
 */
export async function checkLinkedInSession(): Promise<{ authenticated: boolean; message: string }> {
  try {
    const raw = await fs.readFile(LINKEDIN_COOKIES_FILE, 'utf-8');
    const cookies = JSON.parse(raw);
    const liAt = cookies.find((c: any) => c.name === 'li_at');
    if (!liAt || !liAt.value) {
      return { authenticated: false, message: 'No li_at cookie found. Save your cookie first.' };
    }
    return { authenticated: true, message: `Session active. Cookie saved (${liAt.value.length} chars).` };
  } catch {
    return { authenticated: false, message: 'No LinkedIn session saved. Save your li_at cookie first.' };
  }
}
