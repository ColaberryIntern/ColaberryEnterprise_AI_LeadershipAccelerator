# PUBLIC_SHARING_MAP (Gate 0 · plan §2.4, §48, §54-L)

## What exists

```
/portfolio/share/:token                 frontend/src/App.tsx:50 → PublicPortfolioPage.tsx
        │
        ▼
GET /api/public/portfolio/:token        routes/publicPortfolioRoutes.ts (unauthenticated)
        │
        ▼
getPortfolioByShareToken(token)         services/portfolioShareService.ts
   Project.findOne({ share_token, share_enabled: true })
        │
        ▼
generatePortfolio(project.enrollment_id)  → PortfolioResult
```

Properties worth preserving (all already correct):

- **Stable opaque token.** `crypto.randomUUID()`, minted once, reused on re-enable — a link
  already handed to an employer keeps working.
- **Revocable without rotation.** `share_enabled: false` kills the link; the token survives.
- **Non-enumerable 404.** "No such token" and "sharing disabled" return the same generic 404.

## What this build changes

**Nothing.** Zero files touched in this path.

The Career Studio publishes nothing, mints no snapshot, and adds no public route. Plan §54-L
("existing `/portfolio/share/:token` → still works or tested approved migration") is satisfied
by the strongest available form: the code path is untouched and its test
(`__tests__/services/portfolioShareService.test.ts`) still passes unmodified.

## Deliberate tension, recorded

The existing share is **project-level**; the plan's target public portfolio is **person-level**
(`/talent/:slug`). Those will eventually coexist and need a documented migration
(`MIGRATION_STRATEGY.md`). This increment does not force that decision, because it does not
build a public surface at all. That is the cheapest possible way to avoid regressing a live
employer-facing link.
