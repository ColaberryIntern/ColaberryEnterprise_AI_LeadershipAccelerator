# Our Services staging stack

A throwaway copy of the app for `tests/systemV2/ourServicesJourney.e2e.js`, the Our Services **write** journey:
import a whitepaper, see it wait in Intake, tick a service, click Link, and watch it leave Intake. It writes data,
so it never runs against production. This stack is where it runs.

- **Same code as production.** It uses the registry images (`accelerator-backend:main`, `accelerator-nginx:main`).
- **Its own empty database.** There is no production volume, secret or database anywhere in `compose.yml`.
- **Private.** Every port binds to `127.0.0.1` on the host. You reach it through an SSH tunnel.

## Run it (about 5 minutes; nothing is built)

On the server, from a checkout of `main`:

```bash
cd tests/systemV2/ourServicesStaging
printf 'JWT_SECRET=%s\nNODE_ENV=preview\nPORT=3001\n' "$(openssl rand -hex 32)" > .env.staging && chmod 600 .env.staging
docker compose -p our-services-staging -f compose.yml up -d postgres
docker compose -p our-services-staging -f compose.yml run --rm --no-deps -T -v "$PWD:/seed:ro" accelerator-backend node /seed/seedStaging.js
docker compose -p our-services-staging -f compose.yml up -d
```

`seedStaging.js` does two things:

- It creates the tables. Production boot cannot start on an empty database, because its schema steps alter tables before anything creates them.
- It adds the government-contracts workspace that every Our Services route needs.

It is idempotent: a second run reuses the same records. It refuses, with exit code 2, any database whose name does not contain `preview` or `staging`.

From your machine, open the tunnel and run the spec:

```bash
ssh -N -L 10441:127.0.0.1:10441 -L 15441:127.0.0.1:15441 root@<server> &
JWT_SECRET=<the value in .env.staging> \
CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" \
node tests/systemV2/ourServicesJourney.e2e.js
```

## Results

Exit codes:

- **0:** every check passed.
- **1:** a check failed.
- **2:** the spec refused to run, because a URL or database was not a local staging target. It writes nothing in that case.

The spec removes its own fixture rows before it starts and again at the end, even when it fails. Its last check proves that no fixture rows remain. The uploaded original stays inside the container's `/app/uploads` until the stack is removed.

## Tear down

```bash
docker compose -p our-services-staging -f compose.yml down -v && rm -f .env.staging
```

`-v` deletes the staging database volume. Nothing on production is touched.
