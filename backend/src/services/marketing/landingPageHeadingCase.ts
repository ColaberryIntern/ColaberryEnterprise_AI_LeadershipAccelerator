/**
 * Sentence case for landing page headings, enforced rather than requested.
 *
 * WHY THIS IS CODE AND NOT MORE PROMPT. Rule 6c has told the model to use sentence case since v6:
 * "Title Case reads as a press release and is the single most common way a generated page looks
 * generated." Measured against the live page on 2026-10-16, NINE OF NINE headings were Title
 * Case. The rule is not drifting, it is being ignored, and a rule the generator ignores is not a
 * rule - it is a hope. This is the same deterministic-second-reader shape the page already uses
 * for `findPlaceholders` and `findInventedSpecifics`.
 *
 * ── THE SAFETY PROPERTY THAT MAKES AUTOMATIC REWRITING SAFE ──
 *
 * The obvious implementation lowercases every capitalised word that is not a known proper noun,
 * and it is dangerous: the list of proper nouns is open-ended, so "Learn From Sarah Chen" becomes
 * "Learn from sarah chen" the first time a name appears that nobody listed. Mangling a person's
 * name on a public page is far worse than a Title Case heading.
 *
 * So the test is INVERTED. A word is lowercased only when it appears in `COMMON_WORDS` - ordinary
 * English that is never a name. Anything unrecognised keeps the capitalisation it arrived with.
 * "Colaberry", "Sarah", "Chen" and every brand nobody thought to register survive untouched, for
 * free, because they are not common words. The cost is that an unusual heading may stay partly
 * Title Case, which is a cosmetic miss rather than a factual error - the right way round.
 *
 * ALL-CAPS AND INTERNAL CAPS ARE LEFT ALONE: "AI", "SQL", "McKinsey", "PowerBI" are deliberate.
 * Tokens carrying digits or symbols ("$0", "2026", "10x") are never touched.
 */

/**
 * Ordinary English that is never somebody's name.
 *
 * Deliberately not a dictionary: every word here has been judged safe to lowercase mid-heading.
 * Adding a word is cheap; the only way to get this wrong is to add one that is also a name, so
 * words like "Mark", "Will", "Grace", "Summit" and "Bill" are POINTEDLY ABSENT even though they
 * are common, because each is also something a person or a product is called.
 */
const COMMON_WORDS = new Set<string>([
  // articles, conjunctions, prepositions, pronouns
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet', 'for', 'of', 'to', 'in', 'on', 'at',
  'by', 'from', 'with', 'without', 'into', 'onto', 'over', 'under', 'about', 'across', 'after',
  'before', 'between', 'beyond', 'during', 'through', 'within', 'against', 'among', 'as', 'than',
  'that', 'this', 'these', 'those', 'it', 'its', 'you', 'your', 'yours', 'we', 'our', 'ours',
  'they', 'their', 'them', 'he', 'she', 'his', 'her', 'who', 'whom', 'whose', 'what', 'which',
  'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'every', 'few', 'more', 'most',
  'other', 'others', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'too', 'very', 'just',
  'also', 'even', 'still', 'already', 'again', 'once', 'here', 'there', 'then', 'now', 'if',
  // verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did', 'done', 'have',
  'has', 'had', 'can', 'could', 'would', 'shall', 'should', 'might', 'must',
  'get', 'gets', 'got', 'go', 'goes', 'going', 'make', 'makes', 'made', 'take', 'takes', 'taken',
  // 'will' and 'may' are deliberately absent - both are also names. See the note below the set.
  'give', 'gives', 'given', 'know', 'knows', 'learn', 'learns', 'learned', 'learning', 'teach',
  'teaches', 'build', 'builds', 'building', 'built', 'start', 'starts', 'started', 'starting',
  'use', 'uses', 'used', 'using', 'help', 'helps', 'want', 'wants', 'need', 'needs', 'work',
  'works', 'working', 'run', 'runs', 'show', 'shows', 'find', 'finds', 'see', 'read', 'write',
  'ship', 'ships', 'turn', 'turns', 'bring', 'brings', 'keep', 'keeps', 'put', 'become',
  'becomes', 'becoming', 'join', 'joins', 'apply', 'applies', 'choose', 'move', 'moves',
  'understand', 'understands', 'solve', 'solves', 'deliver', 'delivers', 'prove', 'proves',
  // common nouns and adjectives in marketing copy
  'skill', 'skills', 'future', 'past', 'present', 'people', 'person', 'team', 'teams', 'time',
  'times', 'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years', 'today',
  'tomorrow', 'path', 'paths', 'journey', 'step', 'steps', 'way', 'ways', 'thing', 'things',
  'job', 'jobs', 'role', 'roles', 'career', 'careers', 'course', 'courses', 'class', 'classes',
  'lesson', 'lessons', 'project', 'projects', 'program', 'programs', 'tool', 'tools', 'basic',
  'basics', 'advanced', 'real', 'practical', 'practically', 'simple', 'easy', 'hard', 'new',
  'old', 'next', 'last', 'first', 'second', 'third', 'ready', 'further', 'longer',
  'better', 'best', 'good', 'great', 'right', 'wrong', 'own', 'full', 'whole', 'part', 'parts',
  'result', 'results', 'outcome', 'outcomes', 'proof', 'evidence', 'example', 'examples',
  'question', 'questions', 'answer', 'answers', 'prompt', 'prompts', 'idea', 'ideas', 'week',
  'live', 'online', 'hands', 'week', 'beginner', 'beginners', 'expert', 'experts', 'business',
  'company', 'companies', 'client', 'clients', 'customer', 'customers', 'leader', 'leaders',
  'leadership', 'manager', 'managers', 'student', 'students', 'everything', 'anything',
  'something', 'nothing', 'immediately', 'instantly', 'quickly', 'slowly', 'together', 'alone',
  'inside', 'outside', 'behind', 'ahead', 'back', 'up', 'down', 'out', 'off', 'per', 'via',
  // contractions, which arrive with either kind of apostrophe
  "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "won't", "can't", "couldn't",
  "shouldn't", "wouldn't", "it's", "that's", "you're", "we're", "they're", "you'll", "we'll",
  "you've", "we've", "here's", "there's", "let's", "i'm",
  'don’t', 'doesn’t', 'didn’t', 'isn’t', 'aren’t', 'wasn’t', 'won’t', 'can’t', 'couldn’t',
  'shouldn’t', 'wouldn’t', 'it’s', 'that’s', 'you’re', 'we’re', 'they’re', 'you’ll', 'we’ll',
  'you’ve', 'we’ve', 'here’s', 'there’s', 'let’s', 'i’m',
  // more everyday verbs, including past tenses the present-tense list missed
  'chose', 'chosen', 'ran', 'saw', 'said', 'told', 'brought', 'kept', 'wrote', 'written',
  'taught', 'learnt', 'stop', 'stops', 'stopped', 'add', 'adds', 'added', 'set', 'sets',
  'try', 'tries', 'tried', 'ask', 'asks', 'asked', 'send', 'sends', 'sent', 'open', 'opens',
  'close', 'closes', 'pick', 'picks', 'spend', 'spends', 'save', 'saves', 'grow', 'grows',
  // more everyday nouns and adjectives
  'report', 'reports', 'line', 'lines', 'short', 'long', 'page', 'pages', 'group', 'groups',
  'number', 'numbers', 'data', 'system', 'systems', 'process', 'model', 'models', 'plan',
  'plans', 'goal', 'goals', 'note', 'notes', 'guide', 'guides', 'list', 'lists', 'case',
  'cases', 'point', 'points', 'level', 'levels', 'hour', 'hours', 'minute', 'minutes',
  'place', 'home', 'world', 'money', 'cost', 'costs', 'price', 'value', 'values', 'quality',
  'speed', 'size', 'type', 'types', 'kind', 'kinds', 'name', 'names', 'story', 'stories',
  'week', 'weekend', 'session', 'sessions', 'module', 'modules', 'topic', 'topics', 'skillset',
  'support', 'access', 'review', 'reviews', 'feedback', 'portfolio', 'resume', 'interview',
  'interviews', 'salary', 'hiring', 'industry', 'market', 'experience', 'knowledge', 'training',
]);
// Pointedly NOT in the list, although they are common English: "Will", "May", "Mark", "Grace",
// "Bill", "Summit", "Rose" and "Chase" are all also names, and lowercasing a person or a month
// is the one failure this design exists to avoid.
//
// Also absent, for a different reason: the adjective meaning "at no cost". It is banned from
// outbound copy on this surface under TWC 807.172(d) - the house phrasings are "$0 to start" and
// "No card needed" - and `bannedWordOutboundCopy.test.ts` rejects a new source file that carries
// it, which is how this version was caught. Leaving it out also behaves better: a heading that
// uses it keeps its capital and stays conspicuous, rather than being tidied into something that
// reads like approved copy.

/** Sentence-ending punctuation, after which the next word is capitalised again. */
const SENTENCE_END = /[.!?]["')\]]?$/;

/** Letters only, for deciding whether a token is a word we can judge. */
const WORD = /^[A-Za-z][A-Za-z'’-]*$/;

/** A token that states its own capitalisation on purpose: AI, SQL, McKinsey, PowerBI. */
function isDeliberatelyCapitalised(token: string): boolean {
  const letters = token.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return true;
  // ALL CAPS of two or more letters: an initialism.
  if (letters.length >= 2 && letters === letters.toUpperCase()) return true;
  // A capital after the first letter: McKinsey, PowerBI, iPhone.
  return /[A-Z]/.test(letters.slice(1));
}

function capitaliseFirst(token: string): string {
  const i = token.search(/[A-Za-z]/);
  if (i === -1) return token;
  return token.slice(0, i) + token[i].toUpperCase() + token.slice(i + 1);
}

/**
 * Does this read as Title Case?
 *
 * Needs three or more words, because "Start Here" and "Our Work" are ordinary two-word labels.
 *
 * ONLY COMMON WORDS COUNT AS EVIDENCE. An unknown capitalised word mid-heading is far more
 * likely to be a name than a symptom - "Built by Colaberry and Refactored" is correct sentence
 * case and judging those two words would flag it. So the denominator is the words we KNOW
 * should be lowercase, and the numerator is how many of them are not. Used for reporting;
 * `toSentenceCase` is safe to run on anything regardless of what this returns.
 */
export function looksTitleCase(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter((t) => WORD.test(t.replace(/[^A-Za-z'’-]/g, '')));
  if (tokens.length < 3) return false;

  let judgeable = 0;
  let capitalised = 0;
  tokens.slice(1).forEach((raw) => {
    const token = raw.replace(/^[^A-Za-z]+|[^A-Za-z'’]+$/g, '');
    if (!WORD.test(token) || isDeliberatelyCapitalised(token)) return;
    if (!COMMON_WORDS.has(token.toLowerCase())) return;
    judgeable += 1;
    if (token[0] === token[0].toUpperCase()) capitalised += 1;
  });

  return judgeable >= 2 && capitalised / judgeable >= 0.5;
}

/**
 * Sentence case, lowercasing only words we are certain are not names.
 *
 * Idempotent: running it on its own output changes nothing, which is what lets it sit at both
 * the generation and the render boundary without the two fighting.
 */
export function toSentenceCase(text: string): string {
  const parts = text.split(/(\s+)/);
  let atSentenceStart = true;

  const out = parts.map((part) => {
    if (/^\s+$/.test(part) || part === '') return part;

    const leading = part.match(/^[^A-Za-z0-9]*/)?.[0] ?? '';
    const core = part.slice(leading.length);
    const trailing = core.match(/[^A-Za-z0-9'’]*$/)?.[0] ?? '';
    const word = core.slice(0, core.length - trailing.length);

    let result = word;
    if (word !== '') {
      if (atSentenceStart) {
        // The first word of a sentence is capitalised unless it states its own case (AI, iPhone)
        // or is not a plain word at all.
        //
        // THE `WORD` GUARD IS NOT COSMETIC. Without it this capitalises the first letter of
        // ANY leading token, so a hostile headline of `<script>alert(1)</script>` came back as
        // `<Script>alert(1)</script>` - still escaped downstream, so not a hole, but this
        // function had silently edited markup it has no business touching. Two existing
        // escaping tests caught it. Anything that is not plain letters is left exactly alone.
        result = WORD.test(word) && !isDeliberatelyCapitalised(word) ? capitaliseFirst(word) : word;
      } else if (!isDeliberatelyCapitalised(word) && !/\d/.test(word) && COMMON_WORDS.has(word.toLowerCase())) {
        result = word.toLowerCase();
      }
      // Anything else - a name, a brand, a word nobody listed - is left exactly as it arrived.
    }

    atSentenceStart = SENTENCE_END.test(part);
    return leading + result + trailing;
  });

  return out.join('');
}

/** The keys whose values are headings. List item labels are not headings and are left alone. */
const HEADING_KEYS = new Set(['headline', 'heading', 'title', 'subhead']);

/**
 * Sentence-case every heading in a generated page, leaving the rest of the content untouched.
 *
 * Walks by KEY NAME rather than by a list of paths: the content schema has headings nested in
 * sections, panels and cards, and a path list would silently stop covering new section types the
 * moment one is added. A key named `heading` is a heading wherever it appears.
 */
export function normalizeHeadingCase<T>(content: T): T {
  if (Array.isArray(content)) {
    return content.map((item) => normalizeHeadingCase(item)) as unknown as T;
  }
  if (content === null || typeof content !== 'object') return content;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
    out[key] = HEADING_KEYS.has(key) && typeof value === 'string'
      ? toSentenceCase(value)
      : normalizeHeadingCase(value);
  }
  return out as unknown as T;
}

/** Headings that still read as Title Case after normalising, for reporting to the operator. */
export function remainingTitleCaseHeadings<T>(content: T, found: string[] = []): string[] {
  if (Array.isArray(content)) {
    content.forEach((item) => remainingTitleCaseHeadings(item, found));
    return found;
  }
  if (content === null || typeof content !== 'object') return found;

  for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
    if (HEADING_KEYS.has(key) && typeof value === 'string') {
      if (looksTitleCase(value)) found.push(value);
    } else {
      remainingTitleCaseHeadings(value, found);
    }
  }
  return found;
}
