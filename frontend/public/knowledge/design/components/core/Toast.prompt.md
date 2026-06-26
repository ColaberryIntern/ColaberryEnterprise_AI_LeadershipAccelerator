Notification that slides in bottom-center — confirmations, errors, info.

```jsx
const [open, setOpen] = React.useState(false);
<Toast open={open} variant="success" title="Application sent" onClose={() => setOpen(false)}>
  We'll be in touch within a day.
</Toast>
```

`variant`: neutral (default), success, danger, info. Controlled via `open`. Pass `static` to render it in normal flow instead of fixed.
