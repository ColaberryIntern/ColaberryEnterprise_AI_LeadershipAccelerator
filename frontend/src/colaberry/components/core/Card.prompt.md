Rounded surface container for grouping content — program cards, stats, callouts.

```jsx
<Card hoverable media="/assets/course.jpg">
  <Badge tone="blue">Data Analytics</Badge>
  <h3>12-week Bootcamp</h3>
  <p>Instructor-led, project-based, job-ready.</p>
  <Button>Apply now</Button>
</Card>

<Card padded accent="green" elevation="md">…</Card>
```

`elevation`: flat / sm / md. `accent`: red / green / blue top border. Pass `media` (URL or node) for a 16:9 header — body padding is applied automatically. Use `padded` for a plain padded card, `hoverable` for clickable cards.
