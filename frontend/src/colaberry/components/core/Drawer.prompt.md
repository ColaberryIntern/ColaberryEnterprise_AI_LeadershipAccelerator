Slide-in panel anchored to a screen edge — filters, nav, detail views. Locks scroll, manages focus, closes on scrim-click or Esc.

```jsx
const [open, setOpen] = React.useState(false);
<Drawer open={open} side="right" title="Filters" onClose={() => setOpen(false)}>
  <Checkbox label="Online" /><Switch label="Scholarships only" />
</Drawer>
```

`side`: right (default) or left. Controlled via `open`.
