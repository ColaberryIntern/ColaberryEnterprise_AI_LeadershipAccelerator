/**
 * documentClassifier — DETERMINISTIC, no-LLM classification of the files in a solicitation ZIP into roles, so the
 * extractor can stop treating a W-9's tax instructions and a boilerplate Terms-and-Conditions template the same as
 * the RFP body. On a real package this is the difference between ~82 candidates (45% of them W-9 / T&C noise) and a
 * reviewable list: a form becomes ONE "complete and submit" item, a duplicate PDF/DOCX pair is read once, and only
 * the solicitation body is scanned sentence-by-sentence.
 *
 * PURE + TOTAL: filename + text signals only, never throws, garbage in -> every file 'reference'. Nothing here
 * gates anything; the role is an advisory routing hint the extractor and UI consume.
 */

export type DocRole =
  | 'solicitation'    // the RFP/RFQ/RFI body and its appendices — the thing to extract requirements from
  | 'addendum'        // amendments / Q&A responses — also extracted
  | 'contract_terms'  // standard terms & conditions / contract templates — only material (rule) clauses extracted
  | 'form'            // a fill-and-sign form (vendor registration, confidentiality claim) — one "submit" item
  | 'tax_form'        // W-9 and similar — one "submit" item, never 14 from its instructions
  | 'pricing_form'    // price sheet / cost schedule — one "submit" item (and a Price-bucket hint)
  | 'reference';      // unclassified — treated conservatively (still fully scanned, so nothing is missed)

export interface ClassifiedDoc {
  name: string;
  role: DocRole;
  /** The name of an earlier file this one duplicates (same content, e.g. the RFP shipped as BOTH .pdf and .docx);
   *  null when unique. A duplicate is read once and not re-extracted. */
  duplicateOf: string | null;
  /** Why it was classified this way — the matched signals, for transparency in the UI / a test. */
  signals: string[];
}

// ── Filename signals (strongest: gov packages name files plainly, "6-RFP ...", "2-W9-2024", "4-Master - Terms"). ──
const FN = {
  tax: /\bw-?9\b/i,
  addendum: /\b(addend|amend)/i,
  pricing: /\b(price|cost|fee|bid)[-_ ]?(sheet|schedule|form|proposal|table|workbook)\b|\bpricing\b/i,
  solicitation: /\b(rfp|rfq|rfi|solicitation|scope\s*of\s*work|\bsow\b)\b/i,
  terms: /\b(terms|conditions|master\s*(?:agreement|contract)|contract\s*template|standard\s*terms|goods?\s*and\s*service)\b/i,
  // NB: deliberately NOT "exhibit"/"attachment" — those usually mark a substantive appendix (scope, specs) that
  // must be fully scanned, not a one-line "sign and submit" form.
  form: /\b(registration|confidential|claim\s*of|affidavit|questionnaire|w-?9|certificate\s+of)\b|\bforms?\b/i,
};
// ── Text signals (fallback when the filename is inconclusive). ──
const TX = {
  tax: /request\s+for\s+taxpayer\s+identification|\bgive\s+form\s+to\s+the\s+requester\b/i,
  pricing: /\b(cost\s+proposal|pricing\s+schedule|price\s+schedule|cost\s+information\s+submission)\b/i,
  solicitation: /\bscope\s+of\s+work\b|\brequest\s+for\s+(?:proposals?|qualifications?)\b|\bproposal\s+evaluation\b|\bevaluation\s+criteria\b/i,
  terms: /\bstandard\s+terms\s+and\s+conditions\b|\bgeneral\s+terms\s+and\s+conditions\b/i,
};

/** A fill-and-sign form reads as a wall of blank lines with a signature block, not prose. */
function looksLikeBlankForm(text: string): boolean {
  const blanks = (text.match(/_{4,}/g) || []).length;
  return blanks >= 4 && /\bsignature\b/i.test(text);
}

// A price sheet / cost form is a short document. Above this length a "cost proposal" mention is the RFP body
// talking about its cost volume, not a price sheet — so a text-only pricing signal applies only below it.
const PRICING_TEXT_MAX_CHARS = 8000;

function classifyOne(name: string, text: string): { role: DocRole; signals: string[] } {
  const fn = name;
  const t = text;
  const sig: string[] = [];
  const hit = (label: string) => { sig.push(label); return sig; };

  // FILENAME SIGNALS FIRST — strongest and least ambiguous. A file NAMED as the RFP is the solicitation even
  // though its body quotes "cost proposal" and terms language (every RFP does); a file NAMED "...Terms and
  // Conditions" is a T&C template even though its body says "scope of work". Ordering the TEXT fallbacks ahead of
  // these is the bug that made the real Snow RFP read as a one-line pricing form (its body says "cost proposal")
  // while the T&C was scanned as the solicitation (its body says "scope of work").
  if (FN.tax.test(fn)) return { role: 'tax_form', signals: hit('fn:tax') };
  if (FN.addendum.test(fn)) return { role: 'addendum', signals: hit('fn:addendum') };
  if (FN.pricing.test(fn)) return { role: 'pricing_form', signals: hit('fn:pricing') };
  if (FN.solicitation.test(fn)) return { role: 'solicitation', signals: hit('fn:solicitation') };
  if (FN.terms.test(fn)) return { role: 'contract_terms', signals: hit('fn:terms') };
  if (FN.form.test(fn)) return { role: 'form', signals: hit('fn:form') };

  // TEXT FALLBACKS — only when the filename said nothing. A long body with RFP/scope/evaluation language is the
  // solicitation, checked BEFORE pricing so a long body is never a price sheet. pricing_form by TEXT applies only
  // to a SHORT document: a real price sheet is short, whereas the RFP body merely mentions "cost proposal" in
  // passing — the length gate stops the body from being mistaken for a price sheet.
  if (TX.tax.test(t)) return { role: 'tax_form', signals: hit('tx:tax') };
  if (TX.solicitation.test(t) && t.length >= 4000) return { role: 'solicitation', signals: hit('tx:solicitation') };
  if (TX.pricing.test(t) && t.length < PRICING_TEXT_MAX_CHARS) return { role: 'pricing_form', signals: hit('tx:pricing') };
  if (TX.terms.test(t)) return { role: 'contract_terms', signals: hit('tx:terms') };
  if (looksLikeBlankForm(t)) return { role: 'form', signals: hit('tx:blankform') };

  // Fallback. A substantial un-signalled document is almost certainly the RFP body (so we do NOT skip it); a short
  // one is a genuine reference. Either way 'reference' is fully scanned downstream, so nothing is silently dropped.
  return { role: t.length >= 4000 ? 'solicitation' : 'reference', signals: hit(t.length >= 4000 ? 'fallback:long->solicitation' : 'fallback:reference') };
}

// ── Near-duplicate detection (the RFP shipped as both .pdf and .docx). Word-trigram Jaccard over normalized text. ──
function normalizeForDup(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function shingles(norm: string, k = 3, cap = 3000): Set<string> {
  const words = norm.split(' ').filter(Boolean);
  const s = new Set<string>();
  for (let i = 0; i + k <= words.length && s.size < cap; i++) s.add(words.slice(i, i + k).join(' '));
  return s;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (large.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
const DUP_THRESHOLD = 0.85;

/**
 * Classify every file by role and flag near-duplicates. Deterministic: same files in, same classification out.
 * Duplicate flagging is order-stable (a file duplicates the FIRST equal file before it, by the input order).
 */
export function classifyDocuments(files: { name: string; text: string }[]): ClassifiedDoc[] {
  const rows = (Array.isArray(files) ? files : []).filter((f) => f && typeof f.name === 'string');
  const out: ClassifiedDoc[] = [];
  const sh: Array<{ name: string; set: Set<string> } > = [];
  for (const f of rows) {
    const text = String(f.text ?? '');
    const { role, signals } = classifyOne(f.name, text);
    // Duplicate check against already-seen files (only meaningful for text long enough to shingle).
    let duplicateOf: string | null = null;
    const set = shingles(normalizeForDup(text));
    if (set.size >= 20) {
      for (const prev of sh) {
        if (jaccard(set, prev.set) >= DUP_THRESHOLD) { duplicateOf = prev.name; break; }
      }
    }
    if (!duplicateOf) sh.push({ name: f.name, set });
    out.push({ name: f.name, role, duplicateOf, signals: duplicateOf ? [...signals, 'duplicate'] : signals });
  }
  return out;
}

/** Roles whose text is scanned sentence-by-sentence for requirements (the RFP body and anything unknown). */
export const FULL_SCAN_ROLES: ReadonlySet<DocRole> = new Set<DocRole>(['solicitation', 'addendum', 'reference']);
/** Roles that become ONE "complete and submit" item instead of a sentence scan (kills the W-9 / form noise). */
export const SINGLE_ITEM_ROLES: ReadonlySet<DocRole> = new Set<DocRole>(['form', 'tax_form', 'pricing_form']);

/** A human label for the role, used in the synthesized "complete and submit" statement. */
export function roleLabel(role: DocRole): string {
  switch (role) {
    case 'tax_form': return 'tax form';
    case 'pricing_form': return 'pricing/cost form';
    case 'form': return 'form';
    case 'contract_terms': return 'terms & conditions';
    case 'addendum': return 'addendum';
    case 'solicitation': return 'solicitation';
    default: return 'document';
  }
}
