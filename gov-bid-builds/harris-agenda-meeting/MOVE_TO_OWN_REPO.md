# Migrating Harris County Agenda + Meeting Management System to its own git repo

This project currently lives inside the Colaberry Enterprise AI Accelerator repo at `gov-bid-builds/harris-agenda-meeting/`. To split it into its own standalone repo:

## Steps

1. Create the new GitHub repo (private) at `ColaberryIntern/harris-agenda-meeting` or similar.

2. From inside the Accelerator repo, run the subtree split:

```bash
cd /path/to/colaberry-enterprise-ai-accelerator
git subtree split --prefix=gov-bid-builds/harris-agenda-meeting -b harris-agenda-meeting-split
```

3. Push the split branch to the new repo:

```bash
git remote add harris-agenda-meeting-remote git@github.com:ColaberryIntern/harris-agenda-meeting.git
git push harris-agenda-meeting-remote harris-agenda-meeting-split:main
```

4. (Optional) Remove the project from the parent repo:

```bash
git rm -rf gov-bid-builds/harris-agenda-meeting
git commit -m "Split harris-agenda-meeting into own repo"
```

5. In the new repo, update README links and CI to point at the new location.

## What stays with the Accelerator

- The BC todo lists in Gov Contracts BC project (proposal + build)
- The Opportunity Pulse opportunity record + uploaded RFP files
- The original requirements.md and architect spec
- The Mandrill email history

## What goes to the new repo

- All source code under `gov-bid-builds/harris-agenda-meeting/`
- CI / CD configs
- The demo deploy at https://harris-meetings-demo.colaberry.dev

## When to split

Split once the project is **post-sprint stable** — i.e., the proposal has been submitted and the build is in production / iteration mode. During the 2-week sprint, the project lives in the Accelerator repo so deploys go through the existing pipeline.
