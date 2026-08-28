# Legacy capture — refactored.ai as it existed before the rebuild

Point-in-time copy of the **public marketing pages** of `https://www.refactored.ai/`,
taken 2026-08-27, before any cutover to the new Refactored.ai site.

Its purpose is to make the rebuild reversible and reviewable: the current copy, structure
and claims are preserved here so the new site can be written against what exists rather
than from memory, and so nothing is silently lost when the domain changes hands.

## What is here

11 pages, ~1.4 MB of HTML.

| Page | Size | Title |
|---|---|---|
| `/` | 78 KB | Refactored\|Home Page |
| `/individuals/` | 43 KB | Individuals |
| `/enterprise/` | 27 KB | Enterprise |
| `/organizations/` | 53 KB | Refactored |
| `/public-library/` | 126 KB | Library |
| `/contact-us/` | 13 KB | Contact |
| `/feedback/` | 9 KB | ContactFeedback |
| `/enterprise-feedback/` | 24 KB | Enterprise Feedback |
| `/thank-you/` | 16 KB | Refactored |
| `/privacy/` | 474 KB | Privacy Policy \| Colaberry |
| `/terms/` | 486 KB | Terms of Use \| Colaberry |

`manifest.json` records the URL, status, byte count and extracted text length of each.
`assets-referenced.txt` lists the 202 distinct CSS/JS/image URLs the pages reference.

## What is deliberately NOT here, and why

The sitemap lists **1,931 URLs**. This capture covers 11 of them.

The other 1,908 are `/learn/` lesson pages (1,715) and `/course/` pages (193). Those are
the course catalogue — the actual teaching IP — and they are excluded on purpose:

- **Scraped HTML is the wrong representation.** That content has a source of truth in the
  curriculum system. Capturing rendered pages would produce a copy that cannot be edited,
  cannot be re-published, and would immediately drift from the real content.
- **It would bloat the repository.** At the observed page sizes, ~1,900 generated pages is
  on the order of 100 MB of markup that no one will ever read in a diff.

Migrating the catalogue is a separate piece of work with a different shape, and it should
be decided on its own terms rather than smuggled in as a side effect of a marketing-site
rebuild.

## Assets are referenced, not downloaded

The 202 assets live on `d2quzus90i2gii.cloudfront.net` and were not copied. **This matters
for the cutover:** that CloudFront distribution is a separate AWS resource from the EC2
instance serving the pages. If the instance is decommissioned without checking, the
distribution may go with it and these references would break. Verify it independently
before shutting anything down.

## What this is not

Not a backup of the running system. It is HTML only — no application code, no database, no
server configuration. The site runs on an EC2 instance in **us-west-2 (Oregon)** at
`54.218.30.47`, in AWS account `903195713680`. An **EBS snapshot of that instance** is the
thing that makes the cutover genuinely reversible, and it has to be taken in the AWS
console; this directory is not a substitute for it.

## How it was captured

Sequential requests with a 400 ms delay, so the capture could not behave like a load test
against a live production box. Re-runnable: the script overwrites the same filenames, so
running it again refreshes the snapshot rather than accumulating copies.
