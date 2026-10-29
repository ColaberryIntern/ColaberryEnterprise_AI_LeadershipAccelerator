import fs from 'fs';
import path from 'path';

/**
 * Every public form that collects a telephone number must ask what may be done
 * with it.
 *
 * ── WHY A STRUCTURAL TEST, AND WHY IT LIVES ON THE BACKEND ──────────────────
 *
 * The defect this guards against is not a bug in a function. It is an ABSENCE,
 * spread across files: a form grows a phone field, nobody adds the permission
 * tick, and nothing anywhere fails. That is exactly how fifteen landing pages came
 * to collect numbers with no `consent_records` row behind any of them — the
 * strategy-call modal had offered a `type="tel"` input since it shipped, every
 * test passed, and the gap was invisible until somebody went looking.
 *
 * A unit test cannot catch an absence in a file it was never pointed at. So this
 * test enumerates the frontend tree itself and requires each public phone-
 * collecting form to reference the shared wording or the shared component. It sits
 * beside `consentTextParity.test.ts`, which already reads frontend source as text
 * for the same reason: the backend is where the consent contract is defined, and
 * the backend jest run is the gate that actually blocks a merge.
 *
 * ── HOW TO MAKE IT PASS WHEN IT FAILS ───────────────────────────────────────
 *
 * Either wire the form up — `shouldAskPhoneConsent(phone)` for the gate and
 * `PHONE_CONSENT_TEXT` for the wording, then send `phone_consent` — or, if the
 * surface genuinely is not a public consent surface, add it to INTERNAL_SURFACES
 * below WITH A REASON. The list is deliberately explicit: an exemption should cost
 * somebody a sentence of justification, because "it is fine, it is internal" is
 * precisely the judgement that was wrong the first time.
 */

const FRONTEND_SRC = path.join(__dirname, '..', '..', '..', '..', '..', 'frontend', 'src');

/**
 * Surfaces that take a phone but are NOT public marketing capture, each with the
 * reason it is not one. Paths are relative to `frontend/src`, POSIX separators.
 */
const INTERNAL_SURFACES: Readonly<Record<string, string>> = {
  'components/admin/internship/SpokenIntake.tsx':
    'Admin-side intake. Staff type an applicant\'s details; the applicant is not at the screen, so there is no affirmative act to record here.',
  'components/campaign/SettingsTab.tsx':
    'Admin campaign settings — the test-mode redirect number, not a member of the public.',
  'pages/portal/internship/InternshipPage.tsx':
    'Authenticated portal. A learner maintaining their own contact details on their own account.',
  'pages/portal/projects/IntakeReviewPane.tsx':
    'Authenticated portal, reviewing an intake that already happened elsewhere.',
  'pages/referrals/ReferralDashboardPage.tsx':
    'Authenticated referrer completing their OWN profile. Not a marketing opt-in, and a referrer cannot consent on the referred person\'s behalf anyway.',
};

/** Walk the tree once rather than globbing, so nothing depends on a glob library. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(tsx|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (file: string) => path.relative(FRONTEND_SRC, file).split(path.sep).join('/');

/** A file that renders a telephone input. */
function collectsAPhone(src: string): boolean {
  return /type=(["'])tel\1/.test(src);
}

/** Does it ask permission — by the shared gate, the shared component, or the wording? */
function asksPermission(src: string): boolean {
  return (
    src.includes('PHONE_CONSENT_TEXT') ||
    src.includes('PhoneConsentCheckbox') ||
    src.includes('shouldAskPhoneConsent')
  );
}

describe('every public form that collects a phone asks permission to use it', () => {
  const files = walk(FRONTEND_SRC);
  const phoneForms = files.filter((f) => collectsAPhone(fs.readFileSync(f, 'utf8')));

  it('found the frontend tree where this test expects it', () => {
    // A moved directory must fail as a missing directory, never as a suite that
    // sweeps zero files and reports success.
    expect(fs.existsSync(FRONTEND_SRC)).toBe(true);
    expect(files.length).toBeGreaterThan(100);
  });

  it('found some phone-collecting forms, so the assertion below is not vacuous', () => {
    // Fail on the instrument before trusting it. If `type="tel"` stopped matching
    // — a formatting change, a new input component — every assertion here would
    // pass by having nothing to check.
    expect(phoneForms.length).toBeGreaterThanOrEqual(8);
  });

  it('every one of them either asks permission or is a declared internal surface', () => {
    const offenders = phoneForms
      .map((f) => rel(f))
      .filter((r) => !(r in INTERNAL_SURFACES))
      .filter((r) => !asksPermission(fs.readFileSync(path.join(FRONTEND_SRC, r), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('has no stale exemptions', () => {
    // An exemption for a file that no longer collects a phone (or no longer
    // exists) is a note about a decision nobody can check. Removing it is free;
    // leaving it rots the list until the list stops being read.
    const live = new Set(phoneForms.map((f) => rel(f)));
    const stale = Object.keys(INTERNAL_SURFACES).filter((r) => !live.has(r));

    expect(stale).toEqual([]);
  });

  it('every exemption carries a real reason', () => {
    for (const [file, reason] of Object.entries(INTERNAL_SURFACES)) {
      expect(reason.length).toBeGreaterThan(40);
      expect(reason).not.toMatch(/^(internal|n\/a|tbd|todo)\.?$/i);
      expect(file).toMatch(/\.(tsx|jsx)$/);
    }
  });
});

describe('the backend endpoints those forms post to record the grant', () => {
  const BACKEND_SRC = path.join(__dirname, '..', '..', '..');

  /**
   * Each public entry point that accepts a `phone`, and the file that must write
   * the grant for it. Without this half, a form could ask beautifully and the
   * answer would go nowhere — which is the same defect with better manners.
   */
  const ENTRY_POINTS: Readonly<Record<string, string>> = {
    'controllers/calendarController.ts': 'POST /api/calendar/book — the strategy-call modal behind fifteen landing pages',
    'controllers/leadController.ts': 'POST /api/leads — the contact form, the shared lead-capture form, the AI pilot pages, the publicV2 pages',
    'controllers/enrollmentController.ts': 'POST /api/create-free-account — /enroll',
  };

  it.each(Object.entries(ENTRY_POINTS))(
    '%s calls capturePhoneConsent (%s)',
    (file) => {
      const src = fs.readFileSync(path.join(BACKEND_SRC, file), 'utf8');
      expect(src).toContain('capturePhoneConsent');
    },
  );

  it('the schemas those endpoints validate against accept phone_consent', () => {
    // A form can send the key and a schema that has never heard of it will drop it
    // without complaint (none of these three is `.strict()`), so the grant would
    // vanish between the tick and the table with nothing logged.
    const files = [
      'schemas/calendarSchema.ts',
      'schemas/enrollmentSchema.ts',
      'services/leadService.ts',
    ];

    for (const f of files) {
      expect(fs.readFileSync(path.join(BACKEND_SRC, f), 'utf8')).toContain('phone_consent');
    }
  });
});
