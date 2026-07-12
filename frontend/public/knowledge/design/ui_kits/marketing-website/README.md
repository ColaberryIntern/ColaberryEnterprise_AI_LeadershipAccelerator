# Marketing Website — UI kit

A high-fidelity, interactive recreation of the Colaberry marketing site, built on the design-system
tokens and the core React components.

**Open `index.html`** — a click-through with three views:

| View | What it shows |
|---|---|
| **Home** | Hero, trust stats, two program cards + accelerator, "How it works" steps, a student testimonial, and a cherry CTA band. |
| **Program** (Data Analytics) | Breadcrumb, program hero with a sticky tuition card, expandable curriculum modules, tools, FAQ accordion, CTA. |
| **Enroll** | Two-column application form (program picker, fields, consent) with a live summary card and a success state on submit. |

Navigate via the header links, the hero CTAs, or the "Apply now" buttons. Submitting the form shows the success screen.

## Files
- `index.html` — shell: loads tokens, `site.css`, Lucide, React + Babel, `_ds_bundle.js`, then the JSX parts, and mounts the view-switching `App`.
- `parts.jsx` — `Logo`, `Header`, `Footer`, and the React-safe Lucide `Icon` / `I` wrapper.
- `home.jsx` — `HomeView` + the `Photo` placeholder.
- `program-enroll.jsx` — `ProgramView` + `EnrollView`.
- `site.css` — all kit-specific layout, built entirely on the design-system tokens.

## Notes
- Components (Button, Card, Badge, Avatar, Input, Checkbox) come from the system bundle —
  the kit does **not** re-implement them.
- Imagery uses **labeled gradient placeholders** (`Photo`). Swap in real student/instructor photos to finalize.
- Icons are Lucide via a wrapper that React never reconciles, so view changes don't crash.
