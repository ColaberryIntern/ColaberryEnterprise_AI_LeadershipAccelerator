Data table with a styled header and hover rows — cohorts, outcomes, dashboards.

```jsx
<Table
  columns={[
    { key: 'name', header: 'Cohort' },
    { key: 'wk', header: 'Weeks', align: 'right' },
    { key: 'st', header: 'Status', render: (v) => <Badge tone="green">{v}</Badge> },
  ]}
  data={[{ name: 'Data Analytics', wk: 12, st: 'Open' }]}
/>
```

`columns` are `{ key, header, align?, render? }`; `render(value, row)` customizes a cell.
