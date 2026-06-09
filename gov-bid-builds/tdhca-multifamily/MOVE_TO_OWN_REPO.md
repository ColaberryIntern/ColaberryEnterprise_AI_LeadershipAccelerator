# Migrating TDHCA Multifamily Management System to its own git repo

This project currently lives inside the Colaberry Enterprise AI Accelerator repo at `gov-bid-builds/tdhca-multifamily/`. To split it into its own standalone repo:

## Steps

1. Create the new GitHub repo (private) at `ColaberryIntern/tdhca-multifamily` or similar.

2. From inside the Accelerator repo, run the subtree split:

```bash
cd /path/to/colaberry-enterprise-ai-accelerator
git subtree split --prefix=gov-bid-builds/tdhca-multifamily -b tdhca-multifamily-split
```

3. Push the split branch to the new repo:

```bash
git remote add tdhca-multifamily-remote git@github.com:ColaberryIntern/tdhca-multifamily.git
git push tdhca-multifamily-remote tdhca-multifamily-split:main
```

4. (Optional) Remove the project from the parent repo:

```bash
git rm -rf gov-bid-builds/tdhca-multifamily
git commit -m "Split tdhca-multifamily into own repo"
```

5. In the new repo, update README links and CI to point at the new location.

## What stays with the Accelerator

- The BC todo lists in Gov Contracts BC project (proposal + build)
- The Opportunity Pulse opportunity record + uploaded RFP files
- The original requirements.md and architect spec
- The Mandrill email history

## What goes to the new repo

- All source code under `gov-bid-builds/tdhca-multifamily/`
- CI / CD configs
- The demo deploy at https://tdhca-demo.colaberry.dev

## When to split

Split once the project is **post-sprint stable** — i.e., the proposal has been submitted and the build is in production / iteration mode. During the 2-week sprint, the project lives in the Accelerator repo so deploys go through the existing pipeline.
