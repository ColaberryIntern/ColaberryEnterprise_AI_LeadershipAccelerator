/**
 * Route Audit Utility
 * Extracts and validates all registered Express routes.
 * Returns a structured route map for admin inspection.
 */

import type { Application } from 'express';

export interface RouteInfo {
  method: string;
  path: string;
  middlewareCount: number;
  hasAuth: boolean;
}

export interface RouteAuditResult {
  totalRoutes: number;
  routesByMethod: Record<string, number>;
  routesByPrefix: Record<string, number>;
  routes: RouteInfo[];
  issues: { path: string; issue: string }[];
}

/**
 * Extract all routes from an Express application.
 */
export function extractRoutes(app: Application): RouteInfo[] {
  const routes: RouteInfo[] = [];

  function processStack(stack: any[], basePath: string = '') {
    for (const layer of stack) {
      if (layer.route) {
        // Direct route
        const path = basePath + (layer.route.path || '');
        const methods = Object.keys(layer.route.methods || {}).filter(m => layer.route.methods[m]);
        const middlewareCount = layer.route.stack?.length || 0;
        const hasAuth = layer.route.stack?.some((s: any) =>
          s.name === 'requireAdmin' || s.name === 'bound requireAdmin'
        ) || false;

        for (const method of methods) {
          routes.push({
            method: method.toUpperCase(),
            path,
            middlewareCount,
            hasAuth,
          });
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        // Nested router
        const prefix = layer.regexp?.source
          ?.replace('\\/?', '')
          ?.replace('(?=\\/|$)', '')
          ?.replace(/\\\//g, '/')
          ?.replace(/\^/, '')
          || '';
        processStack(layer.handle.stack, basePath + prefix);
      }
    }
  }

  const stack = (app as any)._router?.stack || [];
  processStack(stack);

  return routes;
}

/**
 * Generate a full route audit report.
 */
export function generateRouteAudit(app: Application): RouteAuditResult {
  const routes = extractRoutes(app);
  const issues: { path: string; issue: string }[] = [];

  // Count by method
  const routesByMethod: Record<string, number> = {};
  for (const route of routes) {
    routesByMethod[route.method] = (routesByMethod[route.method] || 0) + 1;
  }

  // Count by prefix
  const routesByPrefix: Record<string, number> = {};
  for (const route of routes) {
    const parts = route.path.split('/').filter(Boolean);
    const prefix = parts.length >= 3 ? `/${parts.slice(0, 3).join('/')}` : route.path;
    routesByPrefix[prefix] = (routesByPrefix[prefix] || 0) + 1;
  }

  // Check for issues
  const seen = new Set<string>();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;

    // Duplicate check
    if (seen.has(key)) {
      issues.push({ path: key, issue: 'Duplicate route registration' });
    }
    seen.add(key);

    // Auth check — admin routes should have auth
    if (route.path.startsWith('/api/admin/') && !route.hasAuth) {
      // Skip login/logout which are intentionally public
      if (!route.path.includes('/login') && !route.path.includes('/logout')) {
        issues.push({ path: key, issue: 'Admin route missing requireAdmin middleware' });
      }
    }
  }

  return {
    totalRoutes: routes.length,
    routesByMethod,
    routesByPrefix,
    routes,
    issues,
  };
}

/**
 * Generate route map as structured data (for JSON response).
 */
export function generateRouteMap(app: Application): RouteInfo[] {
  return extractRoutes(app).sort((a, b) => a.path.localeCompare(b.path));
}
