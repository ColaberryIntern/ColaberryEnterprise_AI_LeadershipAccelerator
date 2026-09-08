# Putting the new Refactored.ai site on refactored.ai

Status: **site built, served on the preview hostname. No DNS has moved.**

## What changed, and twice

**2026-09-07 — retire the ported portal.** refactored.ai was a copy of a legacy learning
platform: 78KB of ported markup, Bootstrap 4.5 and jQuery from public CDNs, 421 asset
references to a CloudFront distribution nobody had confirmed owning, five dead forms and a
sign-in modal wired to nothing. All of it was deleted.

**2026-09-08 — build a real site.** The first reading of "route everything to enterprise"
was that refactored.ai should become a redirect. It shouldn't. It should be a product site
for Refactored.ai that *routes people onward* to the accelerator where that is the right
destination. Ten pages now live in `apps/refactored-public`.

The retirement was still correct. Nothing from the old portal came back.

## Where it is served now

**`refactored-preview.colaberry.ai`** — and this is not a staging copy of something served
elsewhere. It is currently the only place the site exists.

The hostname is `noindex, nofollow`, because two hostnames serving the same content is the
standard way to lose the real domain's search ranking to its own preview.

## Why refactored.ai cannot simply point here

**The shared nginx container terminates no TLS at all.**

```
$ git grep "listen 443\|ssl_certificate\|certbot" -- nginx/
(nothing)
```

Every hostname in that image listens on port 80, because Cloudflare sits in front of every
Colaberry domain and handles HTTPS. `refactored.ai` is the one Colaberry domain **not**
behind Cloudflare — Route 53 goes straight to AWS. Pointing it at that container would
refuse every HTTPS request and break a domain that currently works.

Closing that gap on our side means certbot, a 443 listener, mounted certificates and
renewal automation, on a box that has twice driven Postgres into recovery during a build.
For a static site, AWS is simply the better host.

## The production target

```
refactored.ai  ─┐
                ├─► Route 53 ALIAS ─► CloudFront ─► S3 (the built site)
www.refactored.ai ┘                      │
                                         └─ ACM certificate (us-east-1)
```

Publishing is `aws s3 sync apps/refactored-public/dist/ s3://<bucket>/ --delete` followed
by a CloudFront invalidation. The build already content-hashes every asset reference
(`site.css?v=58c167fe`), so only the HTML needs invalidating and a stale edge cache cannot
serve a page its stylesheet no longer matches.

### Four things that will bite

**The ACM certificate must be issued in `us-east-1`.** CloudFront reads certificates only
from that region regardless of where the rest of the estate lives. A certificate issued in
`us-west-2` is perfectly valid and simply never appears in the dropdown.

**Use the S3 *website* endpoint as a custom origin, not the bucket picker.** The REST
endpoint that CloudFront's dropdown wires up does not apply index documents to
subdirectories, so `/platform/` returns an error instead of `/platform/index.html`. Every
page on this site is a directory, so this is the difference between nine working pages and
nine broken ones.

**Set the S3 index document to `index.html`.** Same reason. It is what makes
`/ai-workforce/` resolve at all.

**Point `www` at the same distribution.** Both hostnames are live A records today. Adding
one and forgetting the other leaves half the traffic on the old platform.

### Order of operations

1. **Request the ACM certificate** in `us-east-1` for `refactored.ai` and
   `www.refactored.ai`. DNS validation, "Create records in Route 53". Wait for *Issued*.
2. **Create the bucket**, enable static website hosting, index document `index.html`.
3. **Publish the site** with `aws s3 sync` from `dist/`.
4. **Create the CloudFront distribution** over the bucket's *website* endpoint (HTTP only —
   S3 website endpoints do not speak HTTPS), viewer protocol *redirect to HTTPS*, both
   hostnames as alternate domain names, the ACM certificate attached.
5. **Verify against the CloudFront hostname** before any DNS moves. Check `/`,
   `/platform/`, `/ai-workforce/` and a deliberately missing path.
6. **Point the two Route 53 ALIAS records** at the distribution. Last, and reversible.

Steps 1 to 5 change nothing a visitor sees.

## What switching DNS turns off

refactored.ai is **not** a marketing site with the application hosted elsewhere. The whole
legacy learning platform answers on that one hostname today:

| Path | Today | After |
|---|---|---|
| `/signin`, `/signup`, `/dashboard/` | 200 | gone |
| `/course/…` (193 pages) | 200 | gone |
| `/learn/…` (1,715 pages) | 200 | gone |
| `login.refactored.ai` (Auth0) | live | **untouched** — separate record |

Roughly 1,900 content pages and the student sign-in stop answering. That is the intended
consequence of retiring the portal, not an oversight.

Whether anyone still depends on them was never measured and cannot be from outside the
legacy platform. **Check the NLB's access logs or CloudWatch metrics for recent traffic
before step 6 rather than after.** It is the only part of this that a DNS rollback does not
cleanly undo, because the people affected will have already hit a wall.

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

Serving from CloudFront keeps the zone where it is and changes two records.

## Access

Confirmed 2026-09-08 from the Route 53 console: account **903195713680**, hosted zone
**Z36GZ3BINBIAA6**, apex `A` an editable ALIAS to
`refactored-nlb-prod-2edb9df08b1ba450.elb.us-west-2.amazonaws.com` in US West (Oregon).
Write access is not in question.

## Rollback

Change the two ALIAS records back to the NLB. The legacy stack keeps running untouched, so
rollback is a DNS change rather than a restore, and it takes about a minute.

Keep the NLB and its targets running until the new site is proven. Decommissioning them,
and the `d2quzus90i2gii` CloudFront distribution that still serves the old site's assets,
is a separate decision with no deadline attached.
