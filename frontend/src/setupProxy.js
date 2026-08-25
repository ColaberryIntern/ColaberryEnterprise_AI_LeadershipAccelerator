/**
 * TEMPORARY LOCAL HARNESS FILE — created for the T022 browser verification run
 * and deleted when it finishes. It is untracked and must not be committed.
 *
 * WHY IT EXISTS. In production nginx serves the SPA and the API from one origin,
 * so a relative `fetch('/api/...')` reaches the backend. Running CRA on :3000
 * and the backend on :3101 breaks that: `AuthContext`'s relative
 * `fetch('/api/admin/me')` hits the CRA dev server, which answers 200 with
 * index.html, `r.json()` rejects, and the catch sets `meLoaded = true` with zero
 * sections — so `ProtectedRoute` bounces every admin route to
 * `/admin/change-password`. That is an artifact of the split origin, not a
 * defect in the admin surface, and proxying `/api` restores the production
 * shape rather than papering over it.
 *
 * NO MOUNT PATH, ON PURPOSE. `app.use('/api', proxy)` is the obvious spelling
 * and it is wrong: Express strips the mount path from `req.url` before the
 * handler sees it, so the backend received `GET /admin/me` and answered 404 with
 * an HTML error page. The first version of this file did exactly that, and the
 * admin walkthrough failed in a way that looked like a product defect. Filtering
 * with `pathFilter` instead leaves `req.url` intact.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  app.use(createProxyMiddleware({
    pathFilter: '/api',
    target: process.env.LOCAL_API_TARGET || 'http://127.0.0.1:3101',
    changeOrigin: true,
  }));
};
