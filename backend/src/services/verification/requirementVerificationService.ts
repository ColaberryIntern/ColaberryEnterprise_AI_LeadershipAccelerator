import { CodeAnalysis } from './codeAnalysisService';

export interface VerificationResult {
  status: 'not_started' | 'partial' | 'complete';
  reasoning: string;
  matched_files: string[];
  missing_elements: string[];
  confidence_score: number;
}

// ---------------------------------------------------------------------------
// Verify a single requirement against code analysis
// ---------------------------------------------------------------------------

export function verifyRequirement(
  requirementText: string,
  analysis: CodeAnalysis
): VerificationResult {
  if (analysis.file_map.length === 0) {
    return {
      status: 'not_started',
      reasoning: 'No code files detected in repository',
      matched_files: [],
      missing_elements: [requirementText],
      confidence_score: 0,
    };
  }

  // Step 1: Extract keywords from requirement
  const reqKeywords = extractKeywords(requirementText);

  if (reqKeywords.length === 0) {
    return {
      status: 'not_started',
      reasoning: 'Could not extract meaningful keywords from requirement',
      matched_files: [],
      missing_elements: [requirementText],
      confidence_score: 0,
    };
  }

  // Step 2: Match against code analysis
  const matchResult = matchKeywordsToCode(reqKeywords, analysis);

  // Step 3: Detect gaps
  const unmatchedKeywords = reqKeywords.filter((kw) => !matchResult.matchedKeywords.has(kw));
  const missing_elements = unmatchedKeywords.map((kw) => `Missing implementation for: ${kw}`);

  // Step 4: Determine status
  const matchRatio = matchResult.matchedKeywords.size / reqKeywords.length;

  let status: 'not_started' | 'partial' | 'complete';
  let reasoning: string;

  if (matchRatio >= 0.6 && matchResult.matchedFiles.length >= 2) {
    status = 'complete';
    reasoning = `Strong match: ${matchResult.matchedKeywords.size}/${reqKeywords.length} keywords found across ${matchResult.matchedFiles.length} files. Features detected: ${matchResult.detectedFeatures.join(', ')}.`;
  } else if (matchRatio >= 0.3 || matchResult.matchedFiles.length >= 1) {
    status = 'partial';
    reasoning = `Partial match: ${matchResult.matchedKeywords.size}/${reqKeywords.length} keywords found in ${matchResult.matchedFiles.length} files. Missing: ${unmatchedKeywords.slice(0, 3).join(', ')}.`;
  } else {
    status = 'not_started';
    reasoning = `No significant implementation found. Only ${matchResult.matchedKeywords.size}/${reqKeywords.length} keywords detected.`;
  }

  return {
    status,
    reasoning,
    matched_files: matchResult.matchedFiles.slice(0, 10),
    missing_elements: missing_elements.slice(0, 5),
    confidence_score: Math.round(matchRatio * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MatchResult {
  matchedKeywords: Set<string>;
  matchedFiles: string[];
  detectedFeatures: string[];
}

function matchKeywordsToCode(
  keywords: string[],
  analysis: CodeAnalysis
): MatchResult {
  const matchedKeywords = new Set<string>();
  const matchedFilesSet = new Set<string>();
  const detectedFeatures = new Set<string>();

  // Match against file_map keywords
  for (const fileEntry of analysis.file_map) {
    const fileKeywords = fileEntry.detected_keywords.map((k) => k.toLowerCase());

    for (const kw of keywords) {
      if (fileKeywords.some((fk) => fk.includes(kw) || kw.includes(fk))) {
        matchedKeywords.add(kw);
        matchedFilesSet.add(fileEntry.path);
      }
    }
  }

  // Match against detected features
  for (const feature of analysis.detected_features) {
    const featureTokens = feature.toLowerCase().split('_');
    for (const kw of keywords) {
      if (featureTokens.some((ft) => ft.includes(kw) || kw.includes(ft))) {
        matchedKeywords.add(kw);
        detectedFeatures.add(feature);
      }
    }
  }

  // Match against file paths directly
  for (const fileEntry of analysis.file_map) {
    const pathLower = fileEntry.path.toLowerCase();
    for (const kw of keywords) {
      if (pathLower.includes(kw)) {
        matchedKeywords.add(kw);
        matchedFilesSet.add(fileEntry.path);
      }
    }
  }

  return {
    matchedKeywords,
    matchedFiles: Array.from(matchedFilesSet),
    detectedFeatures: Array.from(detectedFeatures),
  };
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'must', 'need', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'and', 'or',
    'but', 'not', 'no', 'that', 'this', 'it', 'all', 'each', 'every',
    'any', 'some', 'such', 'than', 'then', 'also', 'very', 'just',
    'about', 'up', 'out', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'under', 'over', 'same', 'different',
    'implement', 'create', 'build', 'make', 'ensure', 'provide', 'support',
    'system', 'based', 'using', 'use', 'include', 'allow', 'enable',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}
