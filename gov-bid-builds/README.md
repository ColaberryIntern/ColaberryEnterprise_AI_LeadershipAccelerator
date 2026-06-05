# Gov-bid Build Projects

Working pilots accompanying our 4 active government RFP responses. Each project is a self-contained subfolder that can later be split into its own git repo (see `MOVE_TO_OWN_REPO.md` in each).

## Active builds

- [`tdhca-multifamily/`](./tdhca-multifamily/) — **TDHCA Multifamily Management System** (Texas Department of Housing and Community Affairs). Owner: Akiwam. Closes: 2026-06-29.
- [`tdcj-oig-records/`](./tdcj-oig-records/) — **TDCJ-OIG Records Management System** (Texas Department of Criminal Justice - Office of Inspector General). Owner: OBI. Closes: 2026-11-01.
- [`utd-residential-life/`](./utd-residential-life/) — **UTD Residential Life Software for Housing** (University of Texas at Dallas). Owner: Omolola. Closes: 2026-06-30.
- [`harris-agenda-meeting/`](./harris-agenda-meeting/) — **Harris County Agenda + Meeting Management System** (Harris County). Owner: samrawit. Closes: 2026-06-22.

## Workflow

1. Each project has a proposal track (in Gov Contracts BC) and a build track (also in Gov Contracts BC, separate list).
2. The build BC list has both human tasks (assigned to the intern) and AI tasks (assigned to CB System, but every AI task needs human approval).
3. The 2-week sprint goal: working pilot deployed to public URL + proposal submitted to the agency, with the proposal narrative referencing the live demo URL.

## Repo structure

```
gov-bid-builds/
  <project-slug>/
    README.md           ← project overview
    SETUP.md            ← run locally
    requirements.md     ← AI Project Architect spec
    MOVE_TO_OWN_REPO.md ← split-out instructions
    package.json
    .env.example
    .gitignore
    app/                ← all source code
    seeds/              ← fake-data seeders
    docs/               ← demo screenshots + agency-facing artifacts
    deploy/             ← Docker + deploy scripts
```
