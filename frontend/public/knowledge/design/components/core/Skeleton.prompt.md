Loading placeholder that shimmers — show while data loads instead of a spinner.

```jsx
<Skeleton variant="circle" width={48} height={48} />
<Skeleton variant="text" width="80%" />
<Skeleton variant="rect" height={120} />
```

`variant`: text (default), circle, rect. Size with `width`/`height` (number = px, or any CSS string).
