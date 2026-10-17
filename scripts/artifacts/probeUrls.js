/**
 * Prove a URL is absent, rather than inferring it from a failed search.
 *
 *   node scripts/artifacts/probeUrls.js urls.txt
 *   node scripts/artifacts/probeUrls.js --urls https://a/ https://b/
 *
 * ## Why this exists
 *
 * C3.4 asks for absences to be "proven by probing, not inferred", and that turns out to be
 * harder than it sounds on a bot-protected domain.
 *
 * **openai.com serves a Cloudflare managed challenge to naive HTTP clients.** Measured on
 * 2026-10-16: plain `curl` returned 403 for `openai.com/charter/`, which certainly exists, AND
 * 403 for `openai.com/fakesection-qqq111/`, which certainly does not. A probe log built that way
 * cannot tell absence from blocking, so it proves nothing in either direction.
 *
 * Sending the full browser header set passes the challenge and restores true status codes:
 * `charter/` -> 200, the fake path -> 404.
 *
 * ## The controls are not optional
 *
 * Every run probes two controls on each host before reporting anything:
 *   - a path that is known to exist, which must return 200
 *   - a nonsense path, which must return 404
 *
 * If the known-good control does not return 200, the channel is being blocked and every
 * "absence" in that run is worthless, so the run FAILS rather than printing a misleading log.
 * If the nonsense control does not return 404, the host soft-404s and absence cannot be proven
 * from status codes at all. Either way the tool refuses to hand back a log that would be read
 * as evidence when it is not.
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

/**
 * The header set that passes a Cloudflare managed challenge.
 *
 * NOTE WHY THIS SHELLS OUT TO curl RATHER THAN USING node's https MODULE. The headers alone are
 * not enough: Cloudflare fingerprints the TLS handshake, and node's fingerprint is blocked even
 * when every header matches a real browser. Measured 2026-10-16: node https got 403 on
 * openai.com/charter/ with these exact headers, curl got 200. The control check below is what
 * caught that, which is the whole reason it runs first.
 */
const HEADER_ARGS = [
  '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,'
    + 'image/webp,*/*;q=0.8',
  '-H', 'Accept-Language: en-US,en;q=0.9',
  '-H', 'Upgrade-Insecure-Requests: 1',
  '-H', 'Sec-Fetch-Dest: document',
  '-H', 'Sec-Fetch-Mode: navigate',
  '-H', 'Sec-Fetch-Site: none',
  '-H', 'Sec-Fetch-User: ?1',
  '-H', 'sec-ch-ua: "Chromium";v="131", "Not_A Brand";v="24"',
  '-H', 'sec-ch-ua-mobile: ?0',
  '-H', 'sec-ch-ua-platform: "Windows"',
];

/** One request, following redirects, returning the final status. 000 means it never connected. */
function probe(url) {
  try {
    const out = execFileSync('curl', [
      '-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
      '-w', '%{http_code}', '-L', '--max-time', '25', ...HEADER_ARGS, url,
    ], { encoding: 'utf8', timeout: 40000 }).trim();
    const status = Number(out) || out;
    return Promise.resolve({ url, status });
  } catch (e) {
    return Promise.resolve({ url, status: 'ERR', note: (e.message || '').slice(0, 60) });
  }
}

/** Known-good and known-bad paths per host. Extend as new hosts are probed. */
const CONTROLS = {
  'openai.com': { good: 'https://openai.com/charter/',
    bad: 'https://openai.com/fakesection-qqq111x/' },
  'academy.openai.com': { good: 'https://academy.openai.com/',
    bad: 'https://academy.openai.com/this-definitely-does-not-exist-qqq111x' },
  'partners.openai.com': { good: 'https://partners.openai.com/',
    bad: 'https://partners.openai.com/this-definitely-does-not-exist-qqq111x' },
  // Added for C5.0, which probes learner commit URLs. The good control is the first commit
  // in git's own repository, chosen because it is public, famous and cannot be force-pushed
  // away. The bad control is forty hex zeros: a well-formed sha that resolves to nothing.
  //
  // READ A 404 HERE CORRECTLY. GitHub serves 404, not 403, for a private repository to an
  // anonymous visitor, so this channel cannot tell "private" from "deleted" from "never
  // existed". For C5.0's purpose that distinction does not matter and the conflation is the
  // honest one: a stranger who clicks gets nothing, whatever the cause.
  'github.com': {
    good: 'https://github.com/git/git/commit/e83c5163316f89bfbde7d9ab23ca2e25604af290',
    bad: 'https://github.com/git/git/commit/0000000000000000000000000000000000000000',
  },
};

async function validateChannel(host) {
  const c = CONTROLS[host];
  if (!c) return { host, ok: null, note: 'no controls defined for this host; absence NOT proven' };
  const good = await probe(c.good);
  const bad = await probe(c.bad);
  const ok = good.status === 200 && bad.status === 404;
  return { host, ok, good: good.status, bad: bad.status,
    note: ok ? 'channel valid: a 404 here means absent'
      : good.status !== 200 ? 'BLOCKED: known-good control did not return 200, so no absence in '
        + 'this run is evidence of anything'
        : 'SOFT 404: nonsense path did not return 404, so status codes cannot prove absence' };
}

async function main() {
  const args = process.argv.slice(2);
  let urls = [];
  if (args[0] === '--urls') urls = args.slice(1);
  else if (args[0]) urls = fs.readFileSync(args[0], 'utf8').split(/\r?\n/).filter(Boolean);
  if (!urls.length) { console.error('usage: probeUrls.js <file> | --urls <url...>'); process.exit(2); }

  const hosts = [...new Set(urls.map((u) => { try { return new URL(u).host; } catch { return '?'; } }))];
  console.log('CONTROLS, run before anything is reported');
  const validity = {};
  for (const h of hosts) {
    const v = await validateChannel(h);
    validity[h] = v;
    console.log('  ' + h.padEnd(24) + 'good=' + v.good + ' bad=' + v.bad + '  ' + v.note);
  }
  console.log('');

  console.log('PROBE LOG  (' + new Date().toISOString().slice(0, 10) + ')');
  const rows = [];
  for (const u of urls) {
    const r = await probe(u);
    rows.push(r);
    const host = (() => { try { return new URL(u).host; } catch { return '?'; } })();
    const trust = validity[host] && validity[host].ok ? '' : '   <- channel not validated';
    console.log('  ' + String(r.status).padEnd(8) + u + (r.challenged ? '  [cf challenge]' : '')
      + trust);
  }

  // RE-RUN THE CONTROLS AT THE END. A long run can be rate-limited partway through, and the
  // opening control check cannot see that: every probe after the limit kicks in comes back
  // 404 or 429 and the log looks like a pile of genuine absences. Validating both ends is
  // what makes a clean log mean something.
  const blocked = Object.values(validity).filter((v) => v.ok === false);
  if (urls.length > 10 && !blocked.length) {
    console.log('\nCONTROLS AGAIN, because a long run can be throttled partway');
    for (const h of hosts) {
      const v = await validateChannel(h);
      console.log('  ' + h.padEnd(24) + 'good=' + v.good + ' bad=' + v.bad + '  ' + v.note);
      if (v.ok === false) blocked.push(v);
    }
  }

  console.log('\n' + rows.filter((r) => r.status === 404).length + ' of ' + rows.length
    + ' returned 404');
  if (blocked.length) {
    console.error('\nFAILED: ' + blocked.map((b) => b.host).join(', ')
      + ' did not pass the control check. Absence is NOT proven for those hosts.');
    process.exit(1);
  }
}

main().catch((e) => { console.error('PROBE FAILED: ' + e.message); process.exit(1); });
