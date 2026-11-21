# Communications Hub e2e: the local stack

`commsHub.e2e.js` walks the hub end to end as a community organizer:
- set the test cohort;
- create an event;
- make a template thumbnail (AI off) and use it;
- draft the Announcement from the promotion plan;
- approve it to the test cohort's feed;
- the sending worker posts it;
- Schedule & history shows it Sent;
- prepare the live stream.

It runs against a stack on this machine only. The script refuses (exit 2) any base URL, API URL or database that is not localhost.

Nothing external is called:

| Service | What stands in for it |
|---|---|
| Model | `lib/fakeOpenAI.js`. The backend's OpenAI client honours `OPENAI_BASE_URL`. |
| Stream provider | A fake live-input id with no Cloudflare credentials. Preparing a stream only records state; it never calls Cloudflare. |
| Mail | No mail transport is configured, so failure alerts are recorded as failed, never sent. |

## 1. Throwaway Postgres 16

Any local Postgres 16 works.

With Docker:

```
docker run -d --name chub-e2e-pg -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=chub -p 127.0.0.1:55452:5432 postgres:16
```

Without Docker on Windows (how CH8.1 ran, 2026-11-20):
1. Unzip the official EDB `postgresql-16.x-windows-x64-binaries.zip` into a scratch folder.
2. Initialize and start a cluster:
   ```
   pgsql/bin/initdb -D <data> -U chub -A trust -E UTF8 --locale=C
   pgsql/bin/pg_ctl -D <data> -o "-p 55452 -c listen_addresses=127.0.0.1 -c max_connections=100 -c shared_buffers=128MB" -l pg.log -w start
   ```

Then create the database: `CREATE DATABASE chub_stack;`

This also runs the hub's integration suites locally:

```
DATABASE_URL=postgres://chub@127.0.0.1:55452/postgres node scripts/ci/runIntegrationSuites.js --filter commsHub
```

## 2. Environment for the backend

```
DATABASE_URL=postgres://chub@127.0.0.1:55452/chub_stack
NODE_ENV=development  PORT=3101  DB_BOOT_SYNC=true  FRONTEND_URL=http://localhost:3150
JWT_SECRET=<any local secret; the e2e signs its organizer token with it>
OPENAI_API_KEY=e2e-fake  OPENAI_BASE_URL=http://127.0.0.1:3199/v1
CLOUDFLARE_STREAM_LIVE_INPUT_UID=0123456789abcdef0123456789abcdef
```

Leave these unset:
- `MANDRILL_API_KEY`, `SMTP_USER`, `SMTP_PASS`
- `COMMS_HUB_AI_THUMBNAILS` (AI off: template thumbnails only)
- every `CLOUDFLARE_*` other than the input id

## 3. Start, in this order

1. **Fake model.** Run `node tests/systemV2/lib/fakeOpenAI.js`. It listens on 127.0.0.1:3199.
2. **Create the model tables once.** On an empty database, the backend's boot-time schema patches fail before the tables exist. From `backend/`, with the env above:
   ```
   node -e "require('ts-node').register({transpileOnly:true}); const {sequelize}=require('./src/config/database'); require('./src/models'); sequelize.sync().catch(e=>console.log(e.message)).finally(()=>sequelize.close())"
   ```
   It ends with the known "cannot be cast automatically to type enum_inbox_cases_state" message. That is harmless here; see `campus-stack.md`.
3. **Backend.** From `backend/`, run `npx ts-node --transpile-only src/server.ts`. Wait for `Server running on port 3101`. The hub's sending worker starts with it and ticks every minute.
4. **Frontend.**
   - From `frontend/`, build it: `CI=true npx react-scripts build`.
   - From the repo root, serve the build with `/api` proxied to the backend, like production nginx:
     ```
     SERVE_PORT=3150 API_URL=http://127.0.0.1:3101 node tests/systemV2/lib/localServe.js
     ```

## 4. Run

```
BASE_URL=http://localhost:3150 API_URL=http://127.0.0.1:3101 DATABASE_URL=postgres://chub@127.0.0.1:55452/chub_stack \
JWT_SECRET=<the backend's> node tests/systemV2/commsHub.e2e.js
```

- Exit codes: 0 means every check passed, 1 means a check failed, 2 means it refused or could not set up.
- Screenshots go to the system temp folder (`commsHub-e2e-<run>`), or to `SHOT_DIR`.
- The run takes about two minutes, most of it waiting for the worker's next tick.
- Local Playwright needs Edge (`PW_CHANNEL=msedge`, the default): App Control blocks Playwright's bundled Chromium.

## What it creates, and removes

**Created:** a cohort and an event titled `[e2e] ... <run>`, plus everything the hub attaches to the event:
- the thumbnail;
- the message, its drafts and deliveries;
- the feed post;
- the activity;
- the stream preparation.

If the database has no `colaberry-training` media brand, a tenant and that brand are created too.

**Removed:** all of it is deleted in a `finally`, even on failure, and the last check confirms nothing is left. The stream preparation matters most: left behind, it holds the one shared live input, and the next Prepare is refused with "... is getting ready to stream right now."

**Kept:** the Colaberry Team identity the hub creates on its first post. It is the hub's own and is created once.

## Known and expected on this stack

- **Thumbnail previews read "Preview unavailable".** Previews are signed media URLs, and no media public base URL is configured locally. The thumbnail itself is made and used.
- **A cohort-only event cannot be prepared for streaming** until that cohort has a batch room ("This cohort has no batch room to stream into."). The e2e opens its event to all members first.
- **The draft check rejects relative dates.** The fake model's text had to drop "this week" before the hub would approve it. That is the check working.
