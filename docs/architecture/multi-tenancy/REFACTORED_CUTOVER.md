# Retiring refactored.ai

Status: **ready to execute. No DNS has moved.**

Every request to `refactored.ai` will `301` to `https://enterprise.colaberry.ai/`, served
from AWS. Nothing in this repository serves the domain, and nothing needs to.

## The decision, and the two it replaced

**2026-09-07 — retire, don't rebuild.** The original plan was to take over the front door
with an nginx proxy and redesign the marketing pages one at a time, keeping the legacy
platform reachable underneath. The decision went the other way: retire the old portal and
send its traffic to the accelerator. The ported pages and the proxy config were deleted.

**2026-09-08 — serve the redirect from AWS, not from our nginx.** The first attempt put
the redirect in `nginx/refactored.conf`. That could not have worked, and the reason is
worth recording:

> **This repository's nginx container terminates no TLS at all.** Every hostname in it
> listens on port 80, because Cloudflare sits in front of every Colaberry domain and
> handles HTTPS. `refactored.ai` is the one domain **not** behind Cloudflare — it is
> Route 53 straight to AWS. Pointing it at our box would have refused every HTTPS request.

Closing that gap on our side would have meant certbot, a 443 listener, mounted
certificates and renewal automation, making a retired domain depend on a Hetzner box that
already has memory pressure. Serving it from AWS costs none of that: ACM issues and renews
the certificate, and the redirect never leaves the account that already owns the domain.

So `nginx/refactored.conf`, `nginx/refactored-preview.conf` and `apps/refactored-public/`
were all deleted. They are recoverable from history if the decision is ever reversed.

## The target

```
refactored.ai  ─┐
                ├─► Route 53 ALIAS ─► CloudFront ─► S3 (redirect-only bucket)
www.refactored.ai ┘                      │
                                         └─ ACM cert (us-east-1)
                                         └─ CloudFront Function: 301 → enterprise root
```

The S3 bucket holds no content. It exists because CloudFront requires an origin; the
function returns the redirect before the origin is consulted.

**Full step-by-step runbook, with the console gotchas, lives outside the repo** — it is an
operator procedure rather than a code artifact. The five steps are: ACM certificate in
`us-east-1`, S3 redirect bucket, CloudFront distribution over the bucket's *website*
endpoint, a CloudFront Function to collapse paths, then the two Route 53 records **last**.

### Three things that will bite

**The ACM certificate must be in `us-east-1`.** CloudFront reads certificates only from
that region no matter where the rest of the estate lives. A certificate issued in
`us-west-2` is valid and simply never appears in the dropdown.

**CloudFront's origin must be the S3 *website* endpoint, entered as a custom origin over
plain HTTP.** Choosing the bucket from CloudFront's dropdown wires the S3 REST endpoint,
which does not honour website redirect rules — it returns contents or an access error, but
never a 301. S3 website endpoints do not speak HTTPS, which is why the origin protocol is
HTTP.

**S3's redirect preserves the request path, and that is wrong here.**
`enterprise.colaberry.ai` is a React single-page app with a catch-all route, so *every*
path there returns 200 whether or not it exists. Checked 2026-09-07:

```
200  /individuals
200  /organizations
200  /enterprise
200  /definitely-not-a-real-page-xyz     <- the catch-all, proving the other three
```

None of the first three is a route in `frontend/src/routes/publicRoutes.tsx`. Preserving
`/course/intro` would therefore deliver the visitor to a not-found component. The
CloudFront Function collapses every path to the destination root and carries the query
string through, so a campaign's `?utm_source=…` survives the hop and the visit still
attributes instead of arriving as direct traffic.

## What this switches off

`refactored.ai` is **not** a marketing site with the application hosted elsewhere. The
whole learning platform is on that one hostname:

| Path | Today | After |
|---|---|---|
| `/signin`, `/signup`, `/dashboard/` | 200 | 301 to the accelerator |
| `/course/…` (193 pages) | 200 | 301 |
| `/learn/…` (1,715 pages) | 200 | 301 |
| `login.refactored.ai` (Auth0) | live | **untouched** — separate record |

Roughly 1,900 content pages and the student sign-in stop answering. That is the intended
outcome of retiring the portal, not a side effect.

Whether anyone still depends on them was never measured and cannot be from outside the
legacy platform. If it matters, check the NLB's access logs or CloudWatch metrics for
recent traffic **before** moving DNS rather than after.

## Do NOT move the zone to Cloudflare

This survives every change of plan, because it is about the zone rather than the site.

An early revision recommended moving `refactored.ai` to Cloudflare on the reasoning that
every other Colaberry domain lives there. That was wrong, and it was wrong because it was
made before anyone read the zone. Exporting it showed 45 records:

| What is on it | Records |
|---|---|
| **Auth0 customer login** | `login.refactored.ai` → `…edge.tenants.auth0.com` |
| **Two load balancers** | prod + stage NLBs behind apex, `www`, `accounts`, `survey`, `stage`, `stgaccounts`, `stgsurvey` |
| **Internal infrastructure** | `jenkins`, `git`, `vpn`, `api`, `testapi`, `docs`, `stage-accounts-k8s` |
| **Four email senders** | Google MX; Mandrill SPF + 3 DKIM; SendGrid `em.` + s1/s2; Mailchimp k2/k3; Amazon SES ×3 — all under `DMARC p=reject` |
| **8 ACM validation CNAMEs** | auto-renewing AWS certificates |
| **3 `_acme-challenge` TXT** | Let's Encrypt renewals |

A nameserver move would migrate customer authentication, CI, VPN, staging and four email
providers in a single cutover, under a policy where a missed DKIM record means mail is
**rejected**, not degraded. Route 53 ALIAS records also have no Cloudflare equivalent at
the apex.

Serving the redirect from CloudFront keeps the zone exactly where it is and changes two
records.

## Access

Confirmed 2026-09-08 from the Route 53 console: account **903195713680**, hosted zone
**Z36GZ3BINBIAA6**, apex `A` record an ALIAS to
`refactored-nlb-prod-2edb9df08b1ba450.elb.us-west-2.amazonaws.com` in US West (Oregon),
editable. Write access is not in question.

## Rollback

Change the two ALIAS records back to the NLB. The legacy stack keeps running untouched
throughout, so rollback is a DNS change rather than a restore, and it takes about a minute.

Keep the NLB and its targets running until the redirect is proven. Decommissioning them,
and the `d2quzus90i2gii` CloudFront distribution that still serves the old site's assets,
is a separate decision with no deadline attached.

## What is deliberately not done

- **The legacy platform is not decommissioned.** Only DNS moves. The NLB, its targets and
  the Auth0 tenant keep running, which is what makes rollback cheap.
- **Nothing else in the zone is touched.** Only `refactored.ai` and `www.refactored.ai`.
- **The `refactored` brand map is kept** in `backend/src/services/pageCategoryMaps.ts`,
  including entries for pages that no longer exist. Historical visitor events still
  reference those paths, and `brandPageCategories.test.ts` asserts them directly. It is now
  the one map with no app behind it.
