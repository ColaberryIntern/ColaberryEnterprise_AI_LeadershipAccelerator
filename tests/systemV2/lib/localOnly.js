/**
 * Local-only guard for campus e2e scripts. Call before launching a browser or sending a request.
 *
 * Other scripts in this folder default to production. The campus e2e must never touch it: the
 * build prompt says "against a local stack, never production". Accepted: plain http to exactly
 * localhost, 127.0.0.1 or [::1]. Everything else is refused, including names that merely start with
 * "localhost" (localhost.evil.com), tunnels (ngrok), 0.0.0.0 and any https URL.
 */
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

function checkLocalUrl(raw) {
  if (!raw || !String(raw).trim()) return { ok: false, reason: 'URL is not set' };
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return { ok: false, reason: `not a valid URL: ${raw}` };
  }
  if (url.protocol !== 'http:') return { ok: false, reason: `protocol ${url.protocol} refused (local stack is plain http)` };
  if (!LOCAL_HOSTS.includes(url.hostname)) return { ok: false, reason: `host ${url.hostname} is not local` };
  return { ok: true, origin: url.origin };
}

/** Exits the process with code 2 when any named URL is not local. Returns the origins otherwise. */
function assertLocalOnly(urls) {
  const origins = {};
  for (const [name, raw] of Object.entries(urls)) {
    const r = checkLocalUrl(raw);
    if (!r.ok) {
      console.error(JSON.stringify({ event: 'campus_e2e_refused', outcome: 'failure', error_class: 'ValidationError', name, reason: r.reason }));
      process.exit(2);
    }
    origins[name] = r.origin;
  }
  return origins;
}

module.exports = { checkLocalUrl, assertLocalOnly, LOCAL_HOSTS };
