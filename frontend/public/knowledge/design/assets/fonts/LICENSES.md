# Font licenses

The Colaberry design system uses three typefaces, currently loaded from the **Google Fonts CDN**
via `tokens/fonts.css`. All three are free and self-hostable. To self-host, download the `.woff2`
files into this folder and replace the `@import` in `tokens/fonts.css` with local `@font-face` rules.

| Font | Role | License | Source |
|---|---|---|---|
| **Roboto** | Display + body | Apache License 2.0 | https://fonts.google.com/specimen/Roboto |
| **Roboto Mono** | Code / data | Apache License 2.0 | https://fonts.google.com/specimen/Roboto+Mono |
| **Quicksand** | *olaberry* logotype only | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Quicksand |

- **Apache-2.0** and **SIL OFL-1.1** both permit free use, embedding, and self-hosting in commercial work.
- Keep this notice with the font files if you redistribute them.

> Quicksand is used here as the closest open-source match to Colaberry's custom *olaberry* logotype.
> If the original logotype font is available, substitute it and update `tokens/typography.css`.
