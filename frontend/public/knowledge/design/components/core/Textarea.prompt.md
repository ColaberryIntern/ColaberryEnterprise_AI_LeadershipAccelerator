Multi-line text field with optional label, error/helper text, and a live character counter.

```jsx
<Textarea label="Why data?" placeholder="A sentence or two…" maxLength={200} />
<Textarea label="Notes" error="This field is required." />
```

Set `maxLength` to show a live counter. `error` switches to the error style and is linked via `aria-describedby`.
