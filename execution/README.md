# execution (retired)

**This directory is empty.** Only `.gitkeep` is tracked.

It held the Python execution layer that predated the Node migration. That code is gone; the directory survives because older documentation still references the path and removing it would break those references without warning.

## Where the work went

| Old role | Current home |
|---|---|
| Business logic | [`backend/src/services/`](../backend/src/services/README.md) |
| Planning and decisions | [`backend/src/intelligence/`](../backend/src/intelligence/README.md) |
| One-off operations needing backend internals | [`backend/src/scripts/`](../backend/src/scripts/README.md) |
| Repo, VPS, and external-system operations | [`../scripts/`](../scripts/README.md) |
| ML, embeddings, NL-to-SQL | [`../intelligence/`](../intelligence/README.md) (Python, still live) |

## Do not add code here

New execution code goes in `backend/` or `scripts/`. If you are reading a document that tells you to put something in `/execution`, that document is stale — the layer-3 "Execution" concept in [../CLAUDE.md](../CLAUDE.md) refers to the directories above, not to this path.

(By contrast, [`../config/`](../config/README.md) at the repo root *is* live — it holds runtime JSON settings read by scripts, even though it is untracked.)
