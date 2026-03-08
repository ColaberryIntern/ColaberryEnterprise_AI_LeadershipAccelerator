/**
 * Link Scanner Utility
 * Scans frontend source files for fetch() API calls and extracts endpoint patterns.
 * Cross-references against registered Express routes.
 */

import fs from 'fs';
import path from 'path';
import type { Application } from 'express';

export interface ApiCallInfo {
  endpoint: string;
  file: string;
  line: number;
  method: string;
  matchedRoute: boolean;
}

/**
 * Recursively find all .tsx and .ts files in a directory.
 */
function findFiles(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        results.push(...findFiles(fullPath, ext));
      } else if (entry.isFile() && ext.some(e => entry.name.endsWith(e))) {
        results.push(fullPath);
      }
    }
  } catch { /* directory may not exist */ }
  return results;
}

/**
 * Extract API endpoints from frontend source files.
 */
export function scanFrontendApiCalls(frontendSrcDir: string): ApiCallInfo[] {
  const files = findFiles(frontendSrcDir, ['.tsx', '.ts', '.jsx', '.js']);
  const results: ApiCallInfo[] = [];

  // Pattern: fetch(`${apiUrl}/api/... or fetch(`/api/...
  const fetchPattern = /fetch\s*\(\s*[`'"]([^`'"]*\/api\/[^`'"]*)[`'"]/g;
  const templatePattern = /fetch\s*\(\s*`\$\{[^}]+\}(\/api\/[^`]*)`/g;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match direct fetch calls
        let match;
        const patterns = [fetchPattern, templatePattern];
        for (const pattern of patterns) {
          pattern.lastIndex = 0;
          while ((match = pattern.exec(line)) !== null) {
            let endpoint = match[1];
            // Normalize: replace template expressions with :param
            endpoint = endpoint.replace(/\$\{[^}]+\}/g, ':param');
            // Determine method from surrounding context
            const method = determineMethod(lines, i);

            results.push({
              endpoint,
              file: path.relative(frontendSrcDir, file),
              line: i + 1,
              method,
              matchedRoute: false, // Will be filled in by cross-reference
            });
          }
        }
      }
    } catch { /* skip unreadable files */ }
  }

  return results;
}

/**
 * Determine HTTP method from surrounding code context.
 */
function determineMethod(lines: string[], lineIdx: number): string {
  // Check current and next few lines for method specification
  const context = lines.slice(lineIdx, Math.min(lineIdx + 5, lines.length)).join(' ');
  if (/method\s*:\s*['"]DELETE/i.test(context)) return 'DELETE';
  if (/method\s*:\s*['"]PUT/i.test(context)) return 'PUT';
  if (/method\s*:\s*['"]PATCH/i.test(context)) return 'PATCH';
  if (/method\s*:\s*['"]POST/i.test(context)) return 'POST';
  return 'GET';
}

/**
 * Cross-reference frontend API calls against registered routes.
 */
export function crossReferenceRoutes(
  apiCalls: ApiCallInfo[],
  registeredRoutes: { method: string; path: string }[]
): ApiCallInfo[] {
  return apiCalls.map(call => {
    // Normalize endpoint for matching
    const normalizedEndpoint = call.endpoint
      .replace(/:param/g, ':id')
      .replace(/\/+$/, '');

    const matched = registeredRoutes.some(route => {
      // Convert route path params to generic pattern
      const routePattern = route.path
        .replace(/:[^/]+/g, '[^/]+')
        .replace(/\//g, '\\/');
      const regex = new RegExp(`^${routePattern}$`);
      return route.method === call.method && regex.test(normalizedEndpoint);
    });

    return { ...call, matchedRoute: matched };
  });
}
