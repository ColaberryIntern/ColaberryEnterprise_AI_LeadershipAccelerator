import {
  deriveExecutionMode,
  fulfilledReqIds,
  reqState,
} from '../../services/buildPlanIngestHelpers';

describe('buildPlanIngestHelpers (pure logic)', () => {
  describe('deriveExecutionMode', () => {
    test('build / code tasks default to ai_with_approval', () => {
      expect(
        deriveExecutionMode({ id: 'STORY-1', title: 'Implement the pantry MCP tool', build: 'write the handler + tests' })
      ).toBe('ai_with_approval');
    });

    test('human decision / approval tasks route to human', () => {
      expect(deriveExecutionMode({ id: 'STORY-2', title: 'Approve the final pricing with the client' })).toBe('human');
      expect(deriveExecutionMode({ id: 'STORY-3', title: 'Present the demo at the expo' })).toBe('human');
      expect(
        deriveExecutionMode({ id: 'STORY-4', title: 'Ship API', build: 'Get stakeholder sign-off before release' })
      ).toBe('human');
    });

    test('empty story is safe and defaults to ai_with_approval', () => {
      expect(deriveExecutionMode({ id: 'STORY-5', title: '' })).toBe('ai_with_approval');
    });
  });

  describe('fulfilledReqIds', () => {
    test('collects REQ ids across all stories, deduped', () => {
      const f = fulfilledReqIds([
        { id: 'S1', title: 't', fulfills: ['REQ-1', 'REQ-2'] },
        { id: 'S2', title: 't', fulfills: ['REQ-2'] },
        { id: 'S3', title: 't' },
      ]);
      expect(f.has('REQ-1')).toBe(true);
      expect(f.has('REQ-2')).toBe(true);
      expect(f.has('REQ-9')).toBe(false);
      expect(f.size).toBe(2);
    });

    test('handles empty input', () => {
      expect(fulfilledReqIds([]).size).toBe(0);
    });
  });

  describe('reqState', () => {
    test('seeds planned when fulfilled, unmapped otherwise', () => {
      const f = new Set(['REQ-1']);
      expect(reqState('REQ-1', f)).toBe('planned');
      expect(reqState('REQ-2', f)).toBe('unmapped');
    });
  });
});
