Checkbox for forms, filters, and consent — leaf-green when checked.

```jsx
<Checkbox label="Email me about new cohorts" defaultChecked />
<Checkbox label="I agree to the terms" required />
<Checkbox label="Unavailable" disabled />
```

Pass `label` (or children) for the text. All native checkbox props (`checked`, `defaultChecked`, `onChange`, `disabled`, `required`) pass through.
