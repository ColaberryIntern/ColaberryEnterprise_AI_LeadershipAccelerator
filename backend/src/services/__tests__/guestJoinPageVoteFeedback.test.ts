import { renderGuestJoinPage } from '../guestJoinPage';

/**
 * D5 - a guest whose vote did not count has to be told.
 *
 * ## The defect
 *
 * The vote was `.then(refresh).catch(function(){})`, which is two silent failures in one line,
 * and CLAUDE.md names the empty catch a production defect rather than a style question.
 *
 *   - `fetch` only rejects on a NETWORK error, so a 401, a 409 and a 400 all landed in the
 *     success path. The panel refreshed, the guest's choice was simply not highlighted, and
 *     nothing said why.
 *   - the empty catch swallowed the network case entirely.
 *
 * Either way a guest at an Open House taps, sees nothing change, and taps again.
 *
 * The 401 is the case worth separating. The pass lasts 12 hours and this page is designed to be
 * left open, so an expired pass is ordinary rather than exceptional - and the state poll already
 * cleared the pass and reloaded into the join form when it saw one. The vote path did not, so an
 * expired guest could tap forever at a page that looked fine.
 *
 * ## What this test can and cannot do
 *
 * It asserts the SERVED page: the branches are present, the element they write into exists, and
 * the empty catch is gone. It does not execute the script, so it is a guard against the
 * behaviour being deleted rather than evidence of what a guest sees in a browser. Said plainly.
 */

const page = () => renderGuestJoinPage('7aa7ce89-187d-4604-9b86-a3b2a69579ce', 'Open House');

/**
 * The vote handler, sliced out so an assertion cannot be satisfied by the state poll instead.
 *
 * COMMENTS ARE STRIPPED, and that is not tidiness. The handler's own comment quotes the old
 * broken line in order to explain it, so a search for the forbidden pattern found the PROSE
 * describing it and reported code that no longer exists. Exactly the trap the American-spelling
 * guard hit when a comment explaining a misspelling was itself scanned as one. A test about code
 * has to look at code.
 */
function voteHandler(html: string): string {
  const from = html.indexOf("fetch(BASE + '/guest-vote'");
  expect(from).toBeGreaterThan(-1);
  return html
    .slice(from, html.indexOf('function tick()', from))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

describe('a vote that did not count says so', () => {
  it('has somewhere to say it', () => {
    const html = page();
    expect(html).toContain('id="verr"');
  });

  it('keeps that message OUTSIDE the question panel, so a refresh does not wipe it', () => {
    // The panel is re-rendered on every poll. A message written into it would vanish within
    // two seconds, which is less use than no message.
    const html = page();
    const panel = html.indexOf('id="panel"');
    const verr = html.indexOf('id="verr"');
    expect(verr).toBeGreaterThan(panel);
    expect(html.slice(panel, verr)).toContain('</div>');
  });

  it('checks the response instead of treating every answer as success', () => {
    const vote = voteHandler(page());
    expect(vote).toContain('r.ok');
  });

  it('handles an expired pass the way the state poll already did', () => {
    const vote = voteHandler(page());
    expect(vote).toContain('r.status === 401');
    expect(vote).toContain('localStorage.removeItem(KEY)');
    expect(vote).toContain('location.reload()');
  });

  it('says voting has closed on a 409 rather than asking them to try again', () => {
    // A locked question is not a retryable failure, and "tap again" on one is a lie that keeps
    // somebody tapping.
    const vote = voteHandler(page());
    expect(vote).toContain('409');
    expect(vote).toMatch(/voting has closed/i);
  });

  it('reports a network failure rather than swallowing it', () => {
    const vote = voteHandler(page());
    expect(vote).toMatch(/no connection/i);
  });

  it('has no empty PROMISE catch left in it', () => {
    // The specific pattern CLAUDE.md forbids, matched as `.catch(function(){})` rather than as
    // any empty catch at all.
    //
    // The difference matters and the first version of this test got it wrong: the 401 branch
    // contains `try { localStorage.removeItem(KEY) } catch (e) {}`, which is a correct empty
    // catch. A browser with site data blocked is an expected condition there, and there is
    // nothing to report to anyone - the reload happens either way. Matching every empty catch
    // failed on that and would have pushed me to "fix" working code.
    const vote = voteHandler(page());
    expect(vote).not.toMatch(/\.catch\(\s*function\s*\([^)]*\)\s*\{\s*\}\s*\)/);
  });

  it('clears a stale message when the question actually moves on', () => {
    const html = page();
    expect(html).toContain("voteErr.textContent = ''");
  });
});

describe('the rest of the page still stands', () => {
  it('asks for a name and an email, which is the decision on record', () => {
    // D5's draft said "one tap and no typing". That contradicts Ali's 2026-10-29 decision -
    // name and email, no login link - and the capture is the point of an Open House. Asserted
    // so a later reading of the draft ticket cannot quietly remove it.
    const html = page();
    expect(html).toContain('name="name"');
    expect(html).toContain('name="email"');
  });

  it('escapes the session title rather than interpolating it raw', () => {
    const html = renderGuestJoinPage('s1', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
