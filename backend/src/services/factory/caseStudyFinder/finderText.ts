/**
 * finderText - the Finder's one tokenizer. PURE. Matching is on words a person would use for the work, so code
 * plumbing words ("service", "controller", "index", "utils") are dropped and camelCase is split.
 */
const STOP = new Set([
  // English
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'our', 'your', 'are', 'was', 'not', 'all', 'any', 'per',
  'via', 'new', 'one', 'two', 'its', 'has', 'have', 'can', 'will', 'more', 'less', 'end', 'non',
  // code plumbing
  'src', 'lib', 'libs', 'app', 'apps', 'api', 'apis', 'index', 'util', 'utils', 'helper', 'helpers', 'common', 'shared',
  'core', 'base', 'types', 'type', 'model', 'models', 'service', 'services', 'controller', 'controllers', 'route',
  'routes', 'router', 'handler', 'handlers', 'store', 'loader', 'config', 'constants', 'test', 'tests', 'spec', 'mock',
  'mocks', 'fixture', 'fixtures', 'main', 'module', 'modules', 'component', 'components', 'page', 'pages', 'hook',
  'hooks', 'admin', 'backend', 'frontend', 'client', 'server', 'scripts', 'script', 'dist', 'build', 'tsx', 'jsx',
  'json', 'yaml', 'readme', 'docs', 'doc', 'md', 'py', 'ts', 'js', 'html', 'css', 'scss', 'public', 'assets', 'data',
  'impl', 'default', 'run', 'get', 'set', 'list', 'make', 'view', 'views', 'panel', 'card', 'cards', 'modal',
  // our own catalog boilerplate
  'ai', 'solutions', 'solution', 'management', 'services', 'support',
]);

/** "serviceGapAssessor.test.ts" -> ["gap", "assessor"]; lowercased, singularized lightly, stopwords out. */
export function tokens(text: string | null | undefined): string[] {
  if (!text) return [];
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => (t.length > 4 && t.endsWith('ies') ? `${t.slice(0, -3)}y` : t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

export function tokenSet(...texts: (string | null | undefined)[]): Set<string> {
  const s = new Set<string>();
  for (const t of texts) for (const k of tokens(t)) s.add(k);
  return s;
}

/** "service_gap" / "serviceGap" -> "Service Gap". */
export function humanName(segment: string): string {
  const words = segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || segment;
}
