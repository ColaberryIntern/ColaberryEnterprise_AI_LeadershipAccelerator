# CC-20261117: /book gives the e-book for a short form

Ticket: W16, Basecamp list 10515008393 (bucket 47502609). Follows W14 (PR #4141), decision 5.

Asked by Ali on 2026-11-17: "We can give them a free electronic copy but not the paperback. Make
them fill out a form for it and it should go in as a Trust before Intelligence brand lead."
Asked how the copy is delivered, Ali chose "Download after form": the page shows the download as
soon as the form is sent, and nothing is emailed.

## What changed

- The "Get your copy" card on /book is now a form with these fields:
  - full name (required);
  - work email (required);
  - company (optional);
  - role (optional);
  - the consent tick (required, not pre-ticked), as on every other public form.
- It posts to `/api/leads` with `source: 'trustbeforeintelligence'` and
  `form_type: 'book_ebook_request'`.
  - `leadSourceGroups` already files that source under "Trust Before Intelligence".
  - `leadService` already keeps it out of the warm-call campaign.
  - No backend change was needed.
- On success the card shows "Download the e-book", linking to
  `/site-v2/book/trust-before-intelligence.pdf`. The file is kept outside `/book/`, because a
  folder there would shadow the page route in nginx.
- The hero button now reads "Get the e-book".
- The card says the paperback is not part of the offer, and the page never says "free" (copy rule).
- Two CSS rules in `fidelityV5.css`: the card's `p` rule had turned the field errors grey.

## Blocked on

The PDF. No electronic edition exists in the book repo (its `export/` folder is empty). The PR stays
a draft until Ali supplies it.

## Known limit

`createLead` returns the existing row for an email it already holds, so an existing lead keeps
their first source.

## Also settled

W14 decision 6 was a false flag: "Your role" on the demo pilot form IS sent and saved, as
`leads.title`.

## Verification

- `BookV2.ebook.test.tsx`, 7 tests:
  - no download before the form is sent;
  - an empty submit is blocked;
  - the post carries the brand source, then shows the download;
  - a failed send keeps the form;
  - the source string matches the backend group;
  - the file path is not under /book/;
  - the page has no "free" and no paperback offer.
  - Mutation-checked: removing the source fails the test.
- Public-site suites: 838 of 839 pass. The one failure is `governmentHeaderParity`, which fails only
  in this Windows checkout (line endings).
- Backend copy lints: 334 of 334.
- tsc: checked with a planted control error.
- `CI=true` build: compiles cleanly.
- Edge, at 1440 and 390, with `/api/leads` intercepted:
  - errors show in red;
  - the post carries the brand source;
  - the download appears after sending;
  - no sideways scroll and no page errors.
