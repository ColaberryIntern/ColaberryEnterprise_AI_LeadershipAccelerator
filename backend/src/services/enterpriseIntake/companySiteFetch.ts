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
/** The most one website read may take, all hops included. */
const TOTAL_DEADLINE_MS = 15_000;

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
    // An ALLOWLIST, by value, not a list of bad spellings: IPv6 has too many ways to embed an
    // IPv4 address (::ffff:7f00:1, ::7f00:1, ::ffff:0:..., 64:ff9b::, 2002::) for patterns to
    // keep up. Only global unicast (2000::/3) passes, minus the ranges that tunnel or document.
    const h = ipv6Hextets(ip);
    if (!h) return true;
    if ((h[0] & 0xe000) !== 0x2000) return true; // not global unicast: ::, ::1, mapped, fc00, fe80, fec0, ff00...
    if (h[0] === 0x2002) return true; // 6to4 carries an IPv4 address
    if (h[0] === 0x2001 && (h[1] === 0x0000 || h[1] === 0x0db8)) return true; // Teredo, documentation
    return false;
  }
  return true;
}

/** The eight 16-bit groups of an IPv6 address, or null if it does not parse. */
export function ipv6Hextets(ip: string): number[] | null {
  let v = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const v4 = v.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    v = v.slice(0, v4.index) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = v.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
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
  // A company website is a NAME. No address literal is accepted at all, in any notation
  // (127.0.0.1, 2130706433, 0x7f.1 and [::ffff:7f00:1] all reach here as IP literals), so
  // every host goes through the DNS check in publicLookup.
  if (net.isIP(host)) return null;
  if (!host.includes('.')) return null;
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

function getOnce(u: URL, deadline: number): Promise<Got> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    // A hard stop for the whole request. `timeout` below is only an idle timeout, so a server
    // dripping a byte every few seconds would otherwise hold the sweep for minutes.
    const left = deadline - Date.now();
    if (left <= 0) return reject(new Error('deadline'));
    const stop = setTimeout(() => req.destroy(new Error('deadline')), left);
    const req = lib.get(
      u,
      {
        lookup: publicLookup,
        // A fresh socket every time. A pooled keep-alive socket skips `lookup`, so it could
        // carry this request to an address the check never saw (Phase 3 review, attempt 2).
        agent: false,
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
    req.on('close', () => clearTimeout(stop));
  });
}

/** Where a redirect may go: the same rules as the first URL, every hop. */
export function nextHop(location: string, from: URL): URL | null {
  if (!location) return null;
  try {
    return normalizeSiteUrl(new URL(location, from).toString());
  } catch {
    return null;
  }
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
  const deadline = Date.now() + TOTAL_DEADLINE_MS;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const got = await getOnce(u, deadline);
      if (got.location !== undefined) {
        const next = nextHop(got.location, u);
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
