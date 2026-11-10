# hire.refactored.ai: handoff and owner testing guide

Session CC-20261106-fv8g · written 2026-11-09 · build list: https://app.basecamp.com/3945211/buckets/7463955/todolists/10483888099

**TAKEAWAY.** hire.refactored.ai is live on the real domain over TLS. It lists three
people (Kesetebirhan Delele with 9 case studies, Swati Raman and Obi Anamelechi with one
each), and every case study shows its video, visual story, named builder, verified badge
and provenance. Independent production verification: see "Production verification"
below. Certificate renewal is the one piece of infrastructure still manual (the
certificate is good until 5 Feb 2027).

## Links

| What | URL |
|---|---|
| Site | https://hire.refactored.ai/ |
| First listed person | https://hire.refactored.ai/talent/kesetebirhan-delele/ |
| Reference case study | https://hire.refactored.ai/case-studies/every-lead-has-a-history/ |
| Intro request | https://hire.refactored.ai/intro/?talent=kesetebirhan-delele |
| Talent API | https://enterprise.colaberry.ai/api/public/hire/talent |
| How a person is listed or withdrawn | `directives/list-talent-on-hire-refactored.md` |

## Test it yourself (about 10 minutes, any browser)

1. **The directory.** Open https://hire.refactored.ai/. Kes is the spotlight at the top.
   Nobody else is listed, and nobody unapproved can be.
2. **A person.** Click Kes. His page shows his role, job history and his case studies.
3. **A case study.** Click "Every Lead Has a History". You should see the gold
   "Published case study" label with ✓ VERIFIED, "Built by Kesetebirhan Delele", the
   walkthrough video under the header, the workflow diagram and charts further down,
   and a "Repositories and provenance" band saying one private repository backs it.
4. **Request an intro.** The card on the right has "Request intro". The form opens with
   Kes filled in. Submitting it sends a real request to the team, so only submit one you
   mean.
5. **Phone.** Repeat 1-3 on your phone. Nothing should scroll sideways.
6. **Retired link.** https://hire.refactored.ai/ws-post-job answers "retired" on purpose:
   the old job-post endpoint is gone.
7. **A wrong address.** https://hire.refactored.ai/talent/nobody/ shows a branded
   not-found page, not an error.

## How someone gets listed

Listing is gated by design. A person appears only when their portfolio page has been
approved through review (as ali@colaberry.com) AND they have set it public AND it is
published to the hire surface. Their case studies link to them through their project or
their GitHub repositories. Full steps: `directives/list-talent-on-hire-refactored.md`.

| Person | State |
|---|---|
| Kesetebirhan Delele | Listed, spotlight, 9 Cora case studies |
| Swati Raman | Listed 2026-11-09 after her resume landed: 4 jobs, Stress Test Review App case study |
| Obi Anamelechi | Listed 2026-11-09: 4 jobs from his LinkedIn PDF, 1 case study. His upload stored the file but the AI extraction failed silently; it was re-run by hand. Account name reads "OBI, ANAMELECHI. K" (asked him to correct it in Settings) |

Kes and Swati are Colaberry employees, listed as real test profiles; they are not on the market.

## Known limitations

- Kes's headline reads "AI Leadership Accelerator — QA", frozen at approval. Changing it
  needs a re-approval.
- His portfolio shows his email address publicly.
- "Verified commits" shows 0: commit verification is not wired for his private repos.
- The certificate does not renew itself. The host's certbot cannot do Route 53, so it was
  issued with the `certbot/dns-route53` docker image; a scheduled renewal is still to do.
- No preview host was used. The plan's hire-preview.colaberry.ai step was superseded when
  the real domain was cut over directly.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Site 502 for about a minute after a deploy | Backend boot window | Wait 90s |
| Site down entirely, other Colaberry sites fine | Host nginx site disabled or cert expired | Check `/etc/nginx/sites-enabled/hire-refactored`, `nginx -t`, the certificate's end date |
| A person approved but not showing | Not set public, or not published to hire | Follow the directive's checklist |
| Case study shows no video or diagram | Media not on the record, or its visual story not approved for enterprise or hire | Check the case study's media and visual-story surfaces in admin |

## Rollback

Production deploys pull CI images (registry mode). To undo a release: revert the
offending merge on main through a PR, then `./scripts/deploy-prod.sh backend nginx` on the
box. To take the site offline without a deploy: disable the host nginx site
`hire-refactored` and reload nginx.

## Open items

1. Automate certificate renewal (production infrastructure change: needs Ali's go-ahead).
2. Optional: fix Kes's headline and hide his email (needs a re-approval).
3. Resume upload can store the file and silently skip extraction (Obi, 2026-11-09:
   `extracted` null, no log line). `portalSettingsService.setResume` swallows the failure
   with only a warn; it needs a retry or a visible "we couldn't read this" state.
4. Kes could not connect the AI-inbox-Manager repository to its project in the portal
   (2026-11-08). The listing does not depend on it; the connect failure is not diagnosed.

## Production verification

PENDING
