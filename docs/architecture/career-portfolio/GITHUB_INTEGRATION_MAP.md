# GITHUB_INTEGRATION_MAP (Gate 0 · plan §2.6, §13, §43)

## What exists on main

| Model | Table | Key fields |
|---|---|---|
| `GitHubConnection` | `github_connections` | `enrollment_id`, `project_id`, `repo_url`, `repo_owner`, `repo_name`, `access_token_encrypted`, `webhook_secret`, `status_json`, `file_tree_json`, `commit_summary_json`, `repo_language`, `file_count`, `last_sync_at`, `last_checked_at` |
| `StudentGithubActivity` | `student_github_activity` | `enrollment_id`, `commits_last_7d`, `open_prs`, `total_stars`, `contribution_graph_json`, `raw_repos_json`, `synced_at` |

## Gap analysis against plan §13

| Plan requirement | Status |
|---|---|
| multiple repos per person | **Partial.** `GitHubConnection` is one row per repo and rows are scoped `(enrollment_id, project_id)`, so several rows per person are physically possible, but nothing models them as one person-level catalog. |
| multiple GitHub accounts / orgs | **Absent.** No account entity. Deferred per plan §72. |
| repo states (`discovered → analyzing → analyzed → eligible → excluded → portfolio_selected → publication_approved`) | **Absent.** No state column. Would require a new table — out of scope for a read-only increment. |
| exclusion rules (forks, tutorials, empty, duplicates, confidential) | **Absent.** |
| private-repo content analysis | **Absent.** Token is stored; nothing reads file contents. |

## What this build does

`githubAdapter` reads `GitHubConnection` rows for the caller's enrollment and
`StudentGithubActivity`, and surfaces them read-only in the Studio's Builds section as
*connected repositories* — not as "portfolio projects".

That distinction is deliberate and is plan §13's rule: **"A repo is not automatically a
portfolio project."** Without eligibility state, exclusion rules, or contribution data, promoting
a repo to a portfolio project would be an unsupported claim. So the Studio shows repos as
evidence of connected work and stops there.

## Deferred (Gate 5 / Gate 6)

Person-level repo catalog with eligibility + selection state, multi-account support, and the
deep repository intelligence pipeline (the one area where Kes's implementation genuinely leads —
see `KES_REUSE_MAP.md`).
