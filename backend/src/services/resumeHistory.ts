/**
 * resumeHistory - the employment / education history carried on a resume, and the
 * only sanctioned way to read it back.
 *
 * WHY ITS OWN MODULE. The public portfolio projection renders this history, and that
 * projection must stay free of Sequelize models so it can be unit-tested as pure data
 * in / data out. resumeIngestService imports the models, so the shared piece lives
 * here and both sides import it. The normalizers are the trust boundary: everything
 * in `extracted` is raw LLM output that a stranger will eventually read on a public
 * page, so nothing renders without passing through them first.
 */

/**
 * One role from the person's employment history.
 *
 * WHY THIS SHAPE. A portfolio that shows only capstone work reads as a bootcamp
 * exercise; the employment history is what makes a stranger treat the person as
 * a professional who then built this. `end: null` means CURRENT -- never the
 * string "Present", so the renderer decides the wording, not the model.
 */
export interface ResumeExperience {
  company: string;
  title: string;
  /** "2021" or "2021-03". Null when the text does not say. */
  start: string | null;
  /** Null means CURRENT ROLE. */
  end: string | null;
  location?: string | null;
  /** One factual line on what the role was. */
  summary?: string | null;
  /** At most 3 short bullets. */
  highlights?: string[];
}

/** One credential from the person's education history. */
export interface ResumeEducation {
  institution: string;
  /** e.g. "B.S." / "MBA". Null when the text does not say. */
  credential: string | null;
  field?: string | null;
  year?: string | null;
}

/**
 * Caps. A resume is a summary, and a portfolio is a shorter one; these also
 * bound what a hostile or hallucinating model can push onto a public page.
 */
const MAX_EXPERIENCE = 8;
const MAX_EDUCATION = 5;
const MAX_HIGHLIGHTS = 3;
const MAX_SUMMARY_CHARS = 180;
const MAX_HIGHLIGHT_CHARS = 140;
const MAX_SHORT_CHARS = 120;

/** A trimmed, length-capped string, or null. Anything not a string is null. */
function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  return t.length > max ? t.slice(0, max).trimEnd() : t;
}

/**
 * A date the resume actually stated, or null.
 *
 * WHY STRICT. A rendered "2019 - 2021" beside an employer is a factual claim a
 * recruiter may check. The model is told to emit "YYYY" or "YYYY-MM"; anything
 * else (a free-text "Present", a season, a full sentence) becomes null rather
 * than being shown as if the resume said it. Bounded to plausible working years
 * so a parse artefact like "0001" never prints.
 */
function cleanDate(v: unknown): string | null {
  const t = cleanStr(v, 7);
  if (!t) return null;
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(t);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 1950 || year > 2100) return null;
  if (m[2]) {
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
  }
  return t;
}

/**
 * The employment history, safe to render.
 *
 * An entry with neither a company nor a title is not a role, it is noise, and
 * is dropped rather than rendered as an empty card. `end: null` is preserved as
 * meaningful (current role) and is NOT the same as a dropped field.
 */
export function normalizeExperience(raw: unknown): ResumeExperience[] {
  if (!Array.isArray(raw)) return [];
  const out: ResumeExperience[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const company = cleanStr(r.company, MAX_SHORT_CHARS);
    const title = cleanStr(r.title, MAX_SHORT_CHARS);
    if (!company && !title) continue;
    const highlights = (Array.isArray(r.highlights) ? r.highlights : [])
      .map((h) => cleanStr(h, MAX_HIGHLIGHT_CHARS))
      .filter((h): h is string => !!h)
      .slice(0, MAX_HIGHLIGHTS);
    out.push({
      company: company ?? '',
      title: title ?? '',
      start: cleanDate(r.start),
      end: cleanDate(r.end),
      location: cleanStr(r.location, MAX_SHORT_CHARS),
      summary: cleanStr(r.summary, MAX_SUMMARY_CHARS),
      highlights,
    });
    if (out.length >= MAX_EXPERIENCE) break;
  }
  return out;
}

/** The education history, safe to render. An entry with no institution is dropped. */
export function normalizeEducation(raw: unknown): ResumeEducation[] {
  if (!Array.isArray(raw)) return [];
  const out: ResumeEducation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const institution = cleanStr(r.institution, MAX_SHORT_CHARS);
    if (!institution) continue;
    out.push({
      institution,
      credential: cleanStr(r.credential, MAX_SHORT_CHARS),
      field: cleanStr(r.field, MAX_SHORT_CHARS),
      year: cleanDate(r.year),
    });
    if (out.length >= MAX_EDUCATION) break;
  }
  return out;
}
