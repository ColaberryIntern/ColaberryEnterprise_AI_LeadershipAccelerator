Path navigation showing where the user is in a hierarchy.

```jsx
<Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Programs', href: '/p' }, { label: 'Data Analytics' }]} />
```

Each item is `{ label, href? }`. The last item renders as the current page (no link).
