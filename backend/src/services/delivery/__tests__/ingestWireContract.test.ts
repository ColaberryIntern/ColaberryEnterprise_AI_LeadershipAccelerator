/**
 * The ingest response key, checked on BOTH sides of the wire.
 *
 * This exists because of a defect that was invisible for two shipped features.
 *
 * `handleLeadIngest` returns `raw_payload_id` (snake_case) to the browser, while the
 * service it wraps returns `rawPayloadId` (camelCase). The public page was written against
 * the SERVICE'S TYPE rather than the actual response, so it read `result.body.rawPayloadId`,
 * got `undefined`, and quietly took the other branch:
 *
 *   - the "Call me now" write-up panel never opened by itself, and only ever appeared
 *     because a ?token= link was fed in by hand during verification;
 *   - the written form said "the team will be in touch" instead of starting the interview.
 *
 * Neither failed loudly. There was no error, no warning, and no failing test - an undefined
 * value is a perfectly good falsy value, so both features degraded to their fallback path
 * and looked deliberate.
 *
 * TypeScript could never have caught it: the boundary is JSON, and the page is not
 * TypeScript. So the contract is asserted here, across both files, in the only place that
 * can see both.
 */

import fs from 'fs';
import path from 'path';

const CONTROLLER = path.join(__dirname, '../../../controllers/leadIngestionController.ts');
const START_PAGE = path.join(
  __dirname,
  '../../../../../apps/ai-flotation-public/src/start/index.html',
);

const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('the ingest response key', () => {
  it('is serialised as raw_payload_id by the controller', () => {
    expect(read(CONTROLLER)).toContain('raw_payload_id:');
  });

  it('is read as raw_payload_id by the page that consumes it', () => {
    // If someone renames the response key, this fails here rather than as a feature that
    // silently stops opening.
    expect(read(START_PAGE)).toContain('raw_payload_id');
  });

  it('is never read as bare camelCase without the snake_case fallback', () => {
    const page = read(START_PAGE);

    // `rawPayloadId` may appear only as the second half of a fallback expression. A bare
    // read of it is the original bug.
    const bareReads = [...page.matchAll(/\.rawPayloadId/g)];
    bareReads.forEach((match) => {
      const context = page.slice(Math.max(0, match.index! - 120), match.index!);
      expect(context).toContain('raw_payload_id');
    });
  });

  it('starts the interview and the preview from the same resolved id', () => {
    const page = read(START_PAGE);
    // Both features hang off this one identity; if either stops using it they have drifted
    // apart and one of them will be reading a token the other never set.
    expect(page).toContain('startInterview(payloadId');
    expect(page).toContain('startPreview(callPayloadId)');
  });
});
