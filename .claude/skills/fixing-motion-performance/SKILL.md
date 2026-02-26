---
name: fixing-motion-performance
description: Optimize CSS animations, React rendering, and bundle performance. Invoke for animation jank, slow renders, large bundle size, or transition issues.
user-invocable: true
---

# Fixing Motion & Performance

## Before You Start

1. Read the target file(s) to understand current implementation.
2. Read `frontend/src/styles/global.css` for existing animation patterns.
3. Read `frontend/src/styles/responsive.css` for the `prefers-reduced-motion` rule.

---

## CSS Animation Rules

### GPU-Composited Properties Only
Only animate properties that trigger compositing, not layout or paint:

| Safe (Composite) | Avoid (Layout/Paint) |
|---|---|
| `transform` | `width`, `height` |
| `opacity` | `top`, `left`, `right`, `bottom` |
| `filter` | `margin`, `padding` |
| | `border-width` |
| | `font-size` |

### Transition Duration Limits
- **Micro-interactions** (hover, focus): 150–250ms
- **Content transitions** (fade, slide): 250–400ms
- **Maximum**: 600ms — anything longer feels sluggish
- **Easing**: `ease-out` for entrances, `ease-in` for exits, `ease` for hover states

### Existing Animation Patterns (global.css)

**Card lift** (`.card-lift`):
```css
transition: transform 0.25s ease, box-shadow 0.25s ease;
/* hover: translateY(-4px) + deeper shadow */
```

**Fade-in section** (`.fade-in-section`):
```css
opacity: 0;
transform: translateY(24px);
transition: opacity 0.6s ease-out, transform 0.6s ease-out;
/* .is-visible: opacity 1, translateY(0) */
```

### Respect prefers-reduced-motion
The project already has a global rule in `responsive.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

For JavaScript animations, check the preference:
```ts
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

---

## React Rendering Optimization

### Memoize Expensive Computations
```tsx
// Before: recalculates on every render
const filtered = leads.filter(l => l.status === filterStatus);
const sorted = filtered.sort((a, b) => b.score - a.score);

// After: only recalculates when dependencies change
const filtered = useMemo(
  () => leads.filter(l => l.status === filterStatus).sort((a, b) => b.score - a.score),
  [leads, filterStatus]
);
```

### Stabilize Callback References
```tsx
// Before: new function every render, causes child re-renders
<LeadRow onRemove={(id) => handleRemove(id)} />

// After: stable reference
const handleRemoveCallback = useCallback((id: number) => handleRemove(id), []);
<LeadRow onRemove={handleRemoveCallback} />
```

### Memo List Item Components
```tsx
// Wrap frequently re-rendered list items
const LeadRow = React.memo(function LeadRow({ lead, onRemove }: Props) {
  return <tr>...</tr>;
});
```

### Lazy-Load Heavy Libraries (Recharts)
```tsx
import { lazy, Suspense } from 'react';

const AnalyticsTab = lazy(() => import('./components/campaign/AnalyticsTab'));

// Usage
<Suspense fallback={<div className="spinner-border text-primary" />}>
  <AnalyticsTab analytics={analytics} loading={analyticsLoading} />
</Suspense>
```

### Avoid Unnecessary State Updates
```tsx
// Before: causes re-render even if value hasn't changed
setFilterStatus(e.target.value);

// After: skip if unchanged
const newVal = e.target.value;
if (newVal !== filterStatus) setFilterStatus(newVal);
```

---

## Bundle Performance

### Named Imports (Tree-Shaking)
```tsx
// Before: imports entire library
import * as Recharts from 'recharts';

// After: named imports allow tree-shaking
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
```

### Check for Duplicate Dependencies
```bash
# Identify duplicates in node_modules
npx npm-dedupe
# Or check bundle
npx webpack-bundle-analyzer dist/static/js/*.js
```

### Image Optimization
- Use WebP format where possible
- Lazy-load below-the-fold images: `loading="lazy"`
- Set explicit `width` and `height` to prevent layout shift

---

## Diagnostic Checklist

When called to investigate a performance issue:

1. **Identify the symptom**: jank, slow load, large bundle, unresponsive UI
2. **Read the target file(s)** to understand current implementation
3. **Check for**:
   - Layout-triggering animations (non-composited properties)
   - Missing `useMemo` / `useCallback` on expensive operations
   - Unnecessary re-renders (new object/array references in props)
   - Large synchronous data processing in render
   - Unthrottled event handlers (scroll, resize, input)
   - Missing lazy loading for heavy components
4. **Apply fixes** using the patterns above
5. **Verify** `prefers-reduced-motion` is still respected after changes
