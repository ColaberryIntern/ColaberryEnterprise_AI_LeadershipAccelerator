import React from 'react';

/**
 * Suspense fallback for lazily-loaded route bundles.
 *
 * Admin and portal pages are code-split (see routes/adminRoutes.tsx and
 * routes/portalRoutes.tsx), so navigating to one can briefly wait on a chunk
 * download. This is what shows during that window.
 *
 * Deliberately quiet: a spinner that flashes on every route change reads as
 * slowness even when the chunk arrives in 50ms. This renders nothing for the
 * first 300ms and only then shows an indicator, so fast navigations are
 * visually silent.
 */
export default function RouteLoading(): React.ReactElement {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 150ms ease-in',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          border: '3px solid rgba(15, 23, 42, 0.15)',
          borderTopColor: 'rgba(15, 23, 42, 0.55)',
          borderRadius: '50%',
          animation: visible ? 'cb-route-spin 700ms linear infinite' : 'none',
        }}
      />
      <span className="visually-hidden">Loading page</span>
      <style>{'@keyframes cb-route-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
