import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DraftSubject } from '../DecisionsTable';
import type { ExplorerDecisionRow } from '../../../services/explorerGrowthApi';

/**
 * The subject cell: four states, and why none of them may collapse into another.
 *
 * ── THE ONE THAT HIDES ──────────────────────────────────────────────────────
 *
 * Copy the quality gate REFUSED still has a subject, and a cell that printed only
 * `draft_subject` would render it identically to copy that passed. The refusal is
 * the most interesting row on the page — it is the system saying it wrote
 * something it would not send — and it would be the one row a reviewer could not
 * see. So the status is read, not just the subject, and that is asserted here
 * rather than left to the reader of the component.
 *
 * ── THE ONE THAT LIES BY OMISSION ───────────────────────────────────────────
 *
 * A WAIT was never going to send anything, so an empty cell is correct for it. An
 * actionable email decision with no draft is a different fact entirely — the
 * render has not run — and showing both as a dash tells a reviewer the system
 * decided to say nothing when it has merely not spoken yet.
 */

const BASE: ExplorerDecisionRow = {
  id: 'd1',
  enrollment_id: 'e1',
  lead_id: null,
  ghl_url: null,
  decision_date: '2026-10-27',
  mode: 'shadow',
  selected_action: 'SEND_EMAIL',
  channel: 'email',
  executed: false,
  reason: 'tier 7',
  suppressed_count: 0,
  asset_count: 1,
  email_normalized: 'learner@example.com',
  primary_state: 'ACTIVE_LEARNER',
  e_score: 10,
  i_score: 20,
  f_score: 30,
  scheduled_email_id: null,
  draft_subject: null,
  draft_status: null,
};

const html = (row: Partial<ExplorerDecisionRow>) =>
  renderToStaticMarkup(<DraftSubject row={{ ...BASE, ...row }} />);

const SUBJECT = 'This week in AI, for practitioners';

describe('a draft that passed the gate', () => {
  const markup = html({
    scheduled_email_id: 's1',
    draft_subject: SUBJECT,
    draft_status: 'explorer_draft',
  });

  it('shows the subject', () => {
    expect(markup).toContain(SUBJECT);
  });

  it('does NOT mark it as refused', () => {
    expect(markup).not.toContain('data-testid="draft-refused"');
    expect(markup).not.toContain('refused');
  });
});

describe('a draft the gate REFUSED', () => {
  const markup = html({
    scheduled_email_id: 's1',
    draft_subject: SUBJECT,
    draft_status: 'explorer_draft_rejected',
  });

  it('still shows the subject, because refused copy was still written', () => {
    expect(markup).toContain(SUBJECT);
  });

  it('SAYS it was refused — the assertion this cell exists for', () => {
    // Without this, a refusal is visually identical to a pass.
    expect(markup).toContain('data-testid="draft-refused"');
    expect(markup).toContain('refused by the quality gate');
  });

  it('is distinguishable from a passing draft by more than the subject text', () => {
    const passed = html({
      scheduled_email_id: 's1',
      draft_subject: SUBJECT,
      draft_status: 'explorer_draft',
    });
    expect(markup).not.toBe(passed);
  });
});

describe('no draft yet', () => {
  it('says so for an email action that SHOULD have produced one', () => {
    const markup = html({ selected_action: 'SEND_EMAIL', channel: 'email' });
    expect(markup).toContain('not drafted yet');
  });

  it.each(['RECOMMEND_LESSON', 'RECOVER_FRICTION'] as const)(
    'says so for %s too, which is also an email',
    (action) => {
      // These two are named after what the email is ABOUT, not after a channel.
      // Treating them as non-email is the scoping bug that would have skipped the
      // largest learner tier in the draft stage.
      const markup = html({ selected_action: action, channel: 'email' });
      expect(markup).toContain('not drafted yet');
    },
  );
});

describe('nothing was ever going to be sent', () => {
  it('shows a plain dash for a WAIT, not a gap', () => {
    const markup = html({ selected_action: 'WAIT', channel: 'email' });
    expect(markup).not.toContain('not drafted yet');
    expect(markup).toContain('—');
  });

  it('shows a plain dash for a non-email channel', () => {
    const markup = html({ selected_action: 'SEND_EMAIL', channel: 'in_app' });
    expect(markup).not.toContain('not drafted yet');
    expect(markup).toContain('—');
  });

  it('shows a plain dash when there is no channel at all', () => {
    const markup = html({ selected_action: 'SEND_EMAIL', channel: null });
    expect(markup).not.toContain('not drafted yet');
  });
});

describe('the subject is rendered as text', () => {
  it('escapes markup rather than interpreting it', () => {
    // The subject is model-written. It is content, never HTML.
    const markup = html({
      scheduled_email_id: 's1',
      draft_subject: '<img src=x onerror=alert(1)>',
      draft_status: 'explorer_draft',
    });
    expect(markup).not.toContain('<img');
    expect(markup).toContain('&lt;img');
  });
});
