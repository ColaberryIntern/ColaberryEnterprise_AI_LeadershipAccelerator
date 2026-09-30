# Loomly import - field mapping and exception report format

The importer is `backend/src/services/marketing/loomlyImport.ts` (pure: parse, map,
classify, dedup) + `loomlyImportService.ts` (persist) + `scripts/importLoomlyExport.ts`
(the operator command). This document is the human-readable contract those three implement;
the tests in `services/marketing/__tests__/loomlyImport.test.ts` hold it to it.

## 1. Header mapping (by alias, not position)

Columns are matched case- and space-insensitively against these aliases. A column matching
none is reported as `unknown_column` and ignored. A required field with no matching column
rejects the whole file (`missing_column`) - nothing is imported from a file whose shape is
not understood.

| Field | Required | Accepted headers (any one) | Becomes |
|---|---|---|---|
| calendar | yes | calendar, calendar name, brand | brand lookup (slug, then name; or `--calendar "Name=slug"`) |
| channel | yes | channel, channels, platform, network, social channel | `provider` (see section 2) |
| status | yes | status, post status | classification (section 3) |
| content | yes | content, text, message, post content, caption, body | `content_items.canonical_body`, `content_variants.body` |
| account | no | account, account name, page, profile, channel account | dedup key part 1; `content_variants.metadata.account`. Default `<calendar>/<provider>` |
| scheduledFor | no | scheduled date, scheduled at, scheduled, publish date, schedule | history: `content_items.scheduled_for`; drafts: `metadata.loomlyScheduledFor` only |
| publishedAt | no | published date, published at, published, publication date | `content_items.published_at`, `external_publications.published_at`; dedup key part 3 |
| media | no | media, media urls, attachments, images, assets (split on `;` `\|` newline) | `metadata.mediaUrls` (URLs only - bytes are not imported) |
| labels | no | labels, tags, label (split as above) | `metadata.labels` |
| externalId | no | external id, post id, provider post id, platform id, network post id | `external_publications.external_id`; dedup key part 2 |
| permalink | no | permalink, post url, url, link, live url | `external_publications.permalink`, `content_variants.link_url`; dedup key part 2 when no external id |
| author | no | author, created by, owner | `content_items.created_by` |
| loomlyId | no | id, loomly id, loomly post id | not used for dedup (a Loomly id is not a provider id); kept out of the row on purpose |

Dates are parsed with `Date.parse` and stored as UTC. A value that does not parse skips the
row with `bad_date`.

## 2. Channel to provider

| Loomly channel (normalised) | Provider |
|---|---|
| facebook, facebook page, fb | `meta_facebook_page` |
| instagram, ig, instagram business | `meta_instagram` |
| linkedin, linkedin page, linkedin company | `linkedin_organization` |
| linkedin profile, linkedin personal | `linkedin_member` |
| twitter, x, x (twitter) | `x` |
| youtube | `youtube` |
| tiktok | `tiktok` |
| anything else | row skipped: `unknown_channel` |

## 3. Classification

| Condition | Kind | Lands as |
|---|---|---|
| `publishedAt` present, or status is published / posted / live | `history` | `content_items` status `published`, `metadata.readOnly = true`, one variant, one `external_publications` row (`metadata.mode = 'imported'`) |
| no `publishedAt`, `scheduledFor` in the future | `scheduled_draft` | `content_items` status `draft`, `metadata.needsVerification = true`, `scheduled_for` **null** (the time is kept in `metadata.loomlyScheduledFor` for a person to re-confirm) |
| otherwise | `draft` | `content_items` status `draft` |

Every imported row carries `metadata.provenance = 'loomly_import'` and `metadata.loomlyKey`.
Original timestamps are preserved on history rows. Read-only history refuses every edit and
transition through the workflow (`ReadOnlyImport`, HTTP 409).

## 4. Dedup key

```
key = normalise(account) | (externalId ?? permalink ?? "content:" + hash(text + media)) | (publishedAt ?? scheduledFor ?? "unscheduled")
```

- Within one file: the second occurrence of a key is skipped (`duplicate_in_batch`).
- Against the database: a row whose key already exists on a `content_items.metadata.loomlyKey`
  is skipped (`duplicate_existing`). This is what makes `--execute` safe to run twice.
- `keyStrength` is `strong` when an external id or permalink was present, `weak` when the
  key fell back to the content hash. A weak-keyed published post is imported but flagged
  (`weak_key`): it cannot be reconciled to a live post or matched by a future metrics import.

## 5. Exception report

Written as markdown by every run (dry or execute), default path
`tmp/loomly-exceptions-<timestamp>.md` (never committed), one row per exception:

```
| Row | Code | Detail |
|---:|---|---|
| 0 | `unknown_column` | Column "Something" is not mapped and will be ignored. |
| 14 | `unknown_channel` | Channel "Pinterest" is not one of the seven providers this platform knows. |
| 27 | `duplicate_existing` | Already imported (key colaberry page|urn:li:share:123|2026-08-01T14:00:12.000Z). |
```

| Code | Row level | Effect |
|---|---|---|
| `missing_column` | file (row 0) | file rejected, nothing imported |
| `unknown_column` | file (row 0) | column ignored |
| `unknown_channel` | row | skipped |
| `empty_content` | row | skipped (no text and no media) |
| `bad_date` | row | skipped |
| `weak_key` | row | imported; not reconcilable |
| `duplicate_in_batch` | row | skipped |
| `duplicate_existing` | row | skipped |
| `unknown_calendar` | row | skipped until mapped with `--calendar` |

## 6. What is deliberately not imported

- Media bytes (URLs only; the repo has no object storage - T007's note).
- Analytics of any kind (the platform shows only what it measured).
- Loomly's own post ids as identity (not a provider id; a future metrics import matches on
  the network's id or permalink, never on Loomly's).
- Future schedules as queued jobs (they are drafts a person re-confirms).
