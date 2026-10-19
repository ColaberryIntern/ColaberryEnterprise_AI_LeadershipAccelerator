/**
 * C6.7 guards - the ticket's acceptance criteria expressed as code.
 *
 * C6.7 names its own failure mode precisely: "Templated personalization. If the opening
 * could be sent to anyone, it is not tier 1." That is a judgement a writer makes badly at
 * message nineteen, so it is checked here instead.
 *
 * Kept in its own module from the data because these are the interesting part and they
 * should be readable without scrolling past twenty-four drafts.
 */

const { findBritishSpelling, americanForm } = require('../britishSpellings');

/** Words too common to make an opening distinctive. */
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from',
  'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'that', 'this', 'these',
  'those', 'you', 'your', 'yours', 'we', 'our', 'ours', 'i', 'me', 'my', 'they', 'their',
  'has', 'have', 'had', 'do', 'does', 'did', 'not', 'no', 'so', 'if', 'than', 'then', 'when',
  'what', 'which', 'who', 'how', 'why', 'can', 'could', 'would', 'should', 'will', 'one',
  'two', 'three', 'more', 'most', 'other', 'into', 'out', 'up', 'down', 'over', 'under',
  'about', 'after', 'before', 'between', 'through', 'during', 'without', 'within', 'first',
  'last', 'new', 'own', 'same', 'such', 'only', 'just', 'also', 'any', 'all', 'both', 'each',
  'few', 'much', 'many', 'some', 'there', 'here', 'where', 'while', 'because', 'since',
]);

const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
  .split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Jaccard overlap of two word sets, 0 to 1. */
function overlap(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 1;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  return shared / new Set([...A, ...B]).size;
}

/**
 * THE SIGNATURE GUARD. No opening may be swappable with another.
 *
 * Two tests, because either alone is gameable. First, every opening must contain at least
 * one distinctive word that appears in NO other opening — the proper noun or the specific
 * detail that makes it about this institution. Second, no two openings may share more than
 * `maxOverlap` of their vocabulary, which catches the case where the only difference is the
 * institution's name dropped into an otherwise identical sentence.
 */
function assertNoneInterchangeable(messages, maxOverlap = 0.35) {
  const openings = messages.map((m) => m.opening);

  for (let i = 0; i < openings.length; i += 1) {
    const mine = new Set(words(openings[i]));
    for (let j = 0; j < openings.length; j += 1) {
      if (i !== j) for (const w of words(openings[j])) mine.delete(w);
    }
    if (mine.size === 0) {
      throw new Error(`${messages[i].account}: the opening contains no word unique to it, `
        + 'so it could be sent to another target unchanged');
    }
  }

  let worst = { v: 0 };
  for (let i = 0; i < openings.length; i += 1) {
    for (let j = i + 1; j < openings.length; j += 1) {
      const v = overlap(openings[i], openings[j]);
      if (v > worst.v) worst = { v, a: messages[i].account, b: messages[j].account };
      if (v > maxOverlap) {
        throw new Error(`${messages[i].account} and ${messages[j].account} share `
          + `${Math.round(v * 100)}% of their opening vocabulary, over the ${
            Math.round(maxOverlap * 100)}% ceiling. One of them is a template.`);
      }
    }
  }
  return worst;
}

/** Every opening rests on a fact with a source and a date, or the target is not sendable. */
function assertEveryOpeningIsSourced(messages) {
  for (const m of messages.filter((x) => x.sendable)) {
    if (!m.hook || !m.hook.fact) throw new Error(`${m.account}: sendable with no hook fact`);
    if (!/^https?:\/\//.test(m.hook.source || '')) {
      throw new Error(`${m.account}: the opening fact has no source URL`);
    }
    if (!m.hook.seen) throw new Error(`${m.account}: no date recorded for the source`);
  }
  return messages.filter((x) => x.sendable).length;
}

/**
 * Every figure or credential in the body matches registry wording exactly.
 *
 * Anything that looks like a claim - a currency amount, a percentage, a year count, the
 * word certified - has to be a string the registry publishes, character for character.
 */
function assertClaimsMatchRegistry(messages, publishableWordings) {
  const allowed = publishableWordings.map((w) => w.toLowerCase());
  for (const m of messages) {
    const body = `${m.subject} ${m.opening} ${m.body}`;
    const suspects = [
      ...body.matchAll(/\$[\d,]+/g),
      ...body.matchAll(/\b\d+\s?%/g),
      ...body.matchAll(/\b\d{1,3},?\d{3}\+?\b/g),
    ].map((x) => x[0]);
    for (const s of suspects) {
      if (!allowed.some((w) => w.includes(s.toLowerCase()))) {
        throw new Error(`${m.account}: "${s}" is a figure with no matching registry wording`);
      }
    }
    /*
     * CLM-026 prohibits claiming that WE certify anyone; it does not prohibit mentioning
     * the customer's own certificate, which several of these targets run and which is
     * often the whole hook. An earlier version of this check fired on the word "certificate"
     * anywhere and flagged a draft that was referring to Pratt's own program.
     *
     * So it is scoped to first-person constructions: ours, or one we confer.
     */
    const weCertify = /\b(our|we|colaberry)\b[^.]{0,60}\bcertif/i.test(body)
      || /\bcertif\w*\b[^.]{0,40}\b(from|by)\s+(us|colaberry)\b/i.test(body);
    if (weCertify && !/certification preparation/i.test(body)) {
      throw new Error(`${m.account}: describes a certification as ours without the `
        + 'registry\'s "certification preparation" framing (CLM-026)');
    }
  }
  return messages.length;
}

/** Wording the standing rules prohibit outright. */
function assertNoProhibitedWording(messages) {
  for (const m of messages) {
    const body = `${m.subject} ${m.opening} ${m.body}`.toLowerCase();
    if (/\bfree\b/.test(body)) {
      throw new Error(`${m.account}: uses the word free (TWC 40 TAC 807.172(d))`);
    }
    if (/anthropic (partner|partnership)|claude code partner/.test(body)) {
      throw new Error(`${m.account}: asserts an Anthropic partnership, which is DO_NOT_PUBLISH`);
    }
    if (/we certify|colaberry certifies|certified by colaberry/.test(body)) {
      throw new Error(`${m.account}: claims Colaberry certifies someone (CLM-026)`);
    }
    if (/\bguarantee\b/.test(body)) throw new Error(`${m.account}: promises a guarantee`);
        const brit = findBritishSpelling(body);
    if (brit) {
      throw new Error(`${m.account}: British spelling "${brit}" in outbound copy; use "${americanForm(brit)}"`);
    }
    if (/—/.test(`${m.subject} ${m.opening} ${m.body}`)) {
      throw new Error(`${m.account}: contains an em dash, which does not go in outbound copy`);
    }
  }
  return messages.length;
}

/**
 * Nothing here is wired to send. The ticket says so twice and it is the easiest criterion
 * to satisfy by accident-in-reverse, so it is asserted rather than assumed.
 */
function assertNothingConfiguredToSend(moduleSource) {
  const forbidden = [
    /require\(['"][^'"]*(mandrill|nodemailer|emailService|send\.sh|sendEmail)/i,
    /campaign_id|campaignId/,
    /scheduled_at|sendAt|send_at/,
    /\bmailMerge\b/i,
  ];
  for (const re of forbidden) {
    if (re.test(moduleSource)) {
      throw new Error(`the draft set contains sending configuration (${re}), and the ticket `
        + 'puts any automated sequence for this tier explicitly out of scope');
    }
  }
  return true;
}

/** A target with no researched opening is flagged, never given a generic one. */
function assertUnsourcedAreFlaggedNotFilled(messages) {
  for (const m of messages.filter((x) => !x.sendable)) {
    if (m.opening) {
      throw new Error(`${m.account}: has no researched fact but carries an opening anyway. `
        + 'A generic opening is the failure mode this ticket names.');
    }
    if (!m.blockedReason || m.blockedReason.length < 25) {
      throw new Error(`${m.account}: not sendable and no reason recorded`);
    }
  }
  return messages.filter((x) => !x.sendable).length;
}

module.exports = {
  words, overlap,
  assertNoneInterchangeable, assertEveryOpeningIsSourced, assertClaimsMatchRegistry,
  assertNoProhibitedWording, assertNothingConfiguredToSend, assertUnsourcedAreFlaggedNotFilled,
};
