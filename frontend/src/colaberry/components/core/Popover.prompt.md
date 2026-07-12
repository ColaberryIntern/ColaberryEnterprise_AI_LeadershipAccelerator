Click-triggered floating panel — menus, quick forms, help bubbles. Closes on outside-click or Esc.

```jsx
<Popover placement="bottom" trigger={<Button>Help</Button>}>
  <strong>Need a hand?</strong>
  <p>Talk to an advisor — no pressure.</p>
</Popover>
```

`trigger` is the clickable node; children are the panel content. `placement`: bottom (default), top, right.
