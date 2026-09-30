# Curriculum-type AI thumbnails

Every Experience Studio curriculum type ("AI Component" in `curriculum_type_definitions`)
gets a unique AI-generated banner thumbnail with a small Colaberry wordmark chip,
replacing the deterministic gradient `templateThumbnail()` SVGs.

## Pipeline (3 deterministic steps)

1. **Generate** (VPS host, where `OPENAI_API_KEY` lives — key never leaves the box):
   `scp prompts.json generateOnHost.js root@95.216.199.47:/root/thumb-gen/` then
   `ssh root@95.216.199.47 'cd /root/thumb-gen && node generateOnHost.js'`.
   One `gpt-image-2` render (1536x1024) per type, serial, idempotent by output
   file, capped retries + timeouts. ~$0.06/image.
2. **Composite + install** (local repo root):
   `node scripts/curriculum-type-thumbnails/compositeAndInstall.js --raw <dir>` —
   center-crop to 3:1, resize 900x300, stamp `colaberry-logo-transparent.png` on a
   translucent chip bottom-right, write JPEG q82 to
   `frontend/public/thumbnails/curriculum-types/<slug>.jpg` (served at
   `/thumbnails/curriculum-types/<slug>.jpg` by the nginx frontend build).
3. **Wire** — `backend/src/seeds/seedComponentAuthoring.ts` maps every slug to its
   `thumbnail_url`; the seed runs at every boot (idempotent, reseed-proof), so the
   URLs survive DB reseeds and promote to prod with a normal deploy.

## Art direction

Single consistent style across the set (enterprise editorial, 3D-minimalism, navy/teal
palette + coral accent, no text) with one unique scene metaphor per type — defined in
`prompts.json`. Regenerate any single image with `--only slug` on step 1, then rerun
steps 2–3.
