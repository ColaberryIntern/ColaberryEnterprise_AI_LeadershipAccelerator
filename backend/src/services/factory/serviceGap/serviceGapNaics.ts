/**
 * serviceGapNaics - NAICS codes for what the firm PERFORMED, picked from a closed list. PURE.
 *
 * Why a closed list instead of letting the model write codes:
 *   - a model writes plausible-looking 6-digit codes that do not exist, or exist with another meaning;
 *   - the code that matters on a service is the one we would BID under (the work performed: programming, systems
 *     design, consulting, training, staffing), NOT the client's industry. A utilities case study is still 541511
 *     work; 221118 (power generation) on one of our services is a mistake a gov-bid matcher would act on.
 * So the model may only choose codes from WORK_NAICS (2022 NAICS titles), and anything outside it is dropped.
 * Codes already on a service that are not work codes are flagged, never removed: a person decides.
 * Every suggestion is still labeled unverified; the list bounds the vocabulary, it does not prove the fit.
 */

/** 2022 NAICS work-performed codes relevant to an AI, data, consulting, training and staffing firm. */
export const WORK_NAICS: Readonly<Record<string, string>> = Object.freeze({
  '518210': 'Computing Infrastructure Providers, Data Processing, Web Hosting, and Related Services',
  '541211': 'Offices of Certified Public Accountants',
  '541219': 'Other Accounting Services',
  '541330': 'Engineering Services',
  '541360': 'Geophysical Surveying and Mapping Services',
  '541370': 'Surveying and Mapping (except Geophysical) Services',
  '541511': 'Custom Computer Programming Services',
  '541512': 'Computer Systems Design Services',
  '541513': 'Computer Facilities Management Services',
  '541519': 'Other Computer Related Services',
  '541611': 'Administrative Management and General Management Consulting Services',
  '541612': 'Human Resources Consulting Services',
  '541613': 'Marketing Consulting Services',
  '541614': 'Process, Physical Distribution, and Logistics Consulting Services',
  '541618': 'Other Management Consulting Services',
  '541620': 'Environmental Consulting Services',
  '541690': 'Other Scientific and Technical Consulting Services',
  '541715': 'Research and Development in the Physical, Engineering, and Life Sciences (except Nanotechnology and Biotechnology)',
  '541720': 'Research and Development in the Social Sciences and Humanities',
  '541910': 'Marketing Research and Public Opinion Polling',
  '541990': 'All Other Professional, Scientific, and Technical Services',
  '561110': 'Office Administrative Services',
  '561311': 'Employment Placement Agencies',
  '561320': 'Temporary Help Services',
  '611420': 'Computer Training',
  '611430': 'Professional and Management Development Training',
  '611710': 'Educational Support Services',
});

export const MAX_NAICS = 4;

export interface NaicsSuggestion {
  code: string;
  title: string;
  /** True when the matched/target service already carries this code. */
  onTarget: boolean;
}

/** The list as the prompt sees it, one code per line. */
export function naicsPromptBlock(): string {
  return Object.entries(WORK_NAICS).map(([c, t]) => `${c} ${t}`).join('\n');
}

/** First 6-digit run in a value ("541511 - Custom..." -> "541511"), or null. */
function codeOf(v: unknown): string | null {
  const m = /\b(\d{6})\b/.exec(String(v ?? ''));
  return m ? m[1] : null;
}

/** The model's codes, kept only when on the work list, deduplicated, capped; marked against the target's codes. */
export function pickNaics(raw: unknown, targetCodes: readonly string[] = []): NaicsSuggestion[] {
  const on = new Set(targetCodes);
  const out: NaicsSuggestion[] = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    const code = codeOf(v);
    if (!code || !WORK_NAICS[code] || out.some((o) => o.code === code)) continue;
    out.push({ code, title: WORK_NAICS[code], onTarget: on.has(code) });
    if (out.length >= MAX_NAICS) break;
  }
  return out;
}

/** Codes on a service that are not work-performed codes (usually a client's industry), as reviewer warnings. */
export function nonWorkCodeWarnings(serviceName: string, codes: readonly string[]): string[] {
  return codes.filter((c) => !WORK_NAICS[c])
    .map((c) => `"${serviceName}" carries NAICS ${c}, which is not a work-performed code (often the client's industry). Check it before a bid uses it.`);
}
