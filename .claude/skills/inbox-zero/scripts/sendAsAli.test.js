// C122: sendAsAli must never send a body written in HTML. Run: node --test .claude/skills/inbox-zero/scripts/sendAsAli.test.js
// The first case is the body of the email Jackie received on 11 Nov 2026 at 6:51 AM CST (from Ali's screenshot), which
// arrived showing literal <p> tags and a garbled link.
const test = require('node:test');
const assert = require('node:assert');
const { bodyGuards, renderBody, renderedGuards } = require('./sendAsAli');

const META = { to: 'jackie@colaberry.com', subject: 'Nov 19 Open House: joining link for the Eventbrite listing' };

const JACKIE_BODY = [
  '<p>Hi Jackie,</p>',
  '<p>Quick ask on the Nov 19 Open House listing on Eventbrite, which I know you control.</p>',
  '<p>Could you add this Zoom link to the Eventbrite online event page?</p>',
  '<p><a href="https://colaberry.zoom.us/j/85643177995?pwd=Q5gnrnjDF6NWLsOoQVWCt0DcM3ihx0.1" style="color:#3a8fb5;text-decoration:none;">https://colaberry.zoom.us/j/85643177995?pwd=Q5gnrnjDF6NWLsOoQVWCt0DcM3ihx0.1</a></p>',
  '<p>Thanks for sorting this out.</p>',
].join('\n');

const PLAIN_BODY = [
  'Hi Jackie,',
  '',
  'Quick ask on the Nov 19 Open House listing on Eventbrite, which I know you control.',
  '',
  'Could you add this Zoom link to the Eventbrite online event page?',
  'https://colaberry.zoom.us/j/85643177995?pwd=Q5gnrnjDF6NWLsOoQVWCt0DcM3ihx0.1',
  '',
  'It is the room our own registrants are being sent to, so adding it puts all 15 people in one place on the night. R&D and Q&A are fine, and so is x < 5.',
].join('\n');

test('refuses the exact HTML body Jackie received', () => {
  const fails = bodyGuards(JACKIE_BODY, META);
  assert.ok(fails.some((f) => /body contains HTML \(<p>/.test(f)), fails.join(' | '));
  assert.ok(fails.some((f) => /PLAIN TEXT/.test(f)));
});

test('passes the same email written as plain text, and renders a clean link', () => {
  assert.deepStrictEqual(bodyGuards(PLAIN_BODY, META), []);
  const html = renderBody(PLAIN_BODY);
  assert.deepStrictEqual(renderedGuards(html), []);
  assert.strictEqual((html.match(/<a\s/g) || []).length, 1);
  assert.match(html, /<a href="https:\/\/colaberry\.zoom\.us\/j\/85643177995\?pwd=Q5gnrnjDF6NWLsOoQVWCt0DcM3ihx0\.1"/);
  assert.doesNotMatch(html, /&lt;p/);
});

for (const bad of ['<br>', '<div>x</div>', '</p>', '<a href="https://x.example">x</a>', '<strong>hi</strong>', '<P>caps</P>', '< p >spaced</p>', '<table><tr><td>1</td></tr></table>']) {
  test(`refuses HTML tag: ${bad}`, () => {
    assert.ok(bodyGuards(`Hi Jackie,\n\nSee ${bad} here.`, META).some((f) => /body contains HTML/.test(f)));
  });
}

for (const ent of ['&nbsp;', '&amp;', '&lt;', '&#8217;', '&#x2019;', '&rsquo;']) {
  test(`refuses HTML entity: ${ent}`, () => {
    assert.ok(bodyGuards(`Hi Jackie,\n\nIt${ent}s here.`, META).some((f) => /HTML entity/.test(f)));
  });
}

test('does not refuse ordinary text that only looks a little like markup', () => {
  const ok = 'Hi Jackie,\n\nCost < $5 and > $2. Write to <jackie@colaberry.com> if needed. AT&T and R&D are fine.';
  assert.deepStrictEqual(bodyGuards(ok, META), []);
});

test('the second lock catches escaped tags and broken links in finished HTML', () => {
  assert.ok(renderedGuards('<p>&lt;p&gt;Hi&lt;/p&gt;</p>').some((f) => /raw HTML tags/.test(f)));
  assert.ok(renderedGuards('<p>it&amp;nbsp;s</p>').some((f) => /raw HTML entity/.test(f)));
  assert.ok(renderedGuards('<p><a href="https://x.example">x</p>').some((f) => /links opened but/.test(f)));
  assert.ok(renderedGuards('<p><a href="https://x.example/&lt;a">x</a></p>').some((f) => /malformed/.test(f)));
});

test('keeps the existing guards', () => {
  assert.ok(bodyGuards('Hi\n\nA dash — here', META).some((f) => /dash/.test(f)));
  assert.ok(bodyGuards('Hi\n\nOk.\n\nThanks,\nAli', META).some((f) => /sign-off/.test(f)));
  assert.ok(bodyGuards('Hi', {}).some((f) => /required/.test(f)));
});
