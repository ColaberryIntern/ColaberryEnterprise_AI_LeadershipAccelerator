# MIGRATION_STRATEGY (Gate 0 · plan §55)

## Schema changes in this increment

**None.** Zero tables added, zero columns added, zero migrations written, zero seed changes.

The Career Studio is a read-only projection (`TARGET_ARCHITECTURE.md`). Nothing is persisted, so
there is nothing to migrate, back-fill, or roll back. Deployment risk for the data layer is nil.

## Plan §55 "do not" list — compliance

| Rule | Status |
|---|---|
| Do not drop `Project` share fields | Untouched |
| Do not overwrite runtime `PortfolioArtifact` | Read-only |
| Do not remove existing `portfolioGenerationService` callers | All 10 intact |
| Do not change resume source of truth casually | Unchanged; read through `portalSettingsService` |
| Do not duplicate GitHub secrets | `access_token_encrypted` never read by this code |
| Do not make private resume data public | No public surface exists |
| Do not automatically publish migrated users | Nothing publishes |

## Legacy mapping (recorded for the gate that needs it)

Today: public portfolio identity = `Project.share_token` (project-level).
Target: public career identity = person-level slug at `/talent/:slug`.

These are different keys on different entities. When Gate 10 mints person-level publications,
the mapping is:

```
Project.share_token  ──(1:1 today, since one Project per enrollment)──>  Enrollment
Enrollment  ──(1:1)──>  CareerProfile  ──(1:N)──>  CareerPublicationSnapshot
```

The migration decision that must be made **before** any person-level public route ships, and is
deliberately not made here:

1. keep `/portfolio/share/:token` serving the project-level payload forever (additive, safest); or
2. redirect it to the person-level snapshot once one is approved (cleaner, but changes what a
   recruiter already bookmarked sees, and would surface newer content than was reviewed).

Plan §48 requires this be an explicit design decision, not a default. It stays open.

## Rollback

`git revert` of the feature commit. No data cleanup, no compensating migration.
