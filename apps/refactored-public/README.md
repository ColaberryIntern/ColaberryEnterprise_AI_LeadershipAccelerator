# Refactored.ai — public skeleton

The platform underneath. Learn, build, operate, measure.

This is a **skeleton**, deliberately. Master plan §67 is explicit that the full product
is not in scope here: this app exists to prove that domain resolution, visitor tracking,
entry-point attribution, canonical lead creation, tenant context and authorization all
work end to end before anyone builds a real site on top of them.

## Build

```bash
npm run build          # emits dist/
```

No dependencies, no bundler. That is a decision, not an omission — see the comment at the
top of `packages/app-build/index.js`.

## What it proves

- `data-site="refactored"` resolves server-side to tenant `refactored` / brand `refactored`
- pageview, `cta_click`, `form_start` and `form_submit` events carry tenant/brand context
- the intake form writes to the canonical `leads` table and creates a `LeadTenantContext`
- the same person arriving from another brand does not become a second lead

## What it does not do

Nothing in `https://refactored.ai`'s real product surface. See [EXTRACTION.md](EXTRACTION.md)
for what would have to move with this app if it is ever lifted out.
