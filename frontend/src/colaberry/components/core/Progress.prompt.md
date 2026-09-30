Progress bar with an animated fill — course completion, uploads, multi-step flows.

```jsx
<Progress label="Course progress" value={68} showValue />
<Progress tone="blue" indeterminate />
```

`value`/`max` for determinate; `indeterminate` for an in-flight loop. `tone`: red (default), green, blue. `showValue` prints the %.
