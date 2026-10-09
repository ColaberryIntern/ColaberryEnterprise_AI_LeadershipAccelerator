import fs from 'fs';
import path from 'path';

/**
 * PRESSING "JOIN" IS NOT PRESENTING, AND IT IS NOT EVEN ATTENDING.
 *
 * Three different facts get confused the moment students can open a room:
 *
 *   intent     — they asked for the link. Recorded before the meeting opens.
 *   attendance — a provider report says they were actually in the room.
 *   presented  — a human watched them present and vouched for it.
 *
 * Only the third may complete PREP-6, and only staff may assert it. The cheapest
 * way for that to break is not malice: it is a reasonable-looking change that
 * treats `attended = true` as attendance, or lets the launch path mark a task done
 * because the student clearly showed up.
 *
 * Source-level, deliberately. A runtime test only covers the paths it calls; this
 * covers every line that ships in the presentation services.
 */

const SRC = path.join(__dirname, '..', '..', '..');
const PRESENTATION = path.join(SRC, 'services', 'presentation');

/** Assembled from parts so the literal never appears in a scannable file. */
const COMPLETION_WRITER = ['mark', 'Task', 'Verified', 'Complete'].join('');

/**
 * Matches a CALL or an IMPORT of the completion writer — never a mention of it.
 *
 * Built once, because the first version inlined it twice and a mangled escape
 * turned `\b` into a literal backspace in both copies, so the pattern matched
 * nothing and the guard silently passed. The positive control below is what
 * caught that, and it only works if it tests the same regex the guard uses.
 */
const callOrImport = (): RegExp => new RegExp(
  '(\\b' + COMPLETION_WRITER + '\\s*\\()'
  + '|(import[^;]*\\b' + COMPLETION_WRITER + '\\b[^;]*from)',
);

function filesIn(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      filesIn(full, out);
    } else if (/\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const PRESENTATION_FILES = filesIn(PRESENTATION);

describe('nothing in the Presentation Studio can complete a task', () => {
  it('is reading a real set of presentation services', () => {
    // Positive control: an empty sweep would make every assertion below vacuous.
    expect(PRESENTATION_FILES.length).toBeGreaterThan(5);
    const names = PRESENTATION_FILES.map((f) => path.basename(f));
    expect(names).toContain('presentationLaunchService.ts');
    expect(names).toContain('presentationPracticeService.ts');
  });

  it('no presentation service CALLS or IMPORTS the canonical completion writer', () => {
    // Deliberately a call/import check, not a mention check. The first version of
    // this test flagged presentationAssignmentService for a comment that says
    // "nothing here completes a task" and names the writer — documentation that
    // states the rule, not a breach of it. Banning the word would delete the
    // clearest explanation of the invariant in the codebase.
    //
    // (Contrast the provider host-URL guard, which DOES ban the bare string: there
    // the danger is reading the field at all, so no legitimate mention exists.)
    const re = callOrImport();
    const offenders = PRESENTATION_FILES
      .filter((f) => re.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f));
    // Completion is granted by staff through demoEvidenceService, never claimed by
    // a student finishing a rehearsal.
    expect(offenders).toEqual([]);
  });

  it('that call/import check can actually tell a call from a mention', () => {
    // POSITIVE CONTROL for the regex above. A pattern that matched nothing would
    // make the previous test pass no matter what shipped.
    const re = callOrImport();
    expect(re.test('await ' + COMPLETION_WRITER + '(projectId, storyId);')).toBe(true);
    expect(re.test("import { " + COMPLETION_WRITER + " } from '../x';")).toBe(true);
    expect(re.test(' * NOTHING HERE COMPLETES A TASK. ' + COMPLETION_WRITER + ' remains the only writer.')).toBe(false);
  });

  it('no presentation service awards points', () => {
    // Points follow completion. A rehearsal that paid out would make practice
    // farmable, which is the same hole the attendance award had.
    const offenders = PRESENTATION_FILES
      .filter((f) => /\bpayPrepTask\b|\bawardPoints\b/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('the launch path records intent and nothing stronger', () => {
    const src = fs.readFileSync(path.join(PRESENTATION, 'presentationLaunchService.ts'), 'utf8');
    expect(src).toContain('join_intent_at');
    // It must not set an attempt to a state that claims the demo happened.
    expect(src).not.toMatch(/attempt_state:\s*'(recorded|reviewed|final_selected)'/);
  });
});

describe('the health view never reports a click as attendance', () => {
  const health = fs.readFileSync(
    path.join(SRC, 'services', 'communityRooms', 'roomHealthService.ts'), 'utf8',
  );

  it('is reading the real health service', () => {
    expect(health.length).toBeGreaterThan(500);
    expect(health).toContain('CommunityRoomsHealth');
  });

  it('counts join-intent separately from confirmed attendance', () => {
    expect(health).toContain('join_intent');
    expect(health).toContain('attended_confirmed');
  });

  it('excludes intent rows from the confirmed-attendance count', () => {
    // Without this, every student who pressed join becomes an attendance statistic.
    expect(health).toMatch(/attended:\s*true,\s*attendance_source:\s*\{\s*\[Op\.ne\]:\s*'intent'\s*\}/);
  });

  it('no longer publishes a percentage that called intent "attendance"', () => {
    // The old `rsvp_to_attendance_pct` was computed from clicks. A number with the
    // wrong name is worse than no number: someone will plan around it.
    expect(health).not.toContain('rsvp_to_attendance_pct');
    expect(health).toContain('rsvp_to_intent_pct');
  });
});
