/**
 * The AI drafts a whole proposal document as HTML, which is UNTRUSTED and will be rendered in the cockpit, so
 * sanitizeProposalHtml is the XSS rail: it reduces the HTML to an allowlist of structural tags with NO attributes,
 * dropping <script>/<style>/<iframe> and their contents entirely. generateProposalDocumentDraftAI FAILS SOFT.
 */
import { sanitizeProposalHtml, generateProposalDocumentDraftAI } from '../govProposalDocumentDraftAI';

describe('sanitizeProposalHtml — the XSS rail', () => {
  it('removes <script>/<style>/<iframe> and their contents entirely', () => {
    const out = sanitizeProposalHtml('<p>Hello</p><script>alert(1)</script><style>p{x}</style><iframe src=evil></iframe>');
    expect(out).toBe('<p>Hello</p>');
    expect(out).not.toMatch(/alert|script|iframe|style/i);
  });

  it('strips ALL attributes (no event handlers, no javascript: urls survive)', () => {
    expect(sanitizeProposalHtml('<p onclick="steal()" style="x">hi</p>')).toBe('<p>hi</p>');
    expect(sanitizeProposalHtml('<p class="a" data-x="y">t</p>')).toBe('<p>t</p>');
  });

  it('drops disallowed tags but keeps their inner text; keeps the allowlist', () => {
    expect(sanitizeProposalHtml('<div><a href="javascript:evil()">link</a> text</div>')).toBe('link text');
    const kept = sanitizeProposalHtml('<h2>T</h2><p>a <strong>b</strong></p><ul><li>x</li></ul>');
    expect(kept).toBe('<h2>T</h2><p>a <strong>b</strong></p><ul><li>x</li></ul>');
  });

  it('is total on empty / nullish input', () => {
    expect(sanitizeProposalHtml(null)).toBe('');
    expect(sanitizeProposalHtml(undefined)).toBe('');
    expect(sanitizeProposalHtml('   ')).toBe('');
    expect(sanitizeProposalHtml('<script>x</script>')).toBe(''); // only disallowed content ⇒ empty
  });
});

describe('generateProposalDocumentDraftAI — fail soft', () => {
  const OLD = process.env.OPENAI_API_KEY;
  afterEach(() => { if (OLD === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = OLD; });

  it('with no API key returns an error, never throws', async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await generateProposalDocumentDraftAI({ docKey: 'technical', title: 'Technical Proposal', requirements: [{ canonicalReqId: 'R1', statement: 'Describe the approach.' }] });
    expect(r.html).toBe('');
    expect(r.error).toMatch(/unavailable|no API key/i);
  });

  it('with no requirements returns an error (nothing to draft)', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const r = await generateProposalDocumentDraftAI({ docKey: 'technical', title: 'Technical Proposal', requirements: [] });
    expect(r.error).toMatch(/no requirements/i);
  });
});
