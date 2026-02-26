---
name: ui-ux-design
description: Comprehensive UI/UX design — user research, wireframes, mockups, prototyping, and design review. Invoke for new feature design, page redesign, UX audit, or user flow planning.
user-invocable: true
---

# UI/UX Design — Strategy, Research & Prototyping

## When to Use This Skill vs /frontend-design

| Use `/ui-ux-design` for | Use `/frontend-design` for |
|---|---|
| New feature exploration & ideation | Implementing a specific component |
| Page redesign research | Writing the actual React code |
| UX audit & heuristic evaluation | Modifying an existing page |
| User flow mapping | Adding a table, form, or card |
| Wireframing & layout planning | Styling adjustments |
| Design review & critique | Bug fixes in UI |

This skill is **strategic and exploratory**. Use `/frontend-design` when you're ready to write code.

---

## Target Audience

**Primary persona**: Enterprise executives, aged 35–60
- Tech-savvy but time-constrained
- Values: clarity, authority, professionalism
- Scans before reading — needs scannable information density
- Prefers clean, calm, authoritative interfaces over flashy/trendy
- Expects mobile access but primarily uses desktop

**Design tone**: Clean, calm, authoritative. Think Bloomberg Terminal meets Salesforce, not consumer SaaS.

---

## Design Principles

### 1. Progressive Disclosure
- Show summary first, detail on demand
- Use tabs, modals, and expandable sections
- KPI cards at top → detailed tables/charts below
- Don't overwhelm with data — let users drill down

### 2. Scannable Information Density
- Bold numbers for metrics, muted labels below
- Status badges for quick visual scanning
- Consistent color coding (green=good, red=attention, yellow=warning)
- Use whitespace generously — padding is not waste

### 3. Consistent Visual Language
- Every page follows the same card → table → modal hierarchy
- Same filter bar pattern across all list views
- Same badge styles for status, temperature, and type indicators
- Same loading spinner placement (centered, with primary color)

### 4. Predictable Interactions
- Click name → detail modal or detail page
- Click badge/status → filter by that value
- Bulk select via checkboxes → action bar appears
- Cancel/close always top-right or bottom-left

### 5. Error Prevention Over Error Handling
- Disable buttons when action isn't available
- Confirm destructive actions (delete, remove)
- Show validation inline, not after submission
- Gray out impossible states

---

## Capabilities

### User Research
- Define user personas and scenarios
- Map user journeys through the application
- Identify pain points and opportunities
- Competitive analysis of similar tools

### Wireframing
Create ASCII wireframes for layout exploration:

```
┌──────────────────────────────────────────────────┐
│ Page Title                        [Action] [More]│
├──────────────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                │
│ │ KPI │ │ KPI │ │ KPI │ │ KPI │                │
│ │  42 │ │ 87% │ │ $12K│ │  8  │                │
│ └─────┘ └─────┘ └─────┘ └─────┘                │
│                                                  │
│ [Search...] [Filter ▼] [Filter ▼]    [+ Add]    │
│                                                  │
│ ┌────────────────────────────────────────────┐   │
│ │ □  Name       Company    Score  Status     │   │
│ │ □  John Doe   Acme Inc   85     ●Active    │   │
│ │ □  Jane Smith BigCo      72     ○Paused    │   │
│ └────────────────────────────────────────────┘   │
│                          [← Prev] Page 1 [Next →]│
└──────────────────────────────────────────────────┘
```

### React Mockup Generation
Generate functional React components with realistic mock data for visual review before wiring up to the backend.

### Design Review
Evaluate existing pages against:
- The 5 design principles above
- WCAG 2.1 AA accessibility (delegate to `/fixing-accessibility` for detailed audit)
- Responsive behavior at all breakpoints
- Visual consistency with the design system

---

## Responsive Checkpoints

Test and consider layouts at these widths:

| Breakpoint | Width | Device | Key considerations |
|---|---|---|---|
| Mobile | 320px | Small phone | Single column, stacked cards, hamburger nav |
| Mobile | 375px | iPhone SE/13 | Most common mobile width |
| Tablet | 768px | iPad portrait | 2-column grid, condensed tables |
| Desktop | 1024px | Laptop | Full sidebar + content |
| Wide | 1920px | External monitor | Max-width container, no stretch |

---

## Design Deliverables

When invoked for a design task, provide:

1. **Context**: What problem are we solving? Who is the user?
2. **User flow**: Step-by-step journey through the feature
3. **Wireframe**: ASCII layout sketch showing information hierarchy
4. **Component inventory**: Which existing components to reuse, which to create
5. **Responsive notes**: How the layout adapts at each breakpoint
6. **Interaction notes**: Hover states, click targets, loading states, empty states, error states
7. **Accessibility notes**: Any special ARIA, keyboard, or screen reader considerations

---

## Project Design System Quick Reference

Refer to `/baseline-ui` skill for the complete design system. Key points:

- **Colors**: Navy primary (#1a365d), Red secondary (#e53e3e), Green accent (#38a169)
- **Cards**: `card border-0 shadow-sm` with `card-header bg-white fw-semibold`
- **Tables**: `table-responsive > table table-hover mb-0`, `thead table-light`
- **Badges**: `badge bg-{success|warning|info|secondary|danger}`
- **Buttons**: Always `btn-sm` in admin UI
- **Layout**: `AdminLayout` shell with dark navbar, `bg-light` main, `container py-4`
