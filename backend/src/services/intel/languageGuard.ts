/**
 * languageGuard — deterministic non-English detection for intel-pipeline video
 * items (CLAUDE.md: no LLM classification for a cheap, high-volume filter; pure,
 * unit-testable, no I/O).
 *
 * Two independent signals, either one is sufficient to flag an item:
 *   1. AUDIO-LANGUAGE METADATA — authoritative when the uploader set it (YouTube
 *      `videos.list` snippet.defaultAudioLanguage / defaultLanguage). Catches
 *      Latin-script foreign languages (German, Turkish, Spanish, ...) that a text
 *      heuristic cannot reliably see.
 *   2. TEXT HEURISTIC — a non-Latin script range in the title/excerpt, or an
 *      explicit spoken-language name in the text (e.g. "| Hindi", "#khmer").
 *      Backstop for the common case where uploaders never set the metadata field.
 */

/** Unicode ranges for scripts that indicate non-English spoken content when they
 *  dominate a title: CJK, Hiragana/Katakana, Hangul, Thai, Devanagari, Bengali,
 *  Arabic, Cyrillic. English text does not use these ranges. */
const NON_LATIN_SCRIPT =
  /[一-鿿぀-ヿ가-힯฀-๿ऀ-ॿঀ-৿؀-ۿЀ-ӿ]/;

/** Explicit language names/self-tags creators commonly add to a title when the
 *  spoken language isn't English. Matched as whole words (case-insensitive) to
 *  avoid incidental substring hits. */
const NON_ENGLISH_LANGUAGE_WORDS = [
  'hindi', 'khmer', 'tamil', 'telugu', 'urdu', 'bengali', 'punjabi', 'gujarati',
  'marathi', 'kannada', 'malayalam', 'mandarin', 'cantonese', 'vietnamese',
  'korean', 'japanese', 'arabic', 'turkish', 'yapay', // "Yapay Zeka" = Turkish for "AI"
];

/** True when the audio-language metadata (from YouTube videos.list) explicitly
 *  names a non-English language. Absent/undefined metadata is NOT a signal here —
 *  callers fall back to the text heuristic in that case. */
export function isNonEnglishLanguageCode(code: string | null | undefined): boolean {
  if (!code || typeof code !== 'string') return false;
  return !code.trim().toLowerCase().startsWith('en');
}

/** True when the given text strongly suggests non-English spoken content: a
 *  non-Latin script character, or an explicit language-name word. Empty/blank
 *  input is never flagged. */
export function isLikelyNonEnglishText(...texts: Array<string | null | undefined>): boolean {
  const joined = texts.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).join(' ');
  if (!joined) return false;
  if (NON_LATIN_SCRIPT.test(joined)) return true;
  const lower = joined.toLowerCase();
  return NON_ENGLISH_LANGUAGE_WORDS.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(lower));
}
