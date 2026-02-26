---
name: fixing-accessibility
description: Audit and fix WCAG 2.1 AA accessibility issues in React components. Invoke for accessibility reviews, screen reader support, keyboard navigation, color contrast, and ARIA attributes.
user-invocable: true
---

# Fixing Accessibility — WCAG 2.1 AA Audit & Remediation

## Before You Start

1. **Always read the target file(s)** before auditing. Never audit from memory.
2. Read `frontend/src/styles/responsive.css` to understand existing accessibility patterns.
3. Read `frontend/src/styles/global.css` for the skip-nav and focus indicator patterns already in place.

---

## 12-Point Audit Checklist

Run each check against the target component. Report findings using the output format below.

### 1. Color Contrast (WCAG 1.4.3)
- Text on background must meet **4.5:1** ratio (normal text) or **3:1** (large text ≥18px bold / ≥24px)
- Check: `--color-text` (#2d3748) on `--color-bg` (#ffffff) = **10.2:1** (passes)
- Check: `--color-text-light` (#718096) on `--color-bg` (#ffffff) = **4.6:1** (passes, barely)
- Watch for: `.text-muted` on colored backgrounds, badge text on badge backgrounds, placeholder text

### 2. Semantic HTML (WCAG 1.3.1)
- Use `<button>` for clickable actions, not `<span>` or `<div>` with onClick
- Use `<a>` for navigation, `<button>` for actions
- Use `<table>` with `<thead>`, `<th>` for tabular data
- Use `<nav>`, `<main>`, `<header>`, `<footer>`, `<section>`, `<article>` landmarks

### 3. ARIA Attributes (WCAG 4.1.2)
- Interactive elements need accessible names: `aria-label`, `aria-labelledby`, or visible label
- Dynamic content: `aria-live="polite"` for status updates, `aria-live="assertive"` for errors
- Modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title
- Tabs: `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`

### 4. Keyboard Navigation (WCAG 2.1.1)
- All interactive elements reachable via Tab
- Custom widgets: arrow keys for navigation within groups
- Escape closes modals/dropdowns
- No keyboard traps
- Visible focus indicator (already implemented: 3px solid `--color-primary-light`)

### 5. Form Labels (WCAG 1.3.1, 3.3.2)
- Every `<input>`, `<select>`, `<textarea>` must have an associated `<label>` (via `htmlFor`) or `aria-label`
- Group related controls with `<fieldset>` and `<legend>`
- Error messages linked via `aria-describedby`

### 6. Image Alt Text (WCAG 1.1.1)
- Meaningful images: descriptive `alt` attribute
- Decorative images: `alt=""` and `aria-hidden="true"`
- Icons used as buttons: `aria-label` on the button, `aria-hidden="true"` on the icon

### 7. Touch Targets (WCAG 2.5.8)
- Minimum 44x44px for interactive elements on touch devices
- Already enforced in `responsive.css` for buttons and form controls under 992px
- Check: small icon buttons, inline action links, checkbox/radio inputs

### 8. Reduced Motion (WCAG 2.3.3)
- Already implemented in `responsive.css` with `prefers-reduced-motion: reduce`
- Verify: no CSS animations bypass this media query
- Verify: no JavaScript animations ignore `matchMedia('(prefers-reduced-motion: reduce)')`

### 9. High Contrast (WCAG 1.4.11)
- Already implemented in `responsive.css` with `prefers-contrast: high`
- Verify: custom styled components respect high contrast mode
- Check: borders on cards, visibility of subtle UI elements

### 10. Live Regions (WCAG 4.1.3)
- Loading spinners: wrap with `aria-live="polite"` and `aria-busy="true"`
- Toast/alert messages: `role="alert"` or `aria-live="assertive"`
- Status updates (e.g., "Settings Saved!"): `aria-live="polite"`

### 11. Heading Hierarchy (WCAG 1.3.1)
- One `<h1>` per page
- No skipped levels (h1 → h3 without h2)
- Headings used for structure, not just styling (use utility classes for visual size)

### 12. Skip Navigation (WCAG 2.4.1)
- Already implemented: `.skip-nav` class in `global.css`
- Verify: skip link targets correct `#main-content` anchor
- Verify: skip link is first focusable element

---

## Output Format

Report findings as a numbered list:

```
### Accessibility Audit: [ComponentName]

1. **[Critical]** Missing form label on search input (line 42)
   - Issue: `<input>` has no associated label or aria-label
   - Fix: Add `aria-label="Search leads"` to the input element

2. **[Major]** Non-semantic click handler (line 67)
   - Issue: `<span onClick={...}>` used for interactive element
   - Fix: Replace with `<button className="btn btn-link p-0">`

3. **[Minor]** Missing aria-live on save confirmation (line 85)
   - Issue: "Settings Saved!" text not announced to screen readers
   - Fix: Wrap in `<span aria-live="polite">`
```

### Severity Levels

| Level | Definition |
|---|---|
| **Critical** | Blocks access entirely for assistive technology users |
| **Major** | Significant barrier; workaround may exist but is unreliable |
| **Minor** | Inconvenience; does not block access but degrades experience |

---

## Common Fixes in This Codebase

### Icon-only buttons (common in tables)
```tsx
// Before (inaccessible)
<button className="btn btn-outline-danger btn-sm" onClick={onRemove}>x</button>

// After
<button className="btn btn-outline-danger btn-sm" onClick={onRemove} aria-label="Remove lead">
  <span aria-hidden="true">x</span>
</button>
```

### Clickable names without button semantics
```tsx
// Before
<span style={{ cursor: 'pointer' }} onClick={() => selectLead(id)}>{name}</span>

// After
<button className="btn btn-link p-0 text-start" onClick={() => selectLead(id)}>{name}</button>
```

### Modal accessibility
```tsx
<div className="modal show d-block" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div className="modal-dialog">
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title" id="modal-title">Title</h5>
        <button className="btn-close" onClick={onClose} aria-label="Close" />
      </div>
    </div>
  </div>
</div>
```

### Loading states
```tsx
<div aria-live="polite" aria-busy={loading}>
  {loading ? (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  ) : (
    <>{/* content */}</>
  )}
</div>
```
