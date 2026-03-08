/**
 * Documentation Generator
 * Generates architecture and API documentation from live system state.
 */

import { sequelize } from '../config/database';
import type { Application } from 'express';

/**
 * Generate architecture documentation in markdown format.
 */
export function generateArchitectureDoc(): string {
  const models = Object.keys(sequelize.models).sort();
  const lines: string[] = [];

  lines.push('# Architecture Documentation');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('## Models');
  lines.push(`Total: ${models.length}`);
  lines.push('');

  for (const modelName of models) {
    const model = sequelize.models[modelName];
    const attrs = Object.keys(model.rawAttributes || {});
    const associations = Object.keys(model.associations || {});

    lines.push(`### ${modelName}`);
    lines.push(`- Table: \`${(model as any).tableName || modelName}\``);
    lines.push(`- Columns: ${attrs.join(', ')}`);
    if (associations.length > 0) {
      lines.push(`- Associations: ${associations.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Association Map');
  lines.push('');
  for (const modelName of models) {
    const model = sequelize.models[modelName];
    const assocs = model.associations || {};
    for (const [alias, assoc] of Object.entries(assocs)) {
      const target = (assoc as any).target?.name || 'unknown';
      const type = (assoc as any).associationType || 'unknown';
      lines.push(`- ${modelName} --[${type}]--> ${target} (as: ${alias})`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate API documentation from Express routes.
 */
export function generateApiDoc(app: Application): string {
  const lines: string[] = [];

  lines.push('# API Documentation');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  const routes: { method: string; path: string }[] = [];
  const stack = (app as any)._router?.stack || [];

  function processStack(layers: any[], basePath: string = '') {
    for (const layer of layers) {
      if (layer.route) {
        const path = basePath + (layer.route.path || '');
        for (const method of Object.keys(layer.route.methods)) {
          if (layer.route.methods[method]) {
            routes.push({ method: method.toUpperCase(), path });
          }
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
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

  processStack(stack);

  // Group by prefix
  const grouped: Record<string, { method: string; path: string }[]> = {};
  for (const route of routes.sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = route.path.split('/').filter(Boolean);
    const group = parts.length >= 3 ? `/${parts.slice(0, 3).join('/')}` : route.path;
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(route);
  }

  for (const [group, groupRoutes] of Object.entries(grouped)) {
    lines.push(`## ${group}`);
    lines.push('');
    lines.push('| Method | Path | Params |');
    lines.push('|--------|------|--------|');
    for (const route of groupRoutes) {
      const params = (route.path.match(/:[^/]+/g) || []).join(', ');
      lines.push(`| ${route.method} | \`${route.path}\` | ${params || '-'} |`);
    }
    lines.push('');
  }

  lines.push(`**Total Routes: ${routes.length}**`);

  return lines.join('\n');
}
