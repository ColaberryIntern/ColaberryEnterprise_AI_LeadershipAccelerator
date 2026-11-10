# Session CC-20261102-k9r4 — visitor geo-IP enrichment (GEO-1)

PROGRESS.md is sealed, so this is the session record. Companion to
`SESSION_CC-20261102-k9r4-open-house.md`, which covers OH-1 .. OH-4.

## Why this exists

Ali asked why the landing-page snack bar he built had never appeared. It is
installed correctly on `/lp/colaberry-training/ai-learning-platform` and its feed
answers `200 {"events":[]}` — the deliberate "no feed, no bar" behaviour.

Measured on production 2026-11-10, the cause is upstream of the snack bar:

| What `composeSignupEvents` needs to name a person | Production |
|---|---|
| `visitors.city` | **0 of 3,084** rows in 30 days (0 of 6,408 all time) |
| `leads.social_proof_opt_in` | **0 of 35** recent leads |

Not a shortage of signups — there were 35 in 72 hours and 296 in 30 days. With
`name_format: 'city_only'` (the default; the page's config is `{}`) a row without
a city cannot be named, so every row is skipped. The other two name formats do
not rescue it: `first_initial` falls back to "Someone in {city}" for anyone not
opted in, and `opted_in_only` needs the opt-in. **Every path needs a city or an
opt-in, and production has neither.**

`city` is declared on the Visitor model and read in two places
(`visitorAnalyticsService` line 166 and its search filter) — and written nowhere.
There is no geo-IP enrichment anywhere in the codebase.

## Why IP and not phone

Ali asked whether the city could come from the lead's phone number. Measured both:

| Source | Covers the snack bar's rows | Already stored |
|---|---|---|
| Visitor IP | **263 of 296 (89%)** | 6,405 of 6,408 all time |
| Lead phone | 215 of 296 (73%) | fewer |

Beyond coverage, an area code says where a number was *issued*, not where its
owner is — US number portability has decoupled the two since 2003 — and an area
code names a numbering plan area, not a city (212/646/917 are all New York). 358
distinct area codes across 2,932 phones would become confident city claims on a
public page. `snackbarFeedService`'s own header sets the standard this would
break: "NOTHING IS INVENTED... which is what keeps this on the right side of the
FTC's rules on fake social proof."

Decision (Ali): MaxMind GeoLite2.

## What shipped

- Date: 2026-11-10
- Session: CC-20261102-k9r4
- What changed:
  - `backend/src/services/geo/visitorGeoEnrichment.ts` — pure logic: normalise
    whatever is in `ip_address` to one address, reject anything not publicly
    routable, and turn a reader response into a city only when it is confident
    and renderable.
  - `backend/src/scripts/enrichVisitorGeo.ts` — the runner. Short-lived,
    idempotent, keyset-paginated, one transaction per batch, `--dry-run` and
    `--limit`. Backfill and ongoing fill are the same code path.
  - `.github/workflows/build-images.yml` — downloads `GeoLite2-City.mmdb` and
    bakes it into the backend image.
  - `backend/Dockerfile`, `backend/geoip/.gitkeep`, `.gitignore`,
    `backend/package.json` + `package-lock.json` (`maxmind@5.0.8`).
- Verification: 64/64 assertions executed against the real module via Node 26's
  native type stripping, plus an end-to-end run against MaxMind's public test
  database (5 cities resolved, including a non-ASCII one; private IP skipped;
  absent IP returned nothing). `npm ci --dry-run` confirms the lockfile.

## Decisions worth keeping

**The database is baked into the image, so no license key goes near the VPS.**
MaxMind's EULA requires keeping GeoLite data current and deleting a database
within 30 days of a release. Fetching per build means every deploy ships a
current copy with no cron to forget, and the key lives only in GitHub Actions.
The database is public data, so the workflow's "none of the three Dockerfiles
bakes a secret" invariant is unchanged. Layers are content-addressed, so an
unchanged database is not re-pulled; MaxMind publishes about twice a week.

**The enrichment is a script, never a service.** The reader holds ~60MB open. The
production host's kernel journal counts 670 OOM kills and it runs five Postgres
instances, so the long-running backend must not carry that resident.

**Only cities the snack bar will actually render are stored.** `cleanCity` accepts
`/^[\p{L} .'-]{2,60}$/u` and silently returns null otherwise, so a stored value it
rejects produces a row that looks enriched and renders nothing — and the column
stops meaning "this row is done". The write is validated against a pinned copy of
that expression.

**A vague fix is not a city.** MaxMind's `accuracy_radius` is capped at 200km; past
that the country is kept and the city dropped. A 1000km radius is a time zone
wearing a city's name, and "Someone in Wichita" for a person in Denver is the
false claim this whole module exists to avoid.

## Found, not fixed

- **`cleanCity` has no comma in its character class, so "Plano, TX" is rejected.**
  The snack bar's own comment promises "Someone in Plano, TX", which cannot happen
  as the code stands. Storing the bare city is the honest reading; widening the
  sanitiser is a separate decision about a public surface.
- **423 of 3,085 recent visitor rows hold a private IP** (a proxy address recorded
  instead of the forwarded client) and can never be enriched. `trust proxy` IS set
  to 1 in `server.ts`, so the public majority are genuine client addresses.
- **`leads.social_proof_opt_in` is written by nothing.** It appears only in the
  schema, the model and the feed. Naming people by name still needs a form change.
- **Nothing schedules this script yet.** The backfill is a manual run; ongoing
  enrichment needs a cron, which is an infrastructure decision, not this PR's.
