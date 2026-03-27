import fs from 'fs/promises';
import path from 'path';

const REDDIT_COOKIES_FILE = '/data/browser-profiles/reddit-cookies.json';

export interface RedditCookies {
  reddit_session: string;
  token_v2?: string;
}

// ── Cookie Management ────────────────────────────────────────────────────────

/**
 * Save Reddit session cookies for browser-based posting.
 * Users paste these from DevTools → Application → Cookies → reddit.com
 * Key cookie: `reddit_session` (the main auth cookie)
 * Optional: `token_v2` (newer auth token used on new Reddit)
 */
export async function saveRedditCookies(reddit_session: string, token_v2?: string): Promise<void> {
  const cookies = [
    { name: 'reddit_session', value: reddit_session, domain: '.reddit.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' as const },
  ];
  if (token_v2) {
    cookies.push({ name: 'token_v2', value: token_v2, domain: '.reddit.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' as const });
  }

  const dir = path.dirname(REDDIT_COOKIES_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(REDDIT_COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

export async function getRedditCookies(): Promise<RedditCookies> {
  const raw = await fs.readFile(REDDIT_COOKIES_FILE, 'utf-8');
  const cookies = JSON.parse(raw);
  const session = cookies.find((c: any) => c.name === 'reddit_session');
  if (!session?.value) {
    throw new Error('No Reddit cookies found. Save your Reddit session first.');
  }
  const tokenV2 = cookies.find((c: any) => c.name === 'token_v2');
  return { reddit_session: session.value, token_v2: tokenV2?.value };
}

/**
 * Get cookies formatted for Playwright browser context injection.
 */
export async function getRedditCookiesForBrowser(): Promise<Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: 'None' }>> {
  const raw = await fs.readFile(REDDIT_COOKIES_FILE, 'utf-8');
  return JSON.parse(raw);
}

// ── Session Validation ───────────────────────────────────────────────────────

export async function checkRedditSession(): Promise<{ authenticated: boolean; username: string; message: string }> {
  try {
    const cookies = await getRedditCookies();
    // Validate cookie format — actual auth verified on first browser post
    if (cookies.reddit_session.length < 20) {
      return { authenticated: false, username: '', message: 'Invalid reddit_session cookie — looks too short. Copy the full value from DevTools.' };
    }
    return { authenticated: true, username: '', message: 'Reddit session cookies saved. Auth will be verified on first browser post.' };
  } catch (err: any) {
    if (err.code === 'ENOENT' || err.message?.includes('No Reddit cookies')) {
      return { authenticated: false, username: '', message: 'No Reddit cookies saved. Paste your reddit_session cookie.' };
    }
    return { authenticated: false, username: '', message: `Session check failed: ${err.message}` };
  }
}
