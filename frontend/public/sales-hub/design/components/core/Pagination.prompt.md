Page navigation with prev/next and truncated number pills (current page = cherry).

```jsx
const [page, setPage] = React.useState(1);
<Pagination page={page} total={9} onChange={setPage} />
```

`siblings` controls how many pages show around the current one. `onChange(page)` fires on click.
