/**
 * Outbound style gate for the renewal reminder.
 *
 * These are the same documented rules as scripts/lib/mandrillPreflight.js (no
 * em-dashes, branded signature, never a bare "Ali" signoff on top of it). That
 * file is deliberately NOT imported: only `dist` ships to the runtime image, and
 * tsc emits nothing for a plain .js file, so a require() of it would resolve in
 * development and be missing in production. A scheduled service cannot depend on
 * a module that is not in the image.
 *
 * Kept small and pure so the rules can be asserted directly. A violation is a
 * build defect, not a runtime condition, so it throws rather than warning.
 */

export class EmailStyleViolation extends Error {
  readonly error_class = 'ContractViolation';
  readonly violations: string[];
  constructor(violations: string[]) {
    super(`Renewal email style gate failed:\n  - ${violations.join('\n  - ')}`);
    this.name = 'EmailStyleViolation';
    this.violations = violations;
  }
}

const INFORMAL_SIGNOFFS = [
  /\b(best|thanks|cheers|regards|sincerely),?\s*\n+\s*ali\b/i,
  /<p[^>]*>\s*(best|thanks|cheers|regards|sincerely),?\s*<br\s*\/?>\s*ali\s*<\/p>/i,
];

const SIGNATURE_MARKERS = [
  /Managing Director/i,
  /200 Chisholm Place/i,
  /enterprise\.colaberry\.ai/i,
];

export function hasBrandedSignature(body: string): boolean {
  return SIGNATURE_MARKERS.some((rx) => rx.test(body));
}

export function findStyleViolations(html: string, text: string): string[] {
  const violations: string[] = [];

  // Em-dash and en-dash. The house rule is a hyphen with spaces, a comma, or a
  // plain "and"/"but".
  for (const [label, body] of [['HTML', html], ['TEXT', text]] as const) {
    if (/[—–]/.test(body)) {
      violations.push(`${label} body contains an em-dash or en-dash. Use a comma, a hyphen with spaces, or "and"/"but".`);
    }
  }

  // The branded signature is required on a message about somebody's money.
  if (!hasBrandedSignature(html)) violations.push('HTML body is missing the branded signature.');
  if (!hasBrandedSignature(text)) violations.push('TEXT body is missing the branded signature.');

  // Never both a casual closer and the signature block.
  for (const [label, body] of [['HTML', html], ['TEXT', text]] as const) {
    const informal = INFORMAL_SIGNOFFS.find((rx) => rx.test(body));
    if (informal && hasBrandedSignature(body)) {
      violations.push(`${label} body has the branded signature AND an informal signoff. Pick one.`);
    }
    const count = (body.match(/Ali Muwwakkil/g) || []).length;
    if (count > 1) violations.push(`${label} body names "Ali Muwwakkil" ${count} times, which is a duplicated signature.`);
  }

  // A billing email that does not show a link is useless, and one that shows an
  // unresolved template value is worse than useless.
  for (const [label, body] of [['HTML', html], ['TEXT', text]] as const) {
    if (/undefined|null|NaN|\$NaN/.test(body.replace(/[A-Za-z0-9_-]*null[A-Za-z0-9_-]*@/g, ''))) {
      violations.push(`${label} body contains an unresolved value (undefined / null / NaN).`);
    }
  }

  return violations;
}

export function validateRenewalEmailStyle(html: string, text: string): void {
  const violations = findStyleViolations(html, text);
  if (violations.length) throw new EmailStyleViolation(violations);
}
