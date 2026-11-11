/**
 * briefParser - pull the structured brief that is ALREADY in every ticket description.
 *
 * WHY THIS IS DETERMINISTIC AND NOT A MODEL CALL
 *
 * Audited on production 2026-11-11: of 2,694 active todos assigned to Ali, `description` is 100%
 * populated, averages 648 characters, and 2,652 of them are distinct - so it is real content, not
 * boilerplate. More usefully, the tickets were authored to a house pattern and already carry
 * labelled fields:
 *
 *     Decision owner: Ram and Ali
 *     Decide by: 2027-06-30
 *     The decision. Go or no-go on the 10,000-learner target ...
 *     Why. By ...
 *     Source of truth: COMMERCIALIZATION MASTER INDEX - read this before working the ticket.
 *     Canonical folder for this ticket's artifact: 09 - Launch & Conversion
 *
 * Those are exactly the fields a working session otherwise spends its first ten minutes
 * rediscovering. Parsing beats inferring here: it is free, it is reproducible, and it cannot
 * hallucinate an owner or a deadline that the ticket never stated.
 *
 * The three columns that SHOULD have carried this are dead: `last_human_action_at` is 0%
 * populated, `ai_opportunity_score` is 0%, and `downstream_blocked_count` is 100% populated with
 * zero for every single row. `category` is 95% the single value `waiting_dependency`. So the
 * description is not merely the best signal available, it is very nearly the only one.
 *
 * Pure: (html) -> object. No I/O.
 */

/** Block-level tags become newlines BEFORE stripping, or every div runs into the next sentence. */
function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(div|p|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li\s*[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim();
}

/**
 * The labels the house pattern uses. Each maps to one field.
 *
 * `decide_by` is listed because it is a BETTER deadline than `due_on`: the due date is a cohort
 * schedule artifact in several projects, while "Decide by" is what the ticket author actually
 * committed to. Where both exist they should be compared, not silently merged.
 */
const LABELS = [
  ['owner', /^(?:decision\s+owner|owner|assigned\s+to)\s*[:.]\s*(.+)$/i],
  ['decideBy', /^(?:decide\s+by|decision\s+due|due\s+by)\s*[:.]\s*(.+)$/i],
  ['decision', /^(?:the\s+decision|decision)\s*[:.]\s*(.+)$/i],
  ['why', /^(?:why|rationale|context)\s*[:.]\s*(.+)$/i],
  ['sourceOfTruth', /^source\s+of\s+truth\s*[:.]\s*(.+)$/i],
  ['artifactFolder', /^canonical\s+folder[^:]*[:.]\s*(.+)$/i],
  ['doneWhen', /^(?:done\s+when|definition\s+of\s+done|acceptance|success\s+looks\s+like)\s*[:.]\s*(.+)$/i],
  ['blockedBy', /^(?:blocked\s+by|waiting\s+on|depends\s+on)\s*[:.]\s*(.+)$/i],
  // Already a house convention: 32 live tickets name a skill here, usually /loop-architect.
  // Carrying it means the session is told HOW to work the ticket, not just what it is.
  ['requiredSkill', /^required\s+skill\s*[:.]\s*(.+)$/i],
];

/**
 * Markers that say a PERSON has to do this, found by rendering against production.
 *
 * The first run proposed "Act now" on a ticket whose own brief read "Required skill: none - human
 * task". The ticket stated the answer and the proposer ignored it, which is worse than making no
 * proposal: it is a confident wrong one that would send a session to do work a person was meant
 * to do. Thirteen of 425 were wrong this way.
 *
 * The emoji markers are the story-build convention (the AI / Human task split), so they are a
 * deliberate signal rather than decoration.
 */
const HUMAN_MARKERS = [
  /\u{1F9D1}/u,                       // the human emoji used by the task split
  /\[human\]/i,
  /human[\s/-]*(?:task|decision|physical)/i,
  /\bnone\s*[-–]\s*human\b/i,
  /\bgovernance task\b/i,
  /\bphysical task\b/i,
  /\b(?:a )?filing, signature, decision, or payment\b/i,
];

/** True when the ticket itself says a person must do it. */
function looksHumanOnly(...texts) {
  const hay = texts.filter(Boolean).join(' \n ');
  return HUMAN_MARKERS.some((re) => re.test(hay));
}

/** The skill the ticket names, normalised to a leading slash, or null. */
function skillFrom(required) {
  if (!required) return null;
  const m = String(required).match(/\/([a-z0-9-]{3,})/i);
  return m ? `/${m[1].toLowerCase()}` : null;
}

/** Trim the trailing house boilerplate so a field reads as a value, not as an instruction. */
function tidy(v) {
  return String(v || '')
    .replace(/\s*-\s*read this before working the ticket\.?$/i, '')
    .replace(/\s*-\s*upload once here, then link\.?.*$/i, '')
    .replace(/\s+$/, '')
    .trim();
}

/**
 * @param {string} html the raw description
 * @returns {{text:string, owner:?string, decideBy:?string, decision:?string, why:?string,
 *   sourceOfTruth:?string, artifactFolder:?string, doneWhen:?string, blockedBy:?string,
 *   summary:string, found:string[]}}
 */
function parseBrief(html) {
  const text = htmlToText(html);
  const out = {
    text,
    owner: null,
    decideBy: null,
    decision: null,
    why: null,
    sourceOfTruth: null,
    artifactFolder: null,
    doneWhen: null,
    blockedBy: null,
    requiredSkill: null,
    found: [],
  };

  for (const line of text.split('\n')) {
    for (const [key, re] of LABELS) {
      if (out[key]) continue; // first occurrence wins; later ones are usually a restatement
      const m = line.match(re);
      if (m) {
        out[key] = tidy(m[1]);
        out.found.push(key);
        break;
      }
    }
  }

  /**
   * The summary a session reads first. Prefer the ticket's own stated decision; fall back to the
   * first substantive line that is NOT one of the boilerplate pointers, so the summary is never
   * "read the master index".
   */
  const skip = /^(source of truth|canonical folder|initiative|decision owner|decide by)/i;
  const firstReal = text.split('\n').find((l) => l.length > 25 && !skip.test(l));
  out.summary = (out.decision || firstReal || text.slice(0, 160) || '').slice(0, 300);

  // Derived, not parsed. Kept on the brief so every consumer sees the same verdict.
  out.humanOnly = looksHumanOnly(text, out.requiredSkill);
  out.skill = skillFrom(out.requiredSkill);

  return out;
}

module.exports = { parseBrief, htmlToText, LABELS, looksHumanOnly, skillFrom, HUMAN_MARKERS };
