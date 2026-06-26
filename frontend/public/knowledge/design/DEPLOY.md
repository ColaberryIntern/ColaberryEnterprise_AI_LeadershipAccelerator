# Deploying the Colaberry Design System

This repo is a **static, dependency-free site** — `index.html` (the landing page) and
`design-system.html` (the living docs) at the root, with CSS/JS/asset files beside them.
That means you can host it anywhere that serves static files. No build step required.

---

## 1 · Push it to GitHub

From the project folder (the one containing `index.html`):

```bash
git init
git add .
git commit -m "Colaberry Design System v1.0"
git branch -M main
git remote add origin https://github.com/<your-account>/colaberry-design-system.git
git push -u origin main
```

> Create the empty `colaberry-design-system` repo on GitHub first (no README/license —
> this repo already has them). Replace `<your-account>` with `colaberry` or your username.

If the remote already exists, just `git remote set-url origin <url>` instead of `add`.

---

## 2 · Turn on GitHub Pages (free hosting)

A workflow is already included at `.github/workflows/deploy.yml`. Once pushed:

1. Repo → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. The "Deploy to GitHub Pages" action runs on every push to `main`.
4. Your site goes live at:
   `https://<your-account>.github.io/colaberry-design-system/`

The landing page is `index.html`; the docs are at `/design-system.html`.

> Prefer the classic Pages mode? Settings → Pages → Source: **Deploy from a branch** →
> `main` / `/ (root)`. The workflow path is recommended, though.

---

## 3 · Other one-click hosts (optional)

All work with zero configuration — point them at the repo and deploy:

| Host | How |
|---|---|
| **Netlify** | "Add new site → Import from Git" → pick the repo → leave build empty, publish dir `/` |
| **Vercel** | "Add New → Project" → import repo → Framework preset **Other**, output dir `/` |
| **Cloudflare Pages** | "Create application → Pages" → connect repo → no build command, output `/` |
| **Surge** | `npm i -g surge && surge .` |

---

## 4 · Use it as a dependency in another project

After it's on GitHub you can vendor it into an app:

```bash
# inside your app
git submodule add https://github.com/<your-account>/colaberry-design-system.git vendor/colaberry
```

```html
<link rel="stylesheet" href="/vendor/colaberry/styles.css">
<script src="/vendor/colaberry/_ds_bundle.js"></script>
```

Full integration steps (plain HTML, React/Vite/Next, tokens, dark mode) are in
[`IMPLEMENTATION.md`](IMPLEMENTATION.md).

---

## 5 · Verify before you ship

- [ ] `index.html` opens locally (`npm start` → http://localhost:3000) with no console errors
- [ ] Fonts render (Roboto / Roboto Mono / Quicksand) — or self-host per `assets/fonts/LICENSES.md`
- [ ] Logos load from `assets/logo/`
- [ ] Pages build succeeds (green check in the **Actions** tab)
- [ ] The live URL shows the landing page and `/design-system.html` shows the docs

That's it — your design system is live and shareable. 🎉
