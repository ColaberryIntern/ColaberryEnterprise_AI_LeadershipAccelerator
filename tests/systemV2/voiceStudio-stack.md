# Voice Studio e2e: the local stack

Two scripts test the Voice Studio console (`/admin/voice-studio`) against a stack on this machine only:

| Script | Covers |
|---|---|
| `voiceStudio.e2e.js` | Roles, draft to publish, voice preview, dry run, the live-test confirmation, call filters and detail, trust timeline, route change and rollback, and a flag-off comparison |
| `voiceStudio.a11y.js` | axe (nothing serious or critical) on every tab at 390 and 1280 px, no sideways scrolling at 390 px, keyboard-only use |

Both refuse (exit 2) any URL or database that is not localhost, and a stack that is not the one below.

**Nothing dials and nothing is bought.** Leave every Twilio, Synthflow, OpenAI and Anthropic key unset. `VOICE_TEST_ENABLED` must be off. The two speech endpoints are answered inside the browser, after one real request proves the server refuses without a key.

## 1. Throwaway Postgres 16

Follow section 1 of [commsHub-stack.md](commsHub-stack.md) (Docker, or the portable EDB zip). Commands here use port 55473 and a database named `vs_stack`. On Windows, if your `unzip` skips subfolders, extract the whole archive: `initdb` needs `share/timezonesets`.

## 2. Backend environment

```
DATABASE_URL=postgres://vs@127.0.0.1:55473/vs_stack
NODE_ENV=development  DB_BOOT_SYNC=true
JWT_SECRET=<any local secret; the scripts sign their tokens with it>
```

## 3. Schema

1. Create the model tables, from `backend/`:
   ```
   node -e "require('ts-node').register({transpileOnly:true}); const {sequelize}=require('./src/config/database'); require('./src/models'); (async()=>{for(const m of Object.values(sequelize.models)){try{await m.sync()}catch(e){console.log(m.name,e.message)}}await sequelize.close()})()"
   ```
   One known message, about `agent_domain_tool_request_decisions`, is harmless here.
2. Replace the voice tables with production's own DDL. The model sync leaves out column defaults, so the seeds fail without this step:
   ```
   node -e "require('ts-node').register({transpileOnly:true}); const s=require('./src/db/voiceStudioTableSpecs'); const {Client}=require('pg'); (async()=>{const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect(); for(const t of s.VOICE_TABLE_SPECS) await c.query('DROP TABLE IF EXISTS '+t.table+' CASCADE'); for(const q of s.voiceStudioStatements()) await c.query(q); await c.end()})()"
   ```
   This drops tables. Check that `DATABASE_URL` is the throwaway database first.

## 4. Start

| Process | Port | Command |
|---|---|---|
| Backend, console on | 3171 | `PORT=3171 FRONTEND_URL=http://localhost:3170 VOICE_STUDIO_UI_ENABLED=true npx ts-node --transpile-only src/server.ts` |
| Backend, console off | 3173 | `PORT=3173 FRONTEND_URL=http://localhost:3172 DB_BOOT_SYNC=false npx ts-node --transpile-only src/server.ts` |
| Site, console on | 3170 | `SERVE_PORT=3170 API_URL=http://127.0.0.1:3171 node tests/systemV2/lib/localServe.js` |
| Site, console off | 3172 | `SERVE_PORT=3172 API_URL=http://127.0.0.1:3173 node tests/systemV2/lib/localServe.js` |

Build the frontend first: `CI=true npx react-scripts build` from `frontend/`. The first backend start takes several minutes.

## 5. Run

```
DATABASE_URL=... JWT_SECRET=... node tests/systemV2/voiceStudio.e2e.js
DATABASE_URL=... JWT_SECRET=... node tests/systemV2/voiceStudio.a11y.js
```

Exit codes: 0 all passed, 1 a check failed, 2 refused or could not set up. Screenshots go to the system temp folder, or `SHOT_DIR`. Edge is used by default (`PW_CHANNEL=msedge`).

Each run makes its own rows (an agent, a number, three calls, a route) and deletes them in a `finally`; the last check counts what is left.

## Known and expected

- **Contrast in the shared admin shell** is printed as a note, not failed. It is on every admin page.
- **Other admin pages scroll sideways at 390 px.** The console's own pages no longer do; the shared layout was not changed.
