/**
 * briefParser and workOrder.
 *
 * The fixtures below are shortened from REAL production descriptions (C9.15, D12, C9.12), because
 * the whole premise of parsing rather than inferring is that the tickets follow a house pattern.
 * A fixture invented to match the parser would prove nothing.
 *
 * The cases that matter are the ones where being wrong costs something: proposing that a session
 * act on a decision that is Ali's to make, inventing an owner or a deadline the ticket never
 * stated, and losing the difference between "the ticket does not say" and "nobody looked".
 */
const { parseBrief, htmlToText } = require('../briefParser');
const { buildWorkOrder, proposeDisposition, renderWorkOrderText, runCommand } = require('../workOrder');

const TODAY = '2026-11-11T12:00:00Z';

const DECISION_HTML = '<div dir="auto"><strong>Decision owner: Ram and Ali</strong></div>'
  + '<div dir="auto"> <strong>Decide by:</strong> 2027-06-30</div><br>'
  + '<div dir="auto"> <strong>The decision.</strong> Go or no-go on the 10,000-learner target '
  + 'against measured conversion.</div><br>'
  + '<div dir="auto"> <strong>Why.</strong> Because the target was set before we had conversion data.</div>';

const WORK_HTML = '<div dir="auto">Source of truth: COMMERCIALIZATION MASTER INDEX - read this '
  + 'before working the ticket.</div>'
  + '<div dir="auto">Canonical folder for this ticket\'s artifact: 09 - Launch &amp; Conversion - '
  + 'upload once here, then link. Never re-upload into another folder.</div>'
  + '<div dir="auto">Rebuild the conversion chart from the measured funnel and publish it.</div>';

const row = (over = {}) => ({
  bc_id: 123, project_id: 456, title: 'Rebuild the conversion chart',
  description: WORK_HTML, category: 'waiting_dependency', due_on: '2026-11-04',
  urgency_score: 70, bc_app_url: 'https://3.basecamp.com/x/y/123', todolist_name: 'Commercialization',
  ...over,
});

describe('htmlToText', () => {
  /** Without this, every div runs into the next sentence and the labels stop matching. */
  it('turns block tags into line breaks instead of concatenating sentences', () => {
    const t = htmlToText('<div>one</div><div>two</div>');
    expect(t.split('\n')).toEqual(['one', 'two']);
  });

  it('decodes the entities Basecamp actually emits', () => {
    expect(htmlToText('<div>Launch &amp; Conversion &quot;x&quot;</div>')).toBe('Launch & Conversion "x"');
  });

  it('returns an empty string for null rather than the word null', () => {
    expect(htmlToText(null)).toBe('');
  });
});

describe('parseBrief', () => {
  it('extracts the labelled fields from a real decision ticket', () => {
    const b = parseBrief(DECISION_HTML);
    expect(b.owner).toBe('Ram and Ali');
    expect(b.decideBy).toBe('2027-06-30');
    expect(b.decision).toMatch(/Go or no-go on the 10,000-learner target/);
    expect(b.why).toMatch(/set before we had conversion data/);
  });

  it('extracts the pointers a session would otherwise hunt for', () => {
    const b = parseBrief(WORK_HTML);
    expect(b.sourceOfTruth).toBe('COMMERCIALIZATION MASTER INDEX');
    expect(b.artifactFolder).toBe('09 - Launch & Conversion');
  });

  /** The boilerplate is an instruction to the reader, not part of the value. */
  it('trims the house boilerplate off the end of a field', () => {
    expect(parseBrief(WORK_HTML).sourceOfTruth).not.toMatch(/read this before/i);
    expect(parseBrief(WORK_HTML).artifactFolder).not.toMatch(/upload once here/i);
  });

  it('summarizes with the real work, not with "read the master index"', () => {
    expect(parseBrief(WORK_HTML).summary).toMatch(/Rebuild the conversion chart/);
  });

  it('prefers the stated decision as the summary when there is one', () => {
    expect(parseBrief(DECISION_HTML).summary).toMatch(/Go or no-go/);
  });

  it('leaves absent fields null, so "not stated" is distinguishable from "not looked at"', () => {
    const b = parseBrief('<div>Just a sentence.</div>');
    expect(b.owner).toBeNull();
    expect(b.doneWhen).toBeNull();
    expect(b.found).toEqual([]);
  });

  it('does not invent a deadline that the ticket never stated', () => {
    expect(parseBrief(WORK_HTML).decideBy).toBeNull();
  });
});

describe('proposeDisposition', () => {
  const band = (k) => ({ key: k });

  it('refuses to act on anything framed as a decision', () => {
    const d = proposeDisposition(row({ title: 'D12 - Go or no-go on the target' }), parseBrief(DECISION_HTML), band('overdue'));
    expect(d.key).toBe('ask');
    expect(d.reason).toMatch(/decision owner \(Ram and Ali\)/);
  });

  it('respects an explicit human_required classification', () => {
    const d = proposeDisposition(row({ category: 'human_required' }), parseBrief(WORK_HTML), band('overdue'));
    expect(d.key).toBe('ask');
  });

  it('proposes acting on a live task with nothing blocking it', () => {
    const d = proposeDisposition(row(), parseBrief(WORK_HTML), band('overdue'));
    expect(d.key).toBe('act');
  });

  it('proposes closing a dormant task rather than silently working it', () => {
    const d = proposeDisposition(row(), parseBrief(WORK_HTML), band('dormant'));
    expect(d.key).toBe('close');
  });

  it('proposes a draft when the ticket names what it is waiting on', () => {
    const b = parseBrief('<div>Waiting on: Ram to confirm the budget</div><div>Then send it.</div>');
    const d = proposeDisposition(row(), b, band('overdue'));
    expect(d.key).toBe('draft');
    expect(d.reason).toMatch(/Ram to confirm the budget/);
  });

  it('always carries a reason, so no verdict is unexplained', () => {
    ['act', 'draft', 'ask', 'close'].forEach(() => {
      const d = proposeDisposition(row(), parseBrief(WORK_HTML), band('overdue'));
      expect(d.reason).toBeTruthy();
    });
  });
});

describe('buildWorkOrder', () => {
  it('carries the identifiers a session needs to act without a lookup', () => {
    const wo = buildWorkOrder(row(), TODAY);
    expect(wo.id).toBe('456/123');
    expect(wo.url).toBe('https://3.basecamp.com/x/y/123');
    expect(wo.daysOverdue).toBe(7);
    expect(wo.band).toBe('overdue');
  });

  it('records which fields were parsed, so the gaps are visible', () => {
    const wo = buildWorkOrder(row(), TODAY);
    expect(wo.parsedFields).toContain('sourceOfTruth');
    expect(wo.parsedFields).toContain('artifactFolder');
    expect(wo.doneWhen).toBeNull();
  });
});

describe('renderWorkOrderText', () => {
  it('says plainly when done-when is missing instead of leaving a blank', () => {
    expect(renderWorkOrderText(buildWorkOrder(row(), TODAY))).toMatch(/NOT STATED in the ticket/);
  });

  it('flags the ticket\'s own deadline as better than the cohort due date', () => {
    const wo = buildWorkOrder(row({ description: DECISION_HTML }), TODAY);
    expect(renderWorkOrderText(wo)).toMatch(/decide by\s+2027-06-30/);
    expect(renderWorkOrderText(wo)).toMatch(/not the cohort due date/);
  });

  it('is plain text, so it survives a copy out of a browser into a terminal', () => {
    const t = renderWorkOrderText(buildWorkOrder(row(), TODAY));
    expect(t).not.toMatch(/<[a-z]/i);
  });

  it('leads with the ticket id and title', () => {
    expect(renderWorkOrderText(buildWorkOrder(row(), TODAY))).toMatch(/^TICKET 456\/123 {2}Rebuild/);
  });
});

describe('runCommand', () => {
  it('is one short line, because it has to live at the top of an email', () => {
    const c = runCommand('TRIAGE-2026-11-11', { top: 5 });
    expect(c).toBe('/ata-work TRIAGE-2026-11-11 --top 5');
    expect(c.length).toBeLessThan(60);
  });
});

/**
 * Human-only tickets, and the skill the ticket names.
 *
 * Both found by rendering against production rather than by reading the code. 13 of 425 work
 * orders read "Act now" directly above a brief saying "Required skill: none - human task" - the
 * ticket stated the answer and the proposer ignored it. And 32 tickets name /loop-architect in a
 * "Required skill" line, which was being thrown away.
 */
describe('tickets that declare themselves human-only', () => {
  const human = (body) => row({ description: `<div>${body}</div>` });

  it.each([
    ['Required skill: none - human task'],
    ['Required skill: none - human/physical task, no code'],
    ['Required skill: none - governance task'],
    ['\u{1F9D1} [Human] Human task: a filing, signature, decision, or payment.'],
    ['Required skill: none - human decision'],
  ])('never proposes session work for: %s', (body) => {
    const wo = buildWorkOrder(human(body), TODAY);
    expect(wo.disposition).toBe('prep');
    expect(['act', 'draft']).not.toContain(wo.disposition);
  });

  it('explains that a session can only prepare it', () => {
    const wo = buildWorkOrder(human('Required skill: none - human task'), TODAY);
    expect(wo.dispositionReason).toMatch(/a person has to do this/);
    expect(renderWorkOrderText(wo)).toMatch(/Prep for a human/);
  });

  /** The ticket's own words outrank the inference, so this must win even on a live, unblocked task. */
  it('outranks the "nothing is blocking it, act" path', () => {
    const wo = buildWorkOrder(human('Required skill: none - human task'), TODAY);
    expect(wo.humanOnly).toBe(true);
    expect(wo.disposition).toBe('prep');
  });

  it('does not flag an ordinary ticket as human-only', () => {
    expect(buildWorkOrder(row(), TODAY).humanOnly).toBe(false);
  });
});

describe('the skill the ticket names', () => {
  it('extracts and normalises it', () => {
    const wo = buildWorkOrder(row({ description: '<div>Required skill: /loop-architect (required)</div><div>Do the thing.</div>' }), TODAY);
    expect(wo.skill).toBe('/loop-architect');
  });

  it('tells the session to start with it', () => {
    const wo = buildWorkOrder(row({ description: '<div>Required skill: /loop-architect (required)</div><div>Do the thing.</div>' }), TODAY);
    expect(renderWorkOrderText(wo)).toMatch(/start with\s+\/loop-architect/);
    expect(renderWorkOrderText(wo)).toMatch(/named by the ticket/);
  });

  it('is null when the ticket names no skill, rather than guessing one', () => {
    expect(buildWorkOrder(row(), TODAY).skill).toBeNull();
  });

  it('does not read a skill out of "none - human task"', () => {
    const wo = buildWorkOrder(row({ description: '<div>Required skill: none - human task</div>' }), TODAY);
    expect(wo.skill).toBeNull();
  });
});
