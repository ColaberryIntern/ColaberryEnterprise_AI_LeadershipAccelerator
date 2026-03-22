import { getConnection } from '../githubService';

export interface FileMatch {
  path: string;
  detected_keywords: string[];
}

export interface CodeAnalysis {
  detected_features: string[];
  file_map: FileMatch[];
  structural_signals: string[];
  confidence_score: number;
}

// ---------------------------------------------------------------------------
// Feature detection patterns
// ---------------------------------------------------------------------------

const FEATURE_PATTERNS: Array<{
  feature: string;
  pathPatterns: RegExp[];
  keywords: string[];
}> = [
  {
    feature: 'authentication',
    pathPatterns: [/auth/i, /login/i, /signup/i, /register/i, /session/i],
    keywords: ['auth', 'login', 'jwt', 'token', 'password', 'session', 'oauth'],
  },
  {
    feature: 'api_endpoints',
    pathPatterns: [/routes/i, /api\//i, /controllers/i, /endpoints/i],
    keywords: ['route', 'api', 'endpoint', 'controller', 'handler', 'express', 'router'],
  },
  {
    feature: 'database',
    pathPatterns: [/models/i, /migrations/i, /schema/i, /database/i, /db\//i],
    keywords: ['model', 'schema', 'migration', 'sequelize', 'prisma', 'mongoose', 'database'],
  },
  {
    feature: 'testing',
    pathPatterns: [/__tests__/i, /\.test\./i, /\.spec\./i, /tests\//i],
    keywords: ['test', 'spec', 'jest', 'mocha', 'cypress', 'pytest'],
  },
  {
    feature: 'middleware',
    pathPatterns: [/middleware/i, /interceptor/i, /guard/i],
    keywords: ['middleware', 'interceptor', 'guard', 'filter', 'pipe'],
  },
  {
    feature: 'frontend_components',
    pathPatterns: [/components/i, /pages/i, /views/i, /\.tsx$/i, /\.jsx$/i],
    keywords: ['component', 'page', 'view', 'react', 'vue', 'angular'],
  },
  {
    feature: 'configuration',
    pathPatterns: [/config/i, /\.env/i, /settings/i],
    keywords: ['config', 'env', 'settings', 'environment'],
  },
  {
    feature: 'documentation',
    pathPatterns: [/docs/i, /readme/i, /\.md$/i],
    keywords: ['readme', 'documentation', 'docs', 'guide'],
  },
  {
    feature: 'ci_cd',
    pathPatterns: [/\.github\/workflows/i, /\.gitlab-ci/i, /Dockerfile/i, /docker-compose/i],
    keywords: ['ci', 'cd', 'pipeline', 'deploy', 'docker', 'workflow'],
  },
  {
    feature: 'error_handling',
    pathPatterns: [/error/i, /exception/i, /handler/i],
    keywords: ['error', 'exception', 'handler', 'catch', 'fallback'],
  },
];

// ---------------------------------------------------------------------------
// Main Analysis
// ---------------------------------------------------------------------------

export async function analyzeCode(enrollmentId: string): Promise<CodeAnalysis> {
  const connection = await getConnection(enrollmentId);
  const fileTreeJson = connection?.file_tree_json;

  if (!fileTreeJson?.tree || !Array.isArray(fileTreeJson.tree)) {
    console.log('[Verification:Analysis] No file tree available');
    return { detected_features: [], file_map: [], structural_signals: [], confidence_score: 0 };
  }

  const files: string[] = fileTreeJson.tree
    .filter((item: any) => item.type === 'blob')
    .map((item: any) => item.path as string)
    .filter(Boolean);

  if (files.length === 0) {
    return { detected_features: [], file_map: [], structural_signals: [], confidence_score: 0 };
  }

  const detected_features: Set<string> = new Set();
  const file_map: FileMatch[] = [];
  const structural_signals: Set<string> = new Set();

  // Scan each file path against feature patterns
  for (const filePath of files) {
    const pathLower = filePath.toLowerCase();
    const matchedKeywords: string[] = [];

    for (const pattern of FEATURE_PATTERNS) {
      const pathMatch = pattern.pathPatterns.some((re) => re.test(filePath));
      const keywordMatch = pattern.keywords.filter((kw) => pathLower.includes(kw));

      if (pathMatch || keywordMatch.length > 0) {
        detected_features.add(pattern.feature);
        matchedKeywords.push(...keywordMatch);
        if (pathMatch) matchedKeywords.push(`path:${pattern.feature}`);
      }
    }

    if (matchedKeywords.length > 0) {
      file_map.push({ path: filePath, detected_keywords: [...new Set(matchedKeywords)] });
    }
  }

  // Structural signals
  if (files.length > 50) structural_signals.add('large_codebase');
  if (files.some((f) => f.includes('package.json'))) structural_signals.add('node_project');
  if (files.some((f) => f.includes('tsconfig'))) structural_signals.add('typescript');
  if (files.some((f) => f.includes('Dockerfile'))) structural_signals.add('containerized');
  if (files.some((f) => f.match(/\.test\.|\.spec\.|__tests__/))) structural_signals.add('has_tests');
  if (files.some((f) => f.includes('.github/workflows'))) structural_signals.add('has_ci');

  const confidence_score = Math.min(1.0, detected_features.size / 5);

  console.log(
    `[Verification:Analysis] Detected ${detected_features.size} features, ${file_map.length} matched files, ${structural_signals.size} structural signals`
  );

  return {
    detected_features: Array.from(detected_features),
    file_map,
    structural_signals: Array.from(structural_signals),
    confidence_score,
  };
}
