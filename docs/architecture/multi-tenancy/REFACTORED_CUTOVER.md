# Taking over refactored.ai without breaking it

Status: **rebuilt and reviewable, not deployed.** No DNS has moved.

## What was rebuilt

The 11 public marketing pages of refactored.ai, ported from
`apps/refactored-public/legacy-capture/` into `apps/refactored-public/src/` by
`port-from-capture.js`, with the v2 tracker injected into each.

The brief was to rebuild the current site in place and redesign later, so this is a
**faithful port, not a redesign**. The pages look and read exactly as they do today. The
one thing that changes is that visits now attribute to the `refactored` brand instead of
being invisible — which is the entire point of taking over the front door.

## Why a proxy, and not a clean takeover

refactored.ai is **not** a marketing site with the application hosted elsewhere. The whole
learning platform is on that one hostname. All of these return 200 there today:

| Path | Status |
|---|---|
| `/signin`, `/signup`, `/dashboard/` | 200 |
| `/course/…` (193 pages) | 200 |
| `/learn/…` (1,715 pages) | 200 |

Pointing DNS at this server and serving only the rebuilt marketing pages would **404 every
student login and all 1,908 content pages.**

So `nginx/refactored.conf` serves what we have rebuilt and passes everything else through
to the existing origin untouched. Each page moves from *proxied* to *ours* as it is
redesigned. That turns one irreversible decision into a series of reversible ones, and the
worst case for a marketing page becomes a marketing page rather than a locked-out student.

## Two traps encoded in the config

**Proxy by IP, never by name.** Once DNS points here, `proxy_pass https://refactored.ai`
resolves to *us* and loops until nginx runs out of workers. `54.218.30.47` is the only
address that still means "the old box" after the cutover.

**`try_files` discards `add_header`.** The fallback into `@legacy` is an internal redirect,
so headers set in the outer block are dropped. Any header that must survive belongs in the
location that finally serves the response.

## Prerequisite that is NOT yet solved: TLS

This is the real remaining blocker, and it is worth being explicit about.

`enterprise.colaberry.ai` is fronted by **Cloudflare**, which terminates TLS and talks to
our nginx over plain HTTP — which is why the existing server blocks only `listen 80`.

`refactored.ai` is on **Route 53 pointing straight at EC2**. There is no Cloudflare in
front of it. So pointing it at this server means our nginx has to answer HTTPS for
`refactored.ai` and `www.refactored.ai`, and it currently holds no certificate for either.

Two ways to solve it, and this is a decision rather than a detail:

| Option | What it means |
|---|---|
| **Put Cloudflare in front**, as the Colaberry domains already are | Consistent with the rest of the estate; TLS terminates at Cloudflare; nginx keeps listening on 80. Requires moving the domain's DNS to Cloudflare. |
| **Issue a certificate on this server** (certbot / Let's Encrypt) | Keeps DNS in Route 53. Adds a renewal to maintain, and the cert can only be issued once the domain already points here — so there is a brief ordering problem to plan around. |

## Order of operations

1. **Snapshot the EC2 instance** (optional but cheap). Not strictly required: as long as
   the old box keeps running, rollback is a DNS change back. It matters only if that
   instance is ever going to be deleted.
2. **Resolve TLS** — pick one of the two options above.
3. **Serve the rebuild on a subdomain first** and compare it against the live site
   side by side. Nothing customer-facing changes at this step.
4. **Run `seedEcosystem`** so the `www.refactored.ai` brand domain row reaches production.
   It is merged in code but seeds do not run at boot, so it is not live yet — without it,
   half the traffic attributes to no brand.
5. **Point DNS** at this server. Last, and reversible.

## What is deliberately not done

- **The forms are untouched.** Their handlers live in an external CloudFront bundle with
  no inline post target, so the submit path is not visible from the HTML. Under the proxy
  they keep reaching the existing backend and working exactly as they do today. Rewiring
  each to `/api/leads/ingest` belongs with that page's redesign, where the field mapping
  can be verified rather than guessed from a minified bundle.
- **The 1,908 catalogue pages are not rebuilt.** They are proxied. Migrating that content
  is a separate project with a different shape.
- **Assets still load from the legacy CloudFront distribution**
  (`d2quzus90i2gii.cloudfront.net`). That is a *separate* AWS resource from the EC2
  instance — if the instance is ever decommissioned, verify the distribution independently
  or the pages lose their styling.
