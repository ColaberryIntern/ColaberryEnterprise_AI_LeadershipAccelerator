# OpportunityLift — Career Pathways Network's public site

Career Pathways Network raises money and turns it into paid for career training for people
in Dallas Fort Worth. **OpportunityLift** is the name of that scholarship program and of
this site, which serves `opportunitylift.org`.

This app **used to be a skeleton** whose only job was to prove that domain resolution,
visitor tracking, entry-point attribution, canonical lead creation and tenant context
worked end to end. That plumbing still works and is still load-bearing; the difference is
that there is now a real site sitting on top of it.

## Build

```bash
npm run build              # emits dist/
npm run validate:boundaries
```

No dependencies, no bundler. That is a decision, not an omission — see the comment at the
top of `packages/app-build/index.js`.

## Pages

Routes are directories, because nginx resolves them with
`try_files $uri $uri/ $uri.html` (see `nginx/opportunitylift.conf`). A page is
`src/<slug>/index.html`, never `src/<slug>.html`.

| Route | Page | Category |
|---|---|---|
| `/` | What the program is, and where it honestly stands today | `homepage` |
| `/scholarships/` | What a scholarship covers, the 25 hour commitment, interest form | `enroll` |
| `/how-funds-work/` | Every line of a 2,500 dollar scholarship, and who controls it | `about` |
| `/partners/` | Churches, employers and community groups; partner interest form | `program` |
| `/support/` | How to support the work; supporter interest form | `contact` |
| `/about/` | The entity, the board, providers and the related-party conflict | `about` |
| `/privacy/` | What the site collects and what it will not publish | `legal` |

The category column is not decoration. It is `backend/src/services/pageCategoryMaps.ts`,
and a page missing from that map is invisible to the intent engine —
`backend/src/__tests__/brandPageCategories.test.ts` fails the build rather than letting a
page mean nothing.

## Three claims this site must never make

These are not style preferences. Each one is a legal exposure, and each is asserted in
copy on more than one page so that deleting a single sentence cannot quietly reintroduce
it.

1. **Not a 501(c)(3).** Career Pathways Network has no federal tax exempt determination
   and has not filed for one. Contributions are **not tax deductible**, and no page may
   say or imply otherwise.
2. **No donation processing.** There is no checkout and no payment form. The support page
   captures interest and a person follows up. Payment processing is gated behind the IRS
   determination.
3. **No promised email.** Sending from `opportunitylift.org` is blocked at Mandrill
   (`unsigned`, pending domain verification behind a Mailchimp 2FA recovery case).
   Receiving works via the Cloudflare catch-all. So no form may promise a confirmation or
   an autoresponder — see the `data-thanks` strings in `src/assets/forms.js`.

A fourth, which is a credibility exposure rather than a legal one: **Colaberry is a
related party**, not an arm's length provider. CPN's president is Colaberry's managing
director and CPN's office is Colaberry's office. The site says so plainly on `/`,
`/scholarships/`, `/about/` and `/privacy/`, and must never present CPN as an independent
evaluator that happened to choose Colaberry.

## The legal name

**`Career Pathways Network`**, plural. Two wrong variants have circulated —
"Career Pathway Network" and "Community-to-Career Network" — and a prior audit found the
wrong one in 32 places across the Form 1023 attachments with zero correct. Neither variant
appears anywhere in this repository. Keep it that way.

## Forms

Three forms, one shared handler in `src/assets/forms.js`. Each `<form>` declares:

- `data-form` — the entry point slug, which is also the `entry=` parameter. The slug must
  exist in `lead_entry_points` (`backend/src/seeds/seedLeadSources.ts`) or ingest rejects
  the submission with "Unknown or inactive entry point".
- `data-thanks` — the confirmation sentence, which never mentions an inbox.

`backend/src/seeds/__tests__/appSourcesAreSeeded.test.ts` reads both shapes out of this
app's markup and fails if a form posts to an entry point nobody seeded.

## What the plumbing still proves

- `data-site="cpn"` resolves server-side to tenant `cpn` / brand `cpn`
- pageview, `cta_click`, `form_start` and `form_submit` events carry tenant/brand context
- the intake forms write to the canonical `leads` table and create a `LeadTenantContext`
- the same person arriving from another brand does not become a second lead

See [EXTRACTION.md](EXTRACTION.md) for what would have to move with this app if it is ever
lifted out of the ecosystem repository.
