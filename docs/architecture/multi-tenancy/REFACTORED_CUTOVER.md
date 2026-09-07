# Retiring refactored.ai

Status: **redirect committed, not in effect.** No DNS has moved.

## The decision, and the one it replaced

On 2026-09-07 the direction changed: **retire the old Refactored portal and send its
traffic to the accelerator.** `refactored.ai` and `www.refactored.ai` return `301` to
`https://enterprise.colaberry.ai/` for every path.

The previous plan, which the rest of this document used to describe, was the opposite:
take over the front door with a proxy, keep the legacy platform reachable underneath, and
move pages from *proxied* to *ours* one redesign at a time. That plan was correct for
"keep the platform alive while we rebuild it" and is the wrong shape for retiring it, so
the proxy is gone rather than left dormant.

The eleven ported marketing pages were deleted with it. They were a faithful copy of the
portal being retired, and keeping a copy of something you have decided to switch off only
creates a second thing to maintain.

## What this deliberately breaks

refactored.ai is **not** a marketing site with the application hosted elsewhere. The whole
learning platform is on that one hostname, and all of this answers `200` there today:

| Path | Status today | After the DNS move |
|---|---|---|
| `/signin`, `/signup`, `/dashboard/` | 200 | 301 to the accelerator |
| `/course/…` (193 pages) | 200 | 301 to the accelerator |
| `/learn/…` (1,715 pages) | 200 | 301 to the accelerator |
| `login.refactored.ai` (Auth0) | live | untouched — different hostname |

**Roughly 1,900 content pages and the student sign-in stop answering.** That is the point
of retiring the portal, not a side effect, but it is the reason this is a decision with a
date on it rather than a config tidy-up.

Note that `login.refactored.ai` is a separate record and is not touched. The Auth0 tenant
keeps running; it simply stops being reachable through a link on this hostname.

## The blocker: nobody has confirmed AWS access

The redirect cannot take effect until refactored.ai's DNS points at our nginx, and that
DNS is not ours to move today.

The apex and `www` are Route 53 ALIAS records to
`refactored-nlb-prod-2edb9df08b1ba450.elb.us-west-2.amazonaws.com`. Changing them needs
credentials for the AWS account behind that load balancer. As of 2026-09-07 nobody has
confirmed holding them. The account is almost certainly Colaberry's — it is serving
refactored.ai right now, and the same zone carries the company's Jenkins, git, VPN and
Auth0 records — but "almost certainly ours" is not an account you can log in to.

**This is the first thing to resolve.** Everything below is blocked on it.

## Where the redirect can be verified today

`refactored-preview.colaberry.ai` runs the identical redirect and that hostname **is**
ours: colaberry.ai sits behind Cloudflare, which terminates TLS and talks to this server
over port 80. So the exact behaviour refactored.ai will have can be exercised before any
DNS moves.

Keeping the two blocks behaviourally identical is the whole point. A cutover verified on a
hostname that behaves differently is not verified.

## Why every path lands on the destination's root

`enterprise.colaberry.ai` is a React single-page app with a catch-all route, so **every**
path there returns `200` whether or not it is a real route. Checked on 2026-09-07:

```
200  /individuals
200  /organizations
200  /enterprise
200  /definitely-not-a-real-page-xyz     <- the catch-all, proving the other three
```

None of the first three is a route in `frontend/src/routes/publicRoutes.tsx`. A
path-preserving redirect map would therefore have looked correct in every test and
delivered every visitor to a not-found component.

Sending everyone to the root is the honest mapping. If per-audience destinations are
wanted later, they need real routes on the destination first.

The query string is preserved (`$is_args$args`), so a campaign's `?utm_source=…` survives
the hop and the visit still attributes instead of arriving as direct traffic.

## TLS: use certbot with DNS-01. Do NOT move the zone to Cloudflare.

This survives the change of plan unaltered, because it is about the zone rather than the
site.

An earlier revision recommended moving `refactored.ai` to Cloudflare on the reasoning that
every other Colaberry domain lives there. That recommendation was wrong, and it was wrong
because it was made before anyone read the zone. Exporting it showed 45 records:

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
records do not exist in Cloudflare, and the apex is an ALIAS to an NLB.

**Certbot with a DNS-01 challenge is strictly better here.** It proves control by writing
one TXT record through the Route 53 API and deleting it again. Nothing else in the zone is
touched, the certificate exists *before* any traffic moves so there is no ordering problem,
and renewal automates through the same API.

## Order of operations

1. **Establish AWS access.** Everything else is blocked on this. Confirm who can log in to
   the account behind the prod NLB and the `d2quzus90i2gii` CloudFront distribution.
2. **Verify the redirect on the preview host.** `refactored-preview.colaberry.ai` should
   return `301` to `https://enterprise.colaberry.ai/`, preserving the query string. This
   needs no AWS access and nothing customer-facing changes.
3. **Issue the certificate with certbot DNS-01** against Route 53, for `refactored.ai` and
   `www.refactored.ai`. It needs no traffic to have moved.
4. **Tell anyone still using the portal**, if there is anyone. This is the step that has no
   technical component and the largest consequence: 1,900 pages and a sign-in disappear.
5. **Point DNS** at this server. Last, and reversible — the old stack keeps running
   untouched, so rollback is a DNS change back rather than a restore.

## What is deliberately not done

- **The legacy platform is not decommissioned.** Only DNS moves. The NLB, its targets and
  the Auth0 tenant keep running, which is what makes step 5 reversible.
- **Nothing else in the zone is touched.** Only `refactored.ai` and `www.refactored.ai`.
  `login`, `accounts`, `survey`, `api`, `git`, `jenkins`, `vpn`, every `stg*` host, all
  four email senders and all eleven certificate-validation records keep pointing exactly
  where they point today.
- **The `refactored` brand map is kept** in `backend/src/services/pageCategoryMaps.ts`,
  including entries for pages that no longer exist. Historical visitor events still
  reference those paths, and `brandPageCategories.test.ts` asserts them directly.
- **`legacy-capture/` is kept** as the archive of what the site was. It is not built and
  not served. `port-from-capture.js`, which would regenerate the deleted pages from it, is
  guarded so it cannot be run by accident.
