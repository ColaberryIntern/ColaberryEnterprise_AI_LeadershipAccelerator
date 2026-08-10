const pool = require('../db');

const ACCURACY_THRESHOLD = 0.85;
const BIAS_THRESHOLD = 0.10;

// Common function words AND summaryComposer.js's own narrative/meta vocabulary
// ("this summary is generated directly from...", "has taken positions on...",
// office/jurisdiction labels) excluded from the accuracy overlap check. These
// describe the reporting act or the subject's identity, not claims about the
// subject's positions -- counting them as "ungrounded content" would penalize
// the composer's own safe-by-construction scaffolding, not real fabrication.
// See app/services/__tests__/demoPipeline.smoke.js for the bug this fixed: an
// early version scored a fully source-grounded summary at 34% accuracy because
// intro/provenance narration words don't appear verbatim in the source text.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'on', 'in',
  'of', 'to', 'for', 'and', 'or', 'this', 'that', 'these', 'those', 'you',
  'your', 'no', 'not', 'as', 'at', 'by', 'from', 'with', 'it', 'its',
  'be', 'been', 'their', 'them', 'what', 'i',
  // summaryComposer.js narrative scaffolding:
  'taken', 'positions', 'position', 'selected', 'summary', 'summarizes',
  'generated', 'directly', 'recorded', 'record', 'file', 'claims', 'claim',
  'added', 'beyond', 'office', 'jurisdiction', 'district', 'city', 'demo',
  'fictional', 'seat', 'race', 'wide',
]);

// Small demo stoplist of loaded/absolutist language. A real implementation
// would use a validated lexicon; this is a deterministic, explainable stand-in
// documented explicitly as a heuristic, not a claim of true bias detection.
const LOADED_WORDS = new Set([
  'radical', 'extremist', 'corrupt', 'dangerous', 'disaster', 'catastrophic',
  'amazing', 'terrible', 'horrible', 'hero', 'villain', 'always', 'never',
  'obviously', 'clearly', 'everyone', 'nobody', 'worst', 'best', 'evil',
  'incompetent', 'brilliant', 'failed', 'destroy', 'ruin',
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^\d+$/.test(w)); // pure-digit tokens (counts like "2 of 2") aren't claims either way
}

// Fraction of the summary's meaningful (non-stopword) words that also appear
// in the source issue_positions text it was supposedly built from. Because
// summaryComposer.js only ever rearranges source text, a correctly-composed
// summary should score high here by construction -- this measures grounding,
// it does not independently verify real-world facts. extraStopwords lets the
// caller exclude subject-specific structural labels (e.g. the resident's
// selected issue category names, which appear as "On Housing:"-style prefixes
// in the composed text but aren't themselves claims) -- see evaluateSummary().
function computeAccuracyScore(summaryText, sourceText, extraStopwords = []) {
  const extra = new Set(extraStopwords.map((w) => w.toLowerCase()));
  const isStopword = (w) => STOPWORDS.has(w) || extra.has(w);

  const summaryWords = tokenize(summaryText).filter((w) => !isStopword(w));
  const sourceWordSet = new Set(tokenize(sourceText).filter((w) => !isStopword(w)));

  if (summaryWords.length === 0) {
    return { accuracyScore: 0, groundedWordCount: 0, totalContentWords: 0 };
  }

  const groundedWordCount = summaryWords.filter((w) => sourceWordSet.has(w)).length;
  const accuracyScore = groundedWordCount / summaryWords.length;

  return { accuracyScore, groundedWordCount, totalContentWords: summaryWords.length };
}

// Fraction of total words matching the loaded-language stoplist. Lower is better.
function computeBiasScore(summaryText) {
  const words = tokenize(summaryText);
  if (words.length === 0) {
    return { biasScore: 0, loadedWordCount: 0, totalWords: 0, flaggedWords: [] };
  }
  const flaggedWords = words.filter((w) => LOADED_WORDS.has(w));
  const biasScore = flaggedWords.length / words.length;
  return { biasScore, loadedWordCount: flaggedWords.length, totalWords: words.length, flaggedWords };
}

// Evaluates a summary that has content (pending_review, published, or rejected
// all have summary_text once submitForReview has run). Stores the result and
// logs it. Does NOT gate the review/publish workflow itself (STORY-011/012 own
// that) -- this is a parallel governance signal for admin visibility.
async function evaluateSummary(subjectId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT s.id, s.summary_text, s.source_data_ref, s.issues_covered, o.name
       FROM summaries s JOIN officeholders_candidates o ON o.id = s.subject_id
       WHERE s.subject_id = $1 FOR UPDATE OF s`,
      [subjectId],
    );
    if (result.rows.length === 0) {
      throw Object.assign(new Error('No summary row for this subject'), { code: 'SUMMARY_NOT_FOUND' });
    }
    const {
      id: summaryId, summary_text: summaryText, source_data_ref: sourceDataRef,
      issues_covered: issuesCovered, name: subjectName,
    } = result.rows[0];
    if (!summaryText) {
      throw Object.assign(new Error('Summary has no text yet — nothing to evaluate'), { code: 'NO_CONTENT_TO_EVALUATE' });
    }

    const sourceText = Object.values(sourceDataRef?.issuePositions || {})
      .map((p) => p?.text || '')
      .join(' ');

    // Exclude the resident-selected issue category labels ("On Housing:" is a
    // structural prefix, not a claim) and the subject's own name/identity
    // tokens (referencing who the summary is about isn't itself a claim that
    // needs grounding in their position statements) from the accuracy check.
    const extraStopwords = [
      ...(Array.isArray(issuesCovered) ? issuesCovered.flatMap((issue) => issue.split(/\s+/)) : []),
      ...String(subjectName || '').split(/\s+/),
    ];

    const accuracy = computeAccuracyScore(summaryText, sourceText, extraStopwords);
    const bias = computeBiasScore(summaryText);
    const meetsThreshold = accuracy.accuracyScore >= ACCURACY_THRESHOLD && bias.biasScore < BIAS_THRESHOLD;

    const inserted = await client.query(
      `INSERT INTO governance_evaluations
         (summary_id, accuracy_score, bias_score, meets_threshold, method, details)
       VALUES ($1, $2, $3, $4, 'heuristic_demo_v1', $5)
       RETURNING id, evaluated_at`,
      [
        summaryId,
        accuracy.accuracyScore,
        bias.biasScore,
        meetsThreshold,
        JSON.stringify({ accuracy, bias }),
      ],
    );

    await client.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, 'SUMMARY_EVALUATED', $1)`,
      [JSON.stringify({
        summary_id: summaryId,
        subject_id: subjectId,
        accuracy_score: accuracy.accuracyScore,
        bias_score: bias.biasScore,
        meets_threshold: meetsThreshold,
        method: 'heuristic_demo_v1',
      })],
    );

    await client.query('COMMIT');

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'detroit-voter-education',
      event: 'summary_evaluated',
      summary_id: summaryId,
      subject_id: subjectId,
      accuracy_score: accuracy.accuracyScore,
      bias_score: bias.biasScore,
      meets_threshold: meetsThreshold,
      outcome: 'success',
    }));

    return {
      evaluationId: inserted.rows[0].id,
      summaryId,
      subjectId,
      accuracyScore: accuracy.accuracyScore,
      biasScore: bias.biasScore,
      meetsThreshold,
      evaluatedAt: inserted.rows[0].evaluated_at,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Trust (TBI) requirement: "governance score to track the percentage of
// summaries evaluated and ensure they meet quality standards."
async function getGovernanceScore() {
  const totals = await pool.query(`SELECT COUNT(*)::int AS n FROM summaries WHERE summary_text IS NOT NULL`);
  const evaluated = await pool.query(`SELECT COUNT(DISTINCT summary_id)::int AS n FROM governance_evaluations`);
  const passing = await pool.query(`SELECT COUNT(*)::int AS n FROM governance_evaluations WHERE meets_threshold = true`);

  const totalWithContent = totals.rows[0].n;
  const evaluatedCount = evaluated.rows[0].n;
  const passingCount = passing.rows[0].n;

  return {
    totalWithContent,
    evaluatedCount,
    passingCount,
    evaluationCoveragePct: totalWithContent === 0 ? 0 : evaluatedCount / totalWithContent,
    passRatePct: evaluatedCount === 0 ? 0 : passingCount / evaluatedCount,
  };
}

module.exports = {
  computeAccuracyScore,
  computeBiasScore,
  evaluateSummary,
  getGovernanceScore,
  ACCURACY_THRESHOLD,
  BIAS_THRESHOLD,
};
