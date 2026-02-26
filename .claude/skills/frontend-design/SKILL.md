---
name: frontend-design
description: Generate React + Bootstrap 5 frontend components and pages following the project design system. Invoke for any new page, component, layout, or visual modification.
user-invocable: true
---

# Frontend Design — Component & Page Generator

## Workflow

Follow these steps for every frontend task:

1. **Read the target file** (if modifying existing code)
2. **Read `frontend/src/styles/global.css`** for design tokens and custom classes
3. **Reference the baseline-ui skill** mentally for component patterns
4. **Use Bootstrap 5 utility classes** — no custom CSS unless a class already exists in `global.css`
5. **Match existing patterns** from similar pages in the codebase
6. **Write TypeScript** with proper interfaces for all props and data structures

---

## Project Stack

- **React 18** with functional components and hooks
- **TypeScript** — all components must have typed props interfaces
- **Bootstrap 5** via CDN — utility-first styling, no CSS modules
- **Recharts** — for charts and data visualization
- **React Router v6** — `useParams`, `useNavigate`, `useLocation`
- **Auth**: `useAuth()` hook from `frontend/src/contexts/AuthContext.tsx` provides `{ token, user }`
- **API calls**: `fetch('/api/admin/...',  { headers: { Authorization: 'Bearer ' + token } })`

---

## Reference Template Files

Study these files to understand established patterns:

### Table + Filter + Pagination + Batch Actions
**File**: `frontend/src/pages/admin/AdminLeadsPage.tsx`
- Search input + filter dropdowns + action buttons in a flex bar
- `table-responsive > table table-hover mb-0` with `thead table-light`
- Checkbox selection with `Set<number>` state
- Batch action bar appears when items selected
- Pagination controls at bottom

### Tab Shell + KPI Cards
**File**: `frontend/src/pages/admin/AdminCampaignDetailPage.tsx`
- Header with name, badges, action buttons
- `nav nav-tabs mb-4` for tab navigation
- KPI stat cards in `row g-3` with `col-md-3` or `col-md-4`
- Each tab renders a separate component

### Card Columns (Pipeline/Kanban)
**File**: `frontend/src/pages/admin/AdminPipelinePage.tsx`
- `row g-3` with `col-md-*` for column layout
- Cards inside each column with status-colored headers
- Draggable/clickable cards with lead summary info

### Reusable Badge Component
**File**: `frontend/src/components/TemperatureBadge.tsx`
- Small functional component with typed props
- Maps data values to Bootstrap badge classes
- Handles null/undefined gracefully

---

## Component Structure

```tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  campaignId: string;
  headers: Record<string, string>;
}

interface DataItem {
  id: number;
  name: string;
  // ... typed fields
}

export default function MyComponent({ campaignId, headers }: Props) {
  const [data, setData] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [campaignId]);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/data`, { headers });
      const json = await res.json();
      setData(json.data || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  return (
    <>
      {/* Content */}
    </>
  );
}
```

---

## Layout Rules

### Grid
- Use `row g-3` for grid rows with gutters
- Use `col-md-*` for responsive columns (stacks on mobile)
- Common splits: `col-md-3` (4-up), `col-md-4` (3-up), `col-md-6` (2-up)

### Spacing
- Cards: `mb-4` between sections
- Filter bars: `mb-3` below
- Button groups: `d-flex gap-2`
- Inline badges: `d-flex gap-2 align-items-center`

### Responsive
- Tables: always wrap in `div.table-responsive`
- Inputs: `form-control-sm` or `form-select-sm` for compact admin forms
- Constrain filter widths: `style={{ maxWidth: 150 }}`
- Stack on mobile: rely on Bootstrap `col-md-*` grid, no custom breakpoints

---

## Do's and Don'ts

### Do
- Use `border-0 shadow-sm` on all cards
- Use `bg-white fw-semibold` on card headers
- Use `table-light` on thead
- Use `btn-sm` for all admin action buttons
- Use `small` or `text-muted` for secondary information
- Use `form-control-sm` and `form-select-sm` for admin forms
- Provide loading spinners for async data
- Handle empty states with centered muted text

### Don't
- Write custom CSS — use Bootstrap utilities or existing `global.css` classes
- Hardcode colors — use CSS variables or Bootstrap classes
- Use inline styles except for `maxWidth`, `maxHeight`, `cursor`, `fontSize` tweaks
- Create new layout wrappers — use existing `AdminLayout` shell
- Skip TypeScript interfaces for props or data structures
- Use `any` type unless wrapping an untyped API response
