import { deriveIsIntern } from '../useInternshipNav';
import { InternshipStatus, InternshipCardState } from '../../../services/internshipApi';

// deriveIsIntern is the who-sees-the-"Internship"-tab rule. Pure function, so no
// hook or fetch is mocked — each case sets only the fields the predicate reads.
// The tab is for people IN the process or active interns, never the merely
// eligible recruiting audience or a flag-off portal.
function status(over: Partial<InternshipStatus>): InternshipStatus {
  return {
    card_state: 'none',
    render: true,
    may_pulse: false,
    actionable: false,
    title: '',
    cta: null,
    application: null,
    ...over,
  };
}
function app(over: Partial<NonNullable<InternshipStatus['application']>> = {}): InternshipStatus['application'] {
  return { id: 'a1', state: 'started', interview_channel: null, submitted_at: null, is_terminal: false, ...over };
}

describe('deriveIsIntern', () => {
  it('shows the tab for an active intern', () => {
    expect(deriveIsIntern(status({ card_state: 'active', application: app({ state: 'active' }) }))).toBe(true);
  });

  it('shows the tab for a live, non-terminal application at any in-process stage', () => {
    for (const s of ['started', 'under_review', 'approved_documents_pending', 'documents_uploaded'] as InternshipCardState[]) {
      expect(deriveIsIntern(status({ card_state: s, application: app({ state: s }) }))).toBe(true);
    }
  });

  it('hides the tab for the merely eligible — flag on, but no application yet', () => {
    expect(deriveIsIntern(status({ card_state: 'eligible', application: null }))).toBe(false);
  });

  it('hides the tab when the internship feature is off (render:false)', () => {
    expect(deriveIsIntern(status({ card_state: 'active', render: false, application: app() }))).toBe(false);
  });

  it('hides the tab for a rejected / terminal application', () => {
    expect(deriveIsIntern(status({ card_state: 'rejected', application: app({ state: 'rejected', is_terminal: true }) }))).toBe(false);
  });

  it('still shows the tab for a waitlisted, non-terminal application (they are still in the process)', () => {
    expect(deriveIsIntern(status({ card_state: 'waitlisted', application: app({ state: 'waitlisted', is_terminal: false }) }))).toBe(true);
  });

  it('hides the tab for a "none" card state with no application', () => {
    expect(deriveIsIntern(status({ card_state: 'none', application: null }))).toBe(false);
  });
});
