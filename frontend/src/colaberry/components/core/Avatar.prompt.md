Circular avatar for students, instructors, testimonials — photo with a graceful initials fallback.

```jsx
<Avatar src="/students/mika.jpg" name="Mika Rivera" size="lg" />  {/* photo */}
<Avatar name="Owen Brooks" />                                     {/* initials */}
<Avatar name="Ada Lovelace" ring />                               {/* cherry ring */}
```

Pass `src` for a photo — the person's initials render underneath, so they show while the image loads and automatically if it fails (no empty circles). With no `src`, the initials sit on a stable brand-tone background derived from `name`. Sizes `xs`–`xl`. `name` also sets the accessible label. Wrap several in a `.cb-avatar-group` div for an overlapping stack.
