/**
 * Sync guard: workforceIntelligenceEngine.ts's ticket-creation logic is explicitly out
 * of scope for the auto-resolver (see workforceTicketAutoResolver.ts's file header),
 * so its threshold literals are duplicated rather than imported. This test reads the
 * REAL source file directly (not a copy, not a mock) and fails loudly the moment
 * someone changes the creation-side threshold without updating the resolver to match —
 * the two must never silently drift apart.
 */
import fs from 'fs';
import path from 'path';
import {
  WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT,
  WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT,
} from '../workforceTicketAutoResolver';

describe('workforceIntelligenceEngine.ts threshold literals stay in sync with the resolver', () => {
  it('the real source file\'s condition matches the resolver\'s exported constants exactly', () => {
    const sourcePath = path.join(__dirname, '..', 'workforceIntelligenceEngine.ts');
    const source = fs.readFileSync(sourcePath, 'utf8');

    const match = source.match(/errorRate\s*>\s*(\d+)\s*&&\s*a\.error_count\s*>=\s*(\d+)/);
    expect(match).not.toBeNull();

    const [, thresholdPctStr, minCountStr] = match as RegExpMatchArray;
    expect(Number(thresholdPctStr)).toBe(WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT);
    expect(Number(minCountStr)).toBe(WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT);
  });
});
