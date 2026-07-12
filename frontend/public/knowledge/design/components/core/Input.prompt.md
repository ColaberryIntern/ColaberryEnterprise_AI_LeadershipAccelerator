Labelled text input for forms — enrollment, contact, search.

```jsx
<Input label="Full name" placeholder="Ada Lovelace" required />
<Input label="Email" type="email" helperText="We'll send your catalog here." />
<Input label="Why data?" multiline rows={3} />
<Input label="Phone" error="Enter a valid number." />
```

Sizes `sm` / `md` / `lg`. Pass `error` to switch into the error style with a red message, `helperText` for neutral guidance, `multiline` for a textarea. All native input/textarea props pass through.
