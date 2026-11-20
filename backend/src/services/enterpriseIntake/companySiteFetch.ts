/**
 * companySiteFetch - read a prospect's public website, safely (W30, Phase 3 research).
 *
 * The URL comes from a public form, so it is attacker-controlled. The rules:
 *   - http/https only, standard ports only, no credentials in the URL;
 *   - every address the name resolves to must be public. The check runs in the socket's own
 *     DNS lookup, so the address checked IS the address connected to (no DNS-rebinding gap);
 *   - redirects are followed by hand, at most 3, and each hop is checked again;
 *   - a hard timeout and a size cap; HTML and plain text only.
 * Anything else returns null. The research step treats "no site" as "no site", never an error.
 */
import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import * as cheerio from 'cheerio';

const MAX_BYTES = 600_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

/** True for any address that is not on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith('64:ff9b:') || v.startsWith('2001:db8');
  }
  return true;
}

/** The form's free text ("acme.com", "https://www.acme.com/about") as a URL we may fetch, or null. */
export function normalizeSiteUrl(raw: string): URL | null {
  const s = String(raw || '').trim();
  if (!s || /\s/.test(s)) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !net.isIP(host)) return null;
  if (net.isIP(host) && isPrivateAddress(host)) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp)$/i.test(host)) return null;
  return u;
}

/** A lookup that refuses private addresses: the check and the connection see the same IP. */
export const publicLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...(options as dns.LookupOptions), all: true }, (err, addresses) => {
    if (err) return (callback as any)(err);
    const list = (addresses as dns.LookupAddress[]) || [];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (!list.length || bad) {
      const e: NodeJS.ErrnoException = new Error(`refused non-public address for ${hostname}`);
      e.code = 'EPRIVATEADDR';
      return (callback as any)(e);
    }
    if ((options as dns.LookupOptions)?.all) return (callback as any)(null, list);
    return (callback as any)(null, list[0].address, list[0].family);
  });
};

interface Got { status: number; location?: string; type: string; body: string }

function getOnce(u: URL): Promise<Got> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(
      u,
      {
        lookup: publicLookup,
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ColaberryResearch/1.0)', Accept: 'text/html,text/plain' },
      },
      (res) => {
        const status = res.statusCode || 0;
        const type = String(res.headers['content-type'] || '');
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: String(res.headers.location || ''), type, body: '' });
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            res.destroy();
            return resolve({ status, type, body: Buffer.concat(chunks).toString('utf8') });
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, type, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

export interface SitePage {
  url: string;
  title: string;
  description: string;
  text: string;
}

/** Visible text of an HTML page, without scripts, styles and navigation chrome. */
export function pageText(html: string): { title: string; description: string; text: string } {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, iframe, nav, footer, form').remove();
  const title = $('title').first().text().trim().slice(0, 200);
  const description = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '')
    .trim()
    .slice(0, 500);
  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000);
  return { title, description, text };
}

/** Fetch one public page as text, or null. Never throws. */
export async function fetchCompanyPage(raw: string): Promise<SitePage | null> {
  const first = normalizeSiteUrl(raw);
  if (!first) return null;
  let u: URL = first;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const got = await getOnce(u);
      if (got.location !== undefined) {
        const next: URL | null = got.location ? normalizeSiteUrl(new URL(got.location, u).toString()) : null;
        if (!next) return null;
        u = next;
        continue;
      }
      if (got.status < 200 || got.status >= 300) return null;
      if (got.type && !/text\/html|text\/plain|application\/xhtml/i.test(got.type)) return null;
      const page = /html/i.test(got.type) || /<html|<body/i.test(got.body) ? pageText(got.body) : { title: '', description: '', text: got.body.replace(/\s+/g, ' ').slice(0, 6000) };
      return { url: u.toString(), ...page };
    }
    return null;
  } catch {
    return null;
  }
}
