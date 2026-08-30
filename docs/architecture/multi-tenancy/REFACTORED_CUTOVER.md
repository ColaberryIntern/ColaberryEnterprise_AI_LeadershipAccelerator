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

## Three traps encoded in the config

**Proxy to the NLB's hostname, not to an IP.** An earlier revision of this file hardcoded
`54.218.30.47` and called it "the old box". It is not a box — it is whatever the prod
Network Load Balancer currently resolves to, and **NLB addresses rotate**. That version
would have passed every test and then broken silently, weeks later, the first time AWS
moved it. The config now targets
`refactored-nlb-prod-2edb9df08b1ba450.elb.us-west-2.amazonaws.com`.

**Assign the upstream name to a variable.** nginx resolves a literal hostname in
`proxy_pass` exactly once, at startup, which would reintroduce the same staleness a
restart later. A variable forces per-request resolution against the configured `resolver`.

Proxying by name is safe *here* only because the NLB hostname always means the load
balancer. Proxying to `refactored.ai` itself would resolve to **us** after the cutover and
loop until nginx ran out of workers.

**`try_files` discards `add_header`.** The fallback into `@legacy` is an internal redirect,
so headers set in the outer block are dropped. Any header that must survive belongs in the
location that finally serves the response.

## TLS: use certbot with DNS-01. Do NOT move the zone to Cloudflare.

An earlier revision of this document recommended moving `refactored.ai` to Cloudflare, on
the same reasoning that every other Colaberry domain lives there. **That recommendation was
wrong, and it was wrong because it was made before anyone read the zone.**

Exporting the Route 53 zone showed 45 records. `refactored.ai` is not a website's domain —
it is the DNS root of a live platform:

| What is on it | Records |
|---|---|
| **Auth0 customer login** | `login.refactored.ai` → `…edge.tenants.auth0.com` |
| **Two load balancers** | prod + stage NLBs behind apex, `www`, `accounts`, `survey`, `stage`, `stgaccounts`, `stgsurvey` |
| **Internal infrastructure** | `jenkins`, `git`, `vpn`, `api`, `testapi`, `docs`, `stage-accounts-k8s` |
| **Four email senders** | Google MX; Mandrill SPF + 3 DKIM; SendGrid `em.` + s1/s2; Mailchimp k2/k3; Amazon SES ×3 — all under `DMARC p=reject` |
| **8 ACM validation CNAMEs** | auto-renewing AWS certificates |
| **3 `_acme-challenge` TXT** | Let's Encrypt renewals |

Moving the nameservers would migrate customer authentication, CI, VPN, staging and four
email providers in a single cutover, under a DMARC policy where a missed DKIM record means
mail is **rejected**, not degraded. There is also a hard technical blocker: Route 53 ALIAS
records do not exist in Cloudflare, and the apex is an ALIAS to an NLB. Cloudflare can
approximate it with CNAME flattening, but that is a behaviour change at the root of a live
platform.

**Certbot with a DNS-01 challenge is strictly better here.** It proves control by writing
one TXT record through the Route 53 API and deleting it again. Nothing else in the zone is
touched, the certificate exists *before* any traffic moves so there is no ordering problem,
and renewal automates through the same API. The blast radius is one temporary TXT record
rather than an entire platform's DNS.

## Order of operations

1. **No EC2 snapshot is needed.** An earlier revision suggested one; the origin is not a
   single EC2 instance we could snapshot, it is a Network Load Balancer fronting a fleet.
   Rollback is a DNS change back, and the old stack keeps running untouched throughout.
2. **Issue the certificate with certbot DNS-01** against Route 53, for `refactored.ai`
   and `www.refactored.ai`. Do this first: it needs no traffic to have moved.
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
  (`d2quzus90i2gii.cloudfront.net`). That is a *separate* AWS resource from the load
  balancer and its targets — if the old stack is ever decommissioned, verify the
  distribution independently or the pages lose their styling.
- **Nothing else in the zone is touched.** Only `refactored.ai` and `www.refactored.ai`
  change. `login` (Auth0), `accounts`, `survey`, `api`, `git`, `jenkins`, `vpn`, every
  `stg*` host, all four email senders and all eleven certificate-validation records keep
  pointing exactly where they point today. That is the whole argument for changing two
  records rather than migrating a zone.
