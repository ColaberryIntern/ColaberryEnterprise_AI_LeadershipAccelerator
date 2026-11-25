import http from 'http';
import https from 'https';
import { nextHop, normalizeSiteUrl, publicLookup } from '../../enterpriseIntake/companySiteFetch';

/**
 * Fetch one public news page as raw HTML (WL3.1). The URL comes from AI search results, so it is
 * untrusted: it goes through the same guards as companySiteFetch (names only, public addresses only,
 * checked in the socket's own lookup, every redirect re-checked). One attempt per URL; the caller
 * tries one alternate outlet. 15 s in total, 2 MB, HTML only. Never throws: a failure is a reason.
 */
export type PageResult = { ok: true; url: string; html: string } | { ok: false; url: string; reason: string };
export type FetchPage = (url: string) => Promise<PageResult>;

const MAX_BYTES = 2_000_000;
const DEADLINE_MS = 15_000;
const MAX_REDIRECTS = 3;

interface Got { status: number; location: string; type: string; body: string; }

function getOnce(u: URL, deadline: number): Promise<Got> {
  return new Promise((resolve, reject) => {
    const left = deadline - Date.now();
    if (left <= 0) { reject(new Error('timeout')); return; }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, {
      lookup: publicLookup,
      agent: false, // a pooled socket would skip the address check
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ColaberryResearch/1.0)', Accept: 'text/html,application/xhtml+xml' },
    }, (res) => {
      const base = { status: res.statusCode || 0, type: String(res.headers['content-type'] || '') };
      if (base.status >= 300 && base.status < 400) { res.resume(); resolve({ ...base, location: String(res.headers.location || ''), body: '' }); return; }
      const chunks: Buffer[] = []; let size = 0;
      const done = () => resolve({ ...base, location: '', body: Buffer.concat(chunks).toString('utf8') });
      res.on('data', (c: Buffer) => { chunks.push(c); size += c.length; if (size > MAX_BYTES) { res.destroy(); done(); } });
      res.on('end', done);
      res.on('error', reject);
    });
    const stop = setTimeout(() => req.destroy(new Error('timeout')), left);
    req.on('error', reject);
    req.on('close', () => clearTimeout(stop));
  });
}

export const fetchPage: FetchPage = async (raw) => {
  let u = normalizeSiteUrl(raw);
  if (!u) return { ok: false, url: raw, reason: 'not a public web address' };
  const deadline = Date.now() + DEADLINE_MS;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const got = await getOnce(u, deadline);
      if (got.status >= 300 && got.status < 400) {
        const next = nextHop(got.location, u);
        if (!next) return { ok: false, url: u.toString(), reason: 'redirect refused' };
        u = next;
        continue;
      }
      if (got.status !== 200) return { ok: false, url: u.toString(), reason: `HTTP ${got.status}` };
      if (!/html/i.test(got.type)) return { ok: false, url: u.toString(), reason: 'not an HTML page' };
      return { ok: true, url: u.toString(), html: got.body };
    }
    return { ok: false, url: u.toString(), reason: 'too many redirects' };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    return { ok: false, url: u.toString(), reason: err.code || err.message || 'fetch failed' };
  }
};
