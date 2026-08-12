import { getTicketTypeLabel, getTicketTypeTone, buildTicketTypeFilterOptions } from '../ticketTypeMeta';
import { TONE } from '../../components/admin/shell/StatusBadge';

describe('ticketTypeMeta', () => {
  describe('getTicketTypeLabel / getTicketTypeTone', () => {
    const known: Array<[string, string]> = [
      ['task', 'Task'],
      ['bug', 'Bug'],
      ['feature', 'Feature'],
      ['curriculum', 'Curriculum'],
      ['agent_action', 'Agent Action'],
      ['strategic', 'Strategic'],
      ['student_support', 'Student Support'],
      ['reese_autonomous_outreach', 'Reese Outreach'],
    ];

    it.each(known)('labels %s as "%s"', (type, label) => {
      expect(getTicketTypeLabel(type)).toBe(label);
    });

    it('gives student_support and reese_autonomous_outreach real, distinct tones (not the generic neutral fallback)', () => {
      expect(getTicketTypeTone('student_support')).toBe('violet');
      expect(getTicketTypeTone('reese_autonomous_outreach')).toBe('teal');
      expect(getTicketTypeTone('student_support')).not.toBe('neutral');
      expect(getTicketTypeTone('reese_autonomous_outreach')).not.toBe('neutral');
      expect(getTicketTypeTone('student_support')).not.toBe(getTicketTypeTone('reese_autonomous_outreach'));
    });

    it('falls back gracefully (never throws, never returns empty) for a type that does not exist yet', () => {
      expect(getTicketTypeLabel('made_up_future_type')).toBe('Made Up Future Type');
      expect(getTicketTypeTone('made_up_future_type')).toBe('neutral');
    });

    it('handles empty/falsy input without throwing', () => {
      expect(getTicketTypeLabel('')).toBe('Unknown');
      expect(getTicketTypeTone('')).toBe('neutral');
    });
  });

  describe('buildTicketTypeFilterOptions', () => {
    it('never silently drops a real type present on real tickets, known or unknown', () => {
      const options = buildTicketTypeFilterOptions({
        task: 3,
        student_support: 2,
        made_up_type: 1,
      });
      expect(options).toHaveLength(3);
      const values = options.map((o) => o.value).sort();
      expect(values).toEqual(['made_up_type', 'student_support', 'task']);
      // The unrecognized type still gets a real, readable label, not a blank option.
      const madeUp = options.find((o) => o.value === 'made_up_type');
      expect(madeUp?.label).toBe('Made Up Type');
    });

    it('sorts by ticket count descending, ties broken alphabetically', () => {
      const options = buildTicketTypeFilterOptions({ bug: 1, task: 5, feature: 1 });
      expect(options.map((o) => o.value)).toEqual(['task', 'bug', 'feature']);
    });

    it('excludes types with zero real tickets and handles an empty/missing map', () => {
      expect(buildTicketTypeFilterOptions({ task: 0 })).toEqual([]);
      expect(buildTicketTypeFilterOptions(null)).toEqual([]);
      expect(buildTicketTypeFilterOptions(undefined)).toEqual([]);
    });
  });

  describe('StatusBadge tone distinctness (the "visually distinct" success criterion)', () => {
    it('violet and teal are each pairwise-distinct in both bg and fg from all 6 existing tones and from each other', () => {
      const tones = Object.keys(TONE) as Array<keyof typeof TONE>;
      expect(tones).toHaveLength(8);
      for (let i = 0; i < tones.length; i++) {
        for (let j = i + 1; j < tones.length; j++) {
          const a = TONE[tones[i]];
          const b = TONE[tones[j]];
          expect(a.bg === b.bg && a.fg === b.fg).toBe(false);
        }
      }
      // Specifically confirm violet/teal use their own dedicated tokens, not a reuse
      // of an existing status color under a new name.
      expect(TONE.violet.fg).toBe('var(--status-violet)');
      expect(TONE.teal.fg).toBe('var(--status-teal)');
    });
  });
});
