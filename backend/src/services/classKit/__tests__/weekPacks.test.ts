import { packedWeeks, weekPack } from '../../../data/weekPacks';
import type { TeachSlide } from '../../../data/classTeachContent';

/**
 * weekPacks.test.ts — the quality gate every authored week must clear.
 *
 * Weeks 4-12 were authored in parallel, one agent per week, against the
 * standard set by Week 3 and the arc in
 * docs/training-program-2026-q3/TWELVE_WEEK_STORY_ARC.md. Consistency across
 * nine independently-written weeks cannot be eyeballed, so it is asserted:
 * every rule below is one an instructor would notice being broken mid-class.
 *
 * These run over whatever is registered in weekPacks.ts, so a newly added week
 * is held to the same bar automatically.
 */

// Segments whose teach slides actually render, per kitSpecDaySlides.ts. A slide
// tagged with anything else is silently dropped — the single most damaging
// authoring mistake possible here, because the content looks fine in the file.
const MONDAY_TEACH_SEGMENTS = ['checkin', 'business-problem', 'architecture', 'deconstruct', 'micro-build'];
const THURSDAY_TEACH_SEGMENTS = ['build-map', 'guided-build', 'failure'];

// Segments that accept an interaction, per the pushInteractions calls.
const MONDAY_Q_SEGMENTS = ['cold-open', 'checkin', 'business-problem', 'architecture', 'deconstruct', 'micro-build', 'challenge', 'trivia', 'trailer'];
const THURSDAY_Q_SEGMENTS = ['result-preview', 'readiness', 'build-map', 'guided-build', 'failure', 'demos', 'broadcast', 'cta'];

// Segments whose story beats are spliced in.
const MONDAY_BEAT_SEGMENTS = ['checkin', 'business-problem', 'architecture', 'deconstruct', 'micro-build'];
const THURSDAY_BEAT_SEGMENTS = ['result-preview', 'build-map', 'failure'];

const TONES = ['cherry', 'berry', 'amber', 'leaf', 'violet'];

/** Model ids that no longer exist or are superseded. */
const DEAD_MODEL_IDS = ['claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-3-opus', 'claude-3-5-sonnet', 'claude-2'];

const WEEKS = packedWeeks();

describe('week pack registry', () => {
  it('registers each week at most once, in ascending order', () => {
    expect(new Set(WEEKS).size).toBe(WEEKS.length);
    expect([...WEEKS].sort((a, b) => a - b)).toEqual(WEEKS);
  });

  it('every registered pack reports the week it claims to be', () => {
    WEEKS.forEach((w) => expect(weekPack(w)!.week).toBe(w));
  });
});

// Guarded so an empty registry is a no-op rather than a suite-level crash
// (`describe.each([])` throws). Once weeks are registered this fans out one
// describe block per week automatically.
// eslint-disable-line
(WEEKS.length ? describe.each(WEEKS) : (() => () => { /* no packs registered */ }))('week %i content pack', (week: number) => {
  const pack = weekPack(week)!;

  it('declares its place in the 12-week arc', () => {
    expect(pack.arcBeat).toBeTruthy();
    expect(pack.arcBeat.length).toBeGreaterThan(20);
  });

  describe.each([
    ['monday', MONDAY_TEACH_SEGMENTS, MONDAY_Q_SEGMENTS, MONDAY_BEAT_SEGMENTS] as const,
    ['thursday', THURSDAY_TEACH_SEGMENTS, THURSDAY_Q_SEGMENTS, THURSDAY_BEAT_SEGMENTS] as const,
  ])('%s', (day, teachSegs, qSegs, beatSegs) => {
    const d = pack[day];

    it('has enough teach slides to fill a 2-hour class', () => {
      // Weeks 1-2 were taught to a live cohort BEFORE this standard existed and
      // were migrated field-for-field rather than rewritten, so they keep their
      // original (shorter) slide counts by design — Week 1 Thursday in
      // particular spends its time waiting for a room of beginners to finish
      // five install checkpoints, not advancing slides. The floor is here to
      // catch a newly authored week that is too thin to fill the room, which
      // is a different thing from a proven week that is deliberately spare.
      const PRESERVED_WEEKS = [1, 2];
      if (PRESERVED_WEEKS.includes(week)) {
        expect(d.teach.length).toBeGreaterThanOrEqual(day === 'monday' ? 12 : 8);
        return;
      }
      expect(d.teach.length).toBeGreaterThanOrEqual(day === 'monday' ? 14 : 11);
    });

    it('every teach slide renders — no slide tagged to a segment that is silently dropped', () => {
      const orphans = d.teach.filter((s: TeachSlide) => !teachSegs.includes(s.segment));
      expect(orphans.map((s) => `${s.segment}: ${s.title}`)).toEqual([]);
    });

    it('every teach slide carries a mermaid diagram', () => {
      const missing = d.teach.filter((s: TeachSlide) => !s.diagram || !/flowchart|sequenceDiagram|graph /.test(s.diagram));
      expect(missing.map((s) => s.title)).toEqual([]);
    });

    it('diagrams stay small enough to read when zoomed to full screen', () => {
      // Node count is approximated by bracketed labels; >9 is unreadable from
      // the back of a room and on the class recording.
      const tooBig = d.teach.filter((s: TeachSlide) => ((s.diagram || '').match(/\[/g) || []).length > 9);
      expect(tooBig.map((s) => s.title)).toEqual([]);
    });

    // CONSISTENCY, not correctness. Verified in a real browser against
    // mermaid 11: a literal \n inside a quoted label renders as a line break,
    // pixel-identical to <br/>. Both work. This rule exists only so all 24
    // sessions use one convention — do not "fix" a week on the belief that \n
    // renders as visible text, because it does not.
    it('diagram labels use <br/> for line breaks, one convention across all weeks', () => {
      const bad = d.teach.filter((s: TeachSlide) => /\["[^"]*\\n/.test(s.diagram || ''));
      expect(bad.map((s) => s.title)).toEqual([]);
    });

    it('every teach slide carries an instructor script', () => {
      const missing = d.teach.filter((s: TeachSlide) => !s.script || s.script.length < 20);
      expect(missing.map((s) => s.title)).toEqual([]);
    });

    it('shows at least one read-along code block — the class reads what Claude Code wrote', () => {
      const withCode = d.teach.filter((s: TeachSlide) => s.code);
      expect(withCode.length).toBeGreaterThan(0);
      expect(withCode.some((s) => s.code!.kind === 'review')).toBe(true);
    });

    it('never labels a terminal command as a Claude Code prompt', () => {
      const mislabelled = d.teach.filter((s: TeachSlide) => {
        const c = s.code;
        if (!c || c.kind === 'review') return false;
        const target = (c.pasteWhere || 'Claude Code').toLowerCase();
        // "your TERMINAL (not Claude Code)" MENTIONS Claude Code while
        // explicitly not being it — match the target, not the substring.
        const targetsClaudeCode = /claude code/.test(target)
          && !/not claude code|terminal|shell|bash|powershell|command line/.test(target);
        const looksLikeShell = /^\s*(pip |npm |npx |export |cd |python |node |git |docker |\$env:)/m.test(c.code);
        return looksLikeShell && targetsClaudeCode;
      });
      expect(mislabelled.map((s) => s.title)).toEqual([]);
    });

    it('carries enough participation questions to keep a 2-hour room engaged', () => {
      expect((d.extraInteractions || []).length).toBeGreaterThanOrEqual(5);
    });

    it('every question is placed on a segment that renders it', () => {
      const orphans = (d.extraInteractions || []).filter((q) => !qSegs.includes(q.segment));
      expect(orphans.map((q) => `${q.segment}: ${q.q}`)).toEqual([]);
    });

    it('every question is well-formed and coachable', () => {
      (d.extraInteractions || []).forEach((q) => {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.presenterTip).toBeTruthy();
        // A question with a correct answer must explain WHY on reveal,
        // otherwise the instructor has nothing to say after the vote.
        if (typeof q.answer === 'number') {
          expect(q.answer).toBeLessThan(q.options.length);
          expect(q.reveal).toBeTruthy();
        }
      });
    });

    it('uses full-screen theater sparingly — it stops the class', () => {
      const theater = (d.extraInteractions || []).filter((q) => q.theater);
      expect(theater.length).toBeLessThanOrEqual(1);
    });

    it('has story beats, placed where they are spliced in', () => {
      const beats = d.storyBeats || {};
      const total = Object.values(beats).flat().length;
      expect(total).toBeGreaterThanOrEqual(3);
      expect(Object.keys(beats).filter((k) => !beatSegs.includes(k))).toEqual([]);
    });

    it('story beats are stories — icon, narrative body, valid tone', () => {
      Object.values(d.storyBeats || {}).flat().forEach((b) => {
        expect(b.icon).toBeTruthy();
        expect(b.title).toBeTruthy();
        expect(b.body.length).toBeGreaterThan(120); // a summary is not a story
        if (b.tone) expect(TONES).toContain(b.tone);
      });
    });

    it('teaches only current API surface — no superseded model ids', () => {
      const json = JSON.stringify(d);
      DEAD_MODEL_IDS.forEach((id) => expect(json).not.toContain(id));
    });

    it('never uses the deprecated top-level output_format parameter', () => {
      const json = JSON.stringify(d);
      const uses = (json.match(/output_format/g) || []).length;
      // It may appear ONLY inside an explicit "not the deprecated one" warning.
      const warnings = (json.match(/deprecated[^"]{0,60}output_format|output_format[^"]{0,40}deprecated/g) || []).length;
      expect(uses).toBe(warnings);
    });
  });

  it('Monday opens with a hook and Thursday closes with a before/after', () => {
    expect(pack.monday.hook?.headline).toBeTruthy();
    expect(pack.thursday.beforeAfter?.before.length).toBeGreaterThan(0);
    expect(pack.thursday.beforeAfter?.after.length).toBeGreaterThan(0);
  });
});
