const {
  renderComment, fingerprintOf, lastFingerprints, FINGERPRINT_TAG, INLINE_MAX_CHARS,
} = require('../internArtifactComment');

/**
 * AF10.7 comment and fingerprint. The properties worth the most here:
 *
 *  - THE FINGERPRINT HASHES STATUS AS WELL AS CONTENT. Without that, a document that was posted
 *    and is then deleted produces no change, so nothing posts and the old excerpt stands on the
 *    thread as the current truth. That is the AF2.7 / AF2.9 defect class by name.
 *  - It does not move on its own. A re-read at a different time with the same bytes must produce
 *    the same hash, or the job posts on every run - the mistake `agentTicketDigest.js:39-41`
 *    records.
 *  - One fingerprint per PATH, so six documents cannot mask each other.
 *  - Intern-authored content is escaped. It is untrusted input reaching a rich-HTML body.
 *  - The body is ASCII, because this route has mangled UTF-8 before.
 */

const present = (over: Record<string, unknown> = {}) => ({
  key: 'RESEARCH-1-SYSTEM-CLASSES',
  path: 'docs/discovery/01-system-classes.md',
  status: 'present',
  content: '# System classes\n\nThe body.',
  bytes: 30,
  truncated: false,
  ...over,
});

describe('fingerprintOf', () => {
  it('is stable for identical content', () => {
    expect(fingerprintOf(present())).toBe(fingerprintOf(present()));
  });

  it('changes when the content changes', () => {
    expect(fingerprintOf(present())).not.toBe(fingerprintOf(present({ content: 'different' })));
  });

  it('DOES NOT move on a re-read: byte count and truncation flags are not hashed', () => {
    // Only the content and the status are material. Anything else that varies between runs would
    // make this post forever.
    expect(fingerprintOf(present())).toBe(fingerprintOf(present({ bytes: 999, truncated: true })));
  });

  it('THE DELETION CASE: present and absent hash differently for the same path', () => {
    const wasThere = present();
    const nowGone = { key: wasThere.key, path: wasThere.path, status: 'absent' };
    expect(fingerprintOf(nowGone)).not.toBe(fingerprintOf(wasThere));
  });

  it('distinguishes absent from unreadable, so "gone" and "we cannot see it" are not one event', () => {
    const path = 'docs/discovery/01-system-classes.md';
    const absent = fingerprintOf({ path, status: 'absent' });
    const unreadable = fingerprintOf({ path, status: 'unreadable', reason: 'nope', error_class: 'Unauthorized' });
    expect(absent).not.toBe(unreadable);
  });

  it('is 16 hex characters, matching the sentinel pattern the reader greps for', () => {
    expect(fingerprintOf(present())).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('renderComment', () => {
  it('embeds a sentinel carrying the tag, the path and the fingerprint', () => {
    const { html, fingerprint } = renderComment({ agent: 'Ellis', doc: present() });
    expect(html).toContain(`${FINGERPRINT_TAG}:docs/discovery/01-system-classes.md:${fingerprint}`);
  });

  it('shows a short document inline, in full', () => {
    const { html } = renderComment({ agent: 'Ellis', doc: present() });
    expect(html).toContain('System classes');
    expect(html).toContain('The body.');
    expect(html).not.toContain('Read it in the repository');
  });

  it('excerpts a long document and links to the repository', () => {
    const long = 'x'.repeat(INLINE_MAX_CHARS + 1000);
    const { html } = renderComment({
      agent: 'Ellis',
      doc: present({ content: long, bytes: long.length }),
      repoUrl: 'https://github.com/qninying/platform-reliability-agent',
    });
    expect(html).toContain('Read it in the repository');
    expect(html).toContain('/blob/HEAD/docs/discovery/01-system-classes.md');
    expect(html.length).toBeLessThan(long.length);
  });

  it('ESCAPES intern-authored content rather than interpolating it raw', () => {
    const nasty = '<script>alert(1)</script> & "quoted" <b>bold</b>';
    const { html } = renderComment({ agent: 'Ellis', doc: present({ content: nasty }) });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
  });

  it('escapes the agent name too, since it is now human-supplied (see AF10.6)', () => {
    const { html } = renderComment({ agent: '<img src=x>', doc: present() });
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img');
  });

  it('is ASCII-only, so the ssh route cannot mangle it', () => {
    const { html } = renderComment({
      agent: 'Ellis',
      doc: present({ content: 'Smart “quotes”, an em—dash, an ellipsis… and éèü' }),
    });
    // eslint-disable-next-line no-control-regex
    expect(html).toMatch(/^[\x09\x0A\x20-\x7E]*$/);
    // The two transforms compose: a smart quote becomes an ASCII quote, which is then escaped.
    // Asserting the unescaped form here would be asserting that escaping had NOT happened.
    expect(html).toContain('&quot;quotes&quot;');
    expect(html).toContain('em-dash');
    expect(html).toContain('...');
    // The accented characters have no ASCII equivalent worth guessing, so they are dropped.
    expect(html).not.toContain('é');
  });

  it('says a document is GONE when it has become absent', () => {
    const { html } = renderComment({ agent: 'Ellis', doc: { path: 'docs/discovery/a.md', status: 'absent' } });
    expect(html).toContain('no longer in the repository');
    expect(html).toContain('history, not the current state');
  });

  it('states the reason and the code, and posts nothing from the document, when unreadable', () => {
    const { html } = renderComment({
      agent: 'Ellis',
      doc: {
        path: 'docs/discovery/a.md',
        status: 'unreadable',
        reason: 'The platform cannot reach this repository.',
        error_class: 'Unauthorized',
      },
    });
    expect(html).toContain('could not be read');
    expect(html).toContain('cannot reach this repository');
    expect(html).toContain('Unauthorized');
    expect(html).toContain('Nothing was posted from the document itself');
  });

  it('says so when a document was truncated, rather than cutting it silently', () => {
    const { html } = renderComment({ agent: 'Ellis', doc: present({ truncated: true, content: 'short', bytes: 999999 }) });
    expect(html).toContain('exceeds the size this job will read');
  });
});

describe('lastFingerprints', () => {
  it('finds one fingerprint per path', () => {
    const comments = [
      { content: `a <em>${FINGERPRINT_TAG}:docs/discovery/01.md:1111111111111111</em>` },
      { content: `b <em>${FINGERPRINT_TAG}:docs/migration/legacy.md:2222222222222222</em>` },
    ];
    const seen = lastFingerprints(comments);
    expect(seen.get('docs/discovery/01.md')).toBe('1111111111111111');
    expect(seen.get('docs/migration/legacy.md')).toBe('2222222222222222');
  });

  it('LATER WINS: a second comment for the same path supersedes the first', () => {
    const comments = [
      { content: `${FINGERPRINT_TAG}:docs/discovery/01.md:1111111111111111` },
      { content: `${FINGERPRINT_TAG}:docs/discovery/01.md:3333333333333333` },
    ];
    expect(lastFingerprints(comments).get('docs/discovery/01.md')).toBe('3333333333333333');
  });

  it('ignores comments that are not ours', () => {
    const seen = lastFingerprints([
      { content: 'Kes asked a question here.' },
      { content: 'af103-state:abcdef0123456789' },
    ]);
    expect(seen.size).toBe(0);
  });

  it('survives an empty or missing comment list', () => {
    expect(lastFingerprints([]).size).toBe(0);
    expect(lastFingerprints(undefined).size).toBe(0);
    expect(lastFingerprints([{}]).size).toBe(0);
  });

  it('finds several paths inside a single comment body', () => {
    const seen = lastFingerprints([{
      content: `${FINGERPRINT_TAG}:a.md:1111111111111111 and ${FINGERPRINT_TAG}:b.md:2222222222222222`,
    }]);
    expect(seen.size).toBe(2);
  });
});
