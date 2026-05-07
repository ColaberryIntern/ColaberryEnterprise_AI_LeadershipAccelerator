# UI_CONTRACT.md
## UI telemetry contract

**Version:** 1.0
**Status:** Active (Phase 3)
**Schema:** [`ui_contract.schema.json`](../../ui/ui_contract.schema.json)
**Map:** [`ui_map.json`](../../ui/ui_map.json)

---

## 1. What ui_map captures

The UI map is the declarative inventory of the project's user-facing surface:

- **Pages** — top-level routes
- **Components** — reusable UI building blocks
- **Actions** — user-triggerable operations on pages
- **UX debt** — known issues, rough edges, ad-hoc workarounds
- **Visual review items** — captured screenshots + critique notes
- **Accessibility warnings** — WCAG 2.1 AA gaps
- **Critical workflows** — golden paths that must always work

This is the input to UI Advisor, accessibility audits, and Visual Critique OS.

---

## 2. Top-level shape

```json
{
  "ui_version": "1.0",
  "project_id": "uuid",
  "generated_at": "ISO-8601",
  "source": "manifest" | "declared" | "discovered",

  "pages": [
    {
      "route": "/admin/dashboard",
      "component_file": "frontend/src/pages/admin/AdminDashboard.tsx",
      "title": "Admin Dashboard",
      "category": "admin" | "public" | "portal" | "internal",
      "bp_id": "uuid | null",
      "actions": [
        { "id": "...", "label": "Run sync", "kind": "button" | "form" | "link", "handler": "..." }
      ],
      "critical_workflows": ["string"],
      "accessibility_warnings": ["WCAG-1.4.3 contrast on primary cta"],
      "ux_debt": ["dropdown sort doesn't persist across reloads"]
    }
  ],

  "components": [
    {
      "name": "ProcessGrid",
      "file": "frontend/src/components/project/ProcessGrid.tsx",
      "kind": "widget" | "form" | "modal" | "page" | "layout",
      "used_by_pages": ["/portal/project"]
    }
  ],

  "visual_reviews": [
    {
      "review_id": "uuid",
      "page_route": "/admin/dashboard",
      "screenshot_path": "system/ui/visual_reviews/.../shot.png",
      "critique_summary": "string",
      "items": [
        { "kind": "spacing" | "alignment" | "color" | "type" | "interaction" | "accessibility",
          "severity": "low" | "medium" | "high",
          "description": "string",
          "ai_suggestion": "string | null" }
      ]
    }
  ]
}
```

---

## 3. Source layering

UI maps merge from:

1. **Manifest telemetry** — `ui_components_added` / `frontend_routes_added` from
   recent manifests
2. **Declared map** — manually-curated `ui_map.json` (high signal, hand-edited)
3. **Discovered** — repo-tree scanning for `pages/**/*.tsx` (fallback)

The synchronizer (`uiSynchronizer.ts`) writes the merged result to the project
snapshot.

---

## 4. Visual reviews

Schema: [`visual_review.schema.json`](../../ui/visual_reviews/visual_review.schema.json)

Visual reviews are stored as both:
- A row in `visual_reviews` (TBD; foundation only in V1)
- A reference file at `system/ui/visual_reviews/{review_id}.json` for git history

Each review references the manifest that produced it (when applicable) and the
page route it critiques.

---

## 5. UX debt format

`ux_debt` entries are short imperative sentences — the change required, not the
problem. Good: `"persist sort across reloads"`. Bad: `"sort doesn't work right"`.

---

## 6. Forbidden patterns

- Inventing a parallel UI catalog. Extend `ui_map.json`.
- Adding component metadata that the schema doesn't support — add the field to
  the schema first.
- Storing screenshot binaries in git. Use `system/ui/visual_reviews/` as a
  reference folder; production screenshots live in object storage.
