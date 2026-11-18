# CC-20261117: the Trust Before Intelligence e-book goes on /book

Ticket: W16, Basecamp list 10515008393 (bucket 47502609).

Ali, 2026-11-17: "the book is in my downloads folder". The file, `trust_before_intelligence_complete.pdf`, has:
- 200 pages and 18.3 MB;
- First Edition 2026, e-book ISBN 979-8-9948853-1-4.

## What changed

- The book is added at `frontend/public/site-v2/book/trust-before-intelligence.pdf`, which is `EBOOK_URL` in `BookV2.tsx`.
- No code changed. #4157 made /book show "Coming soon" until that URL serves a real PDF. With the file in place, the form appears by itself.
- Size: production already serves a 19.6 MB PDF from `/assets/` as `application/pdf`, so this file is within the same range.

## Known content issue (Ram's call)

Page 191 ("Digital Companion") still carries the placeholder `[Insert QR code linking to: trustbeforeintelligence.ai]`. The text under it gives the URL, so readers still reach the companion. A corrected PDF can replace this file at the same path, with no code change.

## Verification

- The served bytes are identical to the source file.
- Edge, 1440 and 390, against the built site with the PDF present:
  - the card shows the form, not "Coming soon";
  - an empty submit shows 3 errors;
  - a filled submit sends `source: trustbeforeintelligence`, `form_type: book_ebook_request`, the role as `title`, and `consent_contact: true`, with the request intercepted;
  - the download link appears, and the file downloads at 200 with the full 18,338,118 bytes;
  - no page errors and no horizontal scroll.
