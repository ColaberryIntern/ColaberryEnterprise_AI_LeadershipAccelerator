/**
 * The comment rewriter edits prose inside HTML that is already live on a Basecamp ticket.
 *
 * The dangerous part is not the network call, which is guarded by a read-back and a
 * rollback. It is the string rewrite: a replacement that strays inside a tag can break an
 * attachment sgid, a filename or a URL, and the read-back would still see a figure and call
 * it a success. So the pure function is tested directly, and the cases below are all the
 * ways a naive find-and-replace would do damage.
 */
const { reviseHtml, hasLiveAttachment } = require('../../../../../scripts/artifacts/reviseCommentSpelling');

const COMMENT = '<div><strong>Asked:</strong> the route and authorisation C8.2 should build. '
  + 'Annualised revenue, a near neighbour, and nothing to honour.</div>'
  + '<div><bc-attachment sgid="BAh7CEkiCG9uZQ==" caption="C8.1: the colour of it">'
  + '</bc-attachment></div>'
  + '<figure><img previewable="true" src="https://x/ColaberryEnterprise_AI.pdf">'
  + '<figcaption>Judgement calls in grey</figcaption></figure>';

describe('reviseHtml', () => {
  const { html, changed } = reviseHtml(COMMENT);

  it('finds every British spelling in the text', () => {
    expect(changed.sort()).toEqual([
      'Annualised -> annualized',
      'Judgement -> judgment',
      'authorisation -> authorization',
      'grey -> gray',
      'honour -> honor',
      'neighbour -> neighbor',
    ]);
  });

  it('rewrites prose and keeps the casing', () => {
    expect(html).toContain('the route and authorization C8.2');
    expect(html).toContain('Annualized revenue');
    expect(html).toContain('a near neighbor');
    expect(html).toContain('nothing to honor');
  });

  it('rewrites text inside a figcaption, which is prose a reader sees', () => {
    expect(html).toContain('<figcaption>Judgment calls in gray</figcaption>');
  });

  it('never touches an attachment sgid', () => {
    expect(html).toContain('sgid="BAh7CEkiCG9uZQ=="');
  });

  it('never touches a URL, even one containing a word it would otherwise rewrite', () => {
    expect(html).toContain('src="https://x/ColaberryEnterprise_AI.pdf"');
  });

  it('leaves attribute values alone, because they are inside a tag', () => {
    // A caption attribute is prose, but rewriting inside a tag is how sgids get corrupted.
    // Being conservative here means a caption can keep a British spelling; that is the
    // trade, and it is the safe side of it.
    expect(html).toContain('caption="C8.1: the colour of it"');
  });

  it('reports nothing to do for text that is already American', () => {
    const { changed: none } = reviseHtml('<div>The authorization is in color.</div>');
    expect(none).toEqual([]);
  });

  it('leaves the rest of the markup byte-identical', () => {
    // Only the words should move. Anything else is the rewrite overreaching.
    const stripWords = (s) => s.replace(/authoris|authoriz|Annualis|Annualiz|neighbour|neighbor|honour|honor|Judgement|Judgment|grey|gray/g, 'X');
    expect(stripWords(html)).toBe(stripWords(COMMENT));
  });
});

describe('hasLiveAttachment', () => {
  it('recognises a resolved attachment', () => {
    expect(hasLiveAttachment(COMMENT)).toBe(true);
  });

  it('rejects an unresolved bc-attachment, which renders as a broken glyph', () => {
    expect(hasLiveAttachment('<div><bc-attachment sgid="x"></bc-attachment></div>')).toBe(false);
  });

  it('rejects a figure with no previewable image', () => {
    expect(hasLiveAttachment('<figure><img src="x"></figure>')).toBe(false);
  });
});
