import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const FACEBOOK_COOKIES_FILE = '/data/browser-profiles/facebook-cookies.json';

export interface FacebookCookies {
  c_user: string;
  xs: string;
  datr?: string;
}

export interface FacebookGroup {
  id: string;
  name: string;
  url: string;
  member_count: string | null;
}

// ── Cookie Management ────────────────────────────────────────────────────────

export async function saveFacebookCookies(c_user: string, xs: string, datr?: string): Promise<void> {
  const cookies = [
    { name: 'c_user', value: c_user, domain: '.facebook.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' as const },
    { name: 'xs', value: xs, domain: '.facebook.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' as const },
  ];
  if (datr) {
    cookies.push({ name: 'datr', value: datr, domain: '.facebook.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' as const });
  }

  const dir = path.dirname(FACEBOOK_COOKIES_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(FACEBOOK_COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

export async function getFacebookCookies(): Promise<FacebookCookies> {
  const raw = await fs.readFile(FACEBOOK_COOKIES_FILE, 'utf-8');
  const cookies = JSON.parse(raw);
  const cUser = cookies.find((c: any) => c.name === 'c_user');
  const xs = cookies.find((c: any) => c.name === 'xs');
  if (!cUser?.value || !xs?.value) {
    throw new Error('No Facebook cookies found. Save your Facebook session first.');
  }
  const datr = cookies.find((c: any) => c.name === 'datr');
  return { c_user: cUser.value, xs: xs.value, datr: datr?.value };
}

/**
 * Get cookies formatted for Playwright browser context injection.
 */
export async function getFacebookCookiesForBrowser(): Promise<Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: 'None' }>> {
  const raw = await fs.readFile(FACEBOOK_COOKIES_FILE, 'utf-8');
  return JSON.parse(raw);
}

function buildCookieHeader(cookies: FacebookCookies): string {
  let header = `c_user=${cookies.c_user}; xs=${cookies.xs}`;
  if (cookies.datr) header += `; datr=${cookies.datr}`;
  return header;
}

// ── Session Validation ───────────────────────────────────────────────────────

export async function checkFacebookSession(): Promise<{ authenticated: boolean; message: string }> {
  try {
    const cookies = await getFacebookCookies();
    const resp = await axios.get('https://m.facebook.com/me', {
      headers: {
        Cookie: buildCookieHeader(cookies),
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      maxRedirects: 0,
      validateStatus: (s) => s < 400,
      timeout: 10000,
    });

    // If we get redirected to login, session is invalid
    const location = resp.headers.location || '';
    if (location.includes('/login') || location.includes('checkpoint')) {
      return { authenticated: false, message: 'Facebook session expired or blocked. Re-paste your cookies.' };
    }

    // Check if response contains user profile indicators
    const html = typeof resp.data === 'string' ? resp.data : '';
    if (html.includes('c_user') || html.includes('/me') || resp.status === 200) {
      return { authenticated: true, message: 'Facebook session is active.' };
    }

    return { authenticated: false, message: 'Could not verify Facebook session. Try re-pasting cookies.' };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { authenticated: false, message: 'No Facebook cookies saved. Paste your c_user and xs cookies.' };
    }
    return { authenticated: false, message: `Session check failed: ${err.message}` };
  }
}

// ── Group Listing ────────────────────────────────────────────────────────────

export async function listFacebookGroups(): Promise<FacebookGroup[]> {
  const cookies = await getFacebookCookies();

  // Use mobile Facebook to get a lighter HTML page
  const resp = await axios.get('https://m.facebook.com/groups/?category=membership', {
    headers: {
      Cookie: buildCookieHeader(cookies),
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15000,
  });

  const $ = cheerio.load(resp.data);
  const groups: FacebookGroup[] = [];

  // Mobile Facebook group list: links matching /groups/{id}/
  $('a[href*="/groups/"]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/groups\/(\d+)\//);
    if (!match) return;

    const id = match[1];
    // Skip duplicates
    if (groups.some((g) => g.id === id)) return;

    // Group name is usually the link text or a nearby heading
    const name = $(el).text().trim() || $(el).find('span').first().text().trim();
    if (!name || name.length < 2) return;

    // Try to find member count near the group entry
    const parent = $(el).closest('div');
    const memberText = parent.text().match(/([\d,.]+[KkMm]?)\s*members?/i);

    groups.push({
      id,
      name,
      url: `https://www.facebook.com/groups/${id}/`,
      member_count: memberText ? memberText[1] : null,
    });
  });

  return groups;
}

// ── Configured Groups Storage ────────────────────────────────────────────────

const FB_GROUPS_CONFIG_FILE = '/data/browser-profiles/facebook-groups-config.json';

export interface FacebookGroupConfig {
  target_groups: Array<{ id: string; name: string; url: string }>;
  enabled: boolean;
}

export async function getConfiguredGroups(): Promise<FacebookGroupConfig> {
  try {
    const raw = await fs.readFile(FB_GROUPS_CONFIG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { target_groups: [], enabled: false };
  }
}

export async function saveConfiguredGroups(config: FacebookGroupConfig): Promise<void> {
  const dir = path.dirname(FB_GROUPS_CONFIG_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(FB_GROUPS_CONFIG_FILE, JSON.stringify(config, null, 2));
}
