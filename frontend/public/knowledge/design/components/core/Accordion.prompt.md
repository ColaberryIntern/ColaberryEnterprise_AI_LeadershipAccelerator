Vertically stacked, animated disclosure panels — FAQs, course modules, settings groups.

```jsx
<Accordion defaultOpen={[0]} items={[
  { title: 'What is included?', content: 'Live classes, mentorship, a portfolio project.' },
  { title: 'Do I need a degree?', content: 'No — a GED or diploma is all you need.' },
]} />
```

Single-open by default; pass `allowMultiple` to let several stay open. `defaultOpen` seeds open indices. Items are `{ title, content }`.
