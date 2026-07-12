Pill-shaped button — use for any primary or secondary action; cherry-red is the default primary.

```jsx
<Button>Apply now</Button>
<Button variant="primary" tone="green">Enroll</Button>
<Button variant="outline">Download catalog</Button>
<Button variant="ghost" size="sm">Skip</Button>
<Button variant="link" href="#">Learn more</Button>
```

Variants: `primary` (cherry, with brand shadow), `solid`, `outline`, `ghost`, `link`.
Tone (solid/primary only): `red` (default), `green`, `blue`.
Sizes: `sm`, `md`, `lg`. Use `fullWidth` in forms/mobile. Pass `leadingIcon`/`trailingIcon` for icons. Renders an `<a>` automatically when `href` is set.
