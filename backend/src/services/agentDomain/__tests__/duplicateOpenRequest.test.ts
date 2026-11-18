/**
 * AF11.15 — what counts as a duplicate open request, and what the refusal says.
 *
 * The rule has existed since AF11.2 and its boundary lived only in the shape of one SQL predicate.
 * That is fine until somebody hits it, at which point they get a sentence that cannot tell them
 * what to do. These tests pin the scope as a decision and pin the refusal to naming the request
 * it collided with.
 *
 * The scope itself is NOT widened here. Whether a second request against the same CAPABILITY is a
 * duplicate is a product decision Ali has not made, so the test asserts the current scope and
 * says so, rather than quietly encoding a guess as a requirement.
 */
import {
  DUPLICATE_OPEN_REQUEST,
  DUPLICATE_SCOPE,
  duplicateOpenRequest,
} from '../toolRequestContract';

describe('the scope is stated, not implied', () => {
  it('is exactly these four things', () => {
    expect([...DUPLICATE_SCOPE]).toEqual([
      'requester', 'status_submitted', 'agent_id', 'tool_name',
    ]);
  });

  it('does NOT include capability, which is the open question', () => {
    // Ali, 17 Nov: "You could be sending 3 tasks through the process, or 5 tasks through the
    // process, because they each have this approval process." Several open requests from one
    // builder is expected. Whether several against one CAPABILITY is also expected is undecided,
    // so it stays out of the scope and this test records why rather than asserting a guess.
    expect([...DUPLICATE_SCOPE]).not.toContain('capability_id');
  });

  it('does not scope across people, because that case has a better answer than a refusal', () => {
    // Two builders wanting the same tool is what AF11.4 exists for: the second is ASSIGNED the
    // tool the first one got. Refusing them would turn a good outcome into an error.
    expect([...DUPLICATE_SCOPE]).not.toContain('domain_key');
  });
});

describe('the refusal names the request it collided with', () => {
  it('quotes the title and the date it was filed', () => {
    const issue = duplicateOpenRequest({
      title: 'call_scan: flag calls that went badly',
      requested_at: '2026-11-17T16:00:58.000Z',
    });
    expect(issue.rule).toBe('duplicate_open_request');
    expect(issue.detail).toContain('call_scan: flag calls that went badly');
    expect(issue.detail).toContain('2026-11-17');
    expect(issue.detail).toContain('add to that one');
  });

  it('keeps the RULE CODE stable, because the form maps refusals by rule', () => {
    // `toolRequestFormFields.ts` maps `duplicate_open_request` to `__form`. Changing the code
    // would drop the refusal into the unmapped bucket, which still renders but no longer renders
    // where it was designed to.
    expect(duplicateOpenRequest({ title: 'x', requested_at: null }).rule)
      .toBe(DUPLICATE_OPEN_REQUEST.rule);
  });

  it('falls back to the plain sentence when the collision cannot be described', () => {
    // A row we can see but whose title is null should still refuse, with the sentence that was
    // always there. A refusal that depended on being able to name the collision would be a
    // refusal that silently stopped firing.
    expect(duplicateOpenRequest({ title: null, requested_at: null }))
      .toEqual(DUPLICATE_OPEN_REQUEST);
    expect(duplicateOpenRequest({ title: '   ', requested_at: '2026-11-17' }))
      .toEqual(DUPLICATE_OPEN_REQUEST);
  });

  it('omits the date rather than printing a broken one', () => {
    const issue = duplicateOpenRequest({ title: 'call_scan', requested_at: null });
    expect(issue.detail).toContain('call_scan');
    expect(issue.detail).not.toContain('filed ');
  });
});
