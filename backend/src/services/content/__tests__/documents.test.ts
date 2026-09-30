/**
 * LinkedIn document posts (a PDF shown as a swipeable carousel): the validator's rules and the
 * adapter's wire path, without a network. Numbers pinned to providerCapabilities.
 */

import { validateVariant, type MediaFacts, type VariantContext } from '../composerValidation';
import type { Variant } from '../composerVariants';
import { getProviderCapabilities } from '../../publishing/providerCapabilities';
import { LinkedInAdapter, type LinkedInHttp } from '../../publishing/linkedInAdapter';
import type { PublishPayload, PublishMedia } from '../../publishing/socialProviderAdapter';

const NOW = new Date('2026-09-16T04:00:00Z').getTime();
const PDF_FACTS: MediaFacts = { mimeType: 'application/pdf', byteSize: 4 * 1024 * 1024, width: null, height: null, durationMs: null, codecFamily: null, pages: 12 };
const PNG_FACTS: MediaFacts = { mimeType: 'image/png', byteSize: 1000, width: 1200, height: 628, durationMs: null, codecFamily: null };

function v(provider: Variant['provider']): Variant {
  return { provider, text: 'Five AI habits, one slide each.', source: 'generated', canonicalFingerprint: 'x', stale: false };
}
function ctx(media: MediaFacts[], contentType: VariantContext['contentType'] = 'document'): VariantContext {
  return { contentType, mediaCount: media.length, media, links: [] };
}
const mediaProblems = (p: Variant['provider'], c: VariantContext) => validateVariant(v(p), c, NOW).problems.filter((x) => x.field === 'media' || x.field === 'contentType').map((x) => `${x.severity}: ${x.message}`);

describe('the table', () => {
  it('LinkedIn (both) takes documents; no one else does', () => {
    expect(getProviderCapabilities('linkedin_member').document).toEqual({ maxSizeMb: 100, maxPages: 300, formats: ['application/pdf'] });
    expect(getProviderCapabilities('linkedin_organization').document).toEqual(getProviderCapabilities('linkedin_member').document);
    for (const p of ['x', 'meta_facebook_page', 'meta_instagram', 'youtube', 'tiktok'] as const) {
      expect(getProviderCapabilities(p).document).toBeNull();
      expect(getProviderCapabilities(p).contentTypes).not.toContain('document');
    }
  });
});

describe('validation', () => {
  it('one 12-page, 4 MB PDF on a document post passes LinkedIn', () => {
    expect(mediaProblems('linkedin_member', ctx([PDF_FACTS]))).toEqual([]);
    expect(mediaProblems('linkedin_organization', ctx([PDF_FACTS]))).toEqual([]);
  });

  it('a network with no document post blocks at the content-type check AND names the PDF', () => {
    const problems = mediaProblems('x', ctx([PDF_FACTS]));
    expect(problems).toContain('block: X does not accept document posts (supports: text, image, video, thread, link, poll).');
    expect(problems).toContain('block: X does not accept documents (PDF).');
  });

  it('a document post with nothing attached is told it needs a PDF', () => {
    expect(mediaProblems('linkedin_member', ctx([]))).toEqual(['block: LinkedIn (personal profile): a document post needs a PDF attached.']);
  });

  it('a document post with an image instead of a PDF', () => {
    expect(mediaProblems('linkedin_member', ctx([PNG_FACTS]))).toContain('block: LinkedIn (personal profile): a document post needs a PDF, not image/png.');
  });

  it('a PDF on an image post: the content type is the declaration, and it is wrong', () => {
    expect(mediaProblems('linkedin_member', ctx([PDF_FACTS], 'image'))).toContain('block: LinkedIn (personal profile): a PDF needs the document content type; this post is image.');
  });

  it('two PDFs, or a PDF with an image, are refused: one document, alone', () => {
    expect(mediaProblems('linkedin_member', ctx([PDF_FACTS, PDF_FACTS]))).toContain('block: LinkedIn (personal profile): one document per post; this one has 2.');
    expect(mediaProblems('linkedin_member', ctx([PDF_FACTS, PNG_FACTS]))).toContain('block: LinkedIn (personal profile): a document post cannot also carry images or video.');
  });

  it('over 100 MB or over 300 pages blocks; an unknown page count does not', () => {
    expect(mediaProblems('linkedin_member', ctx([{ ...PDF_FACTS, byteSize: 101 * 1024 * 1024 }]))).toContain('block: LinkedIn (personal profile): document is 101.0 MB, limit 100 MB.');
    expect(mediaProblems('linkedin_member', ctx([{ ...PDF_FACTS, pages: 301 }]))).toContain('block: LinkedIn (personal profile): document has 301 pages, limit 300.');
    expect(mediaProblems('linkedin_member', ctx([{ ...PDF_FACTS, pages: null }]))).toEqual([]);
  });
});

const pdf: PublishMedia = { ref: 'media/b/' + 'c'.repeat(64) + '.pdf', mimeType: 'application/pdf', altText: 'Five AI habits for managers', byteSize: 4_000_000 };
const png: PublishMedia = { ref: 'media/b/' + 'a'.repeat(64) + '.png', mimeType: 'image/png', altText: 'Cover', byteSize: 1000 };
const PDF_BYTES = Buffer.from('%PDF-1.4 fake body for transfer', 'latin1');
const DOC_URN = 'urn:li:document:D4D10AQF';
const UPLOAD_URL = 'https://www.linkedin.com/dms-uploads/D4D10AQF/uploadedDocument/0?ca=vector_ads&cn=uploads';

function payload(media: PublishMedia[]): PublishPayload {
  return {
    jobId: 'job-1', provider: 'linkedin_member', contentItemId: 'ci-1', variantId: 'cv-1', accountId: 'acc-1',
    text: 'Five AI habits, one slide each.', mediaRefs: media.map((m) => m.ref), media, poll: null,
    linkUrl: null, disclosureText: null, scheduledFor: '2026-09-16T14:00:00.000Z', contentRevision: 1,
  };
}

describe('LinkedIn wire path for a document', () => {
  const TOKEN = ['AQV', 'd0cT0k3n', 'xyz'].join('');
  type Call = Parameters<LinkedInHttp>[0];

  function scripted() {
    const calls: Call[] = [];
    const http: LinkedInHttp = async (c) => {
      calls.push(c);
      if (c.url === 'https://api.linkedin.com/rest/documents?action=initializeUpload') return { status: 200, headers: {}, body: { value: { uploadUrl: UPLOAD_URL, document: DOC_URN } } };
      if (c.method === 'PUT') return { status: 201, headers: {}, body: '' };
      if (c.url.startsWith('https://api.linkedin.com/rest/documents/')) return { status: 200, headers: {}, body: { status: 'AVAILABLE' } };
      if (c.url === 'https://api.linkedin.com/rest/posts') return { status: 201, headers: { 'x-restli-id': 'urn:li:share:77' }, body: {} };
      throw new Error('unexpected ' + c.method + ' ' + c.url);
    };
    return { http, calls };
  }
  function adapter(http: LinkedInHttp) {
    return new LinkedInAdapter({ provider: 'linkedin_member', getToken: async () => TOKEN, getAuthorUrn: async () => 'urn:li:person:abc', readMedia: async () => PDF_BYTES, http, clock: () => new Date(NOW), sleep: async () => undefined });
  }

  it('initializes against /rest/documents, PUTs the PDF bytes, waits, and posts content.media {id, title}', async () => {
    const { http, calls } = scripted();
    const receipt = await adapter(http).publish(payload([pdf]), 'idem-1');
    expect(calls.map((c) => `${c.method} ${c.url.replace(/\?.*/, '')}`)).toEqual([
      'POST https://api.linkedin.com/rest/documents',
      'PUT https://www.linkedin.com/dms-uploads/D4D10AQF/uploadedDocument/0',
      'GET https://api.linkedin.com/rest/documents/' + encodeURIComponent(DOC_URN),
      'POST https://api.linkedin.com/rest/posts',
    ]);
    expect((calls[1].body as Buffer).equals(PDF_BYTES)).toBe(true);
    const post = calls[3].body as { content: unknown; commentary: string };
    // A title, not alt text: it is shown above the carousel.
    expect(post.content).toEqual({ media: { id: DOC_URN, title: 'Five AI habits for managers' } });
    expect(post.commentary).toBe('Five AI habits, one slide each.');
    expect(receipt.requestMetadata).toMatchObject({ document_urn: DOC_URN, image_urns: [], media_count: 1 });
  });

  it('a 50 MB PDF passes validate and a 101 MB one is refused with the DOCUMENT limit, never the 8 MB image limit', async () => {
    // The first version applied the image cap to the PDF: the composer approved a 50 MB
    // carousel, the worker failed it permanently at 8 MB. Found by the task verifier.
    const a = adapter(scripted().http);
    expect(await a.validate(payload([{ ...pdf, byteSize: 50 * 1024 * 1024 }]))).toEqual({ ok: true });
    const r = await a.validate(payload([{ ...pdf, byteSize: 101 * 1024 * 1024 }]));
    expect((r as { reasons: string[] }).reasons).toEqual([expect.stringMatching(/101\.0 MB; LinkedIn's document limit is 100 MB/)]);
  });

  it('two PDFs on a member post produce the document message only, not also the generic media-count one', () => {
    const problems = mediaProblems('linkedin_member', ctx([PDF_FACTS, PDF_FACTS]));
    expect(problems.filter((p) => /media items, limit/.test(p))).toEqual([]);
    expect(problems).toContain('block: LinkedIn (personal profile): one document per post; this one has 2.');
  });

  it('validate refuses two PDFs, a PDF with an image, and a PDF with no title', async () => {
    const a = adapter(scripted().http);
    expect((await a.validate(payload([pdf, pdf])) as { reasons: string[] }).reasons.join(' ')).toMatch(/one document per post; this post has 2/);
    expect((await a.validate(payload([pdf, png])) as { reasons: string[] }).reasons.join(' ')).toMatch(/cannot also carry images or video/);
    expect((await a.validate(payload([{ ...pdf, altText: '  ' }])) as { reasons: string[] }).reasons.join(' ')).toMatch(/needs a title/);
    expect(await a.validate(payload([pdf]))).toEqual({ ok: true });
  });

  it('a failed document upload is classified with a Document error class and no post is created', async () => {
    const { http, calls } = scripted();
    const failing: LinkedInHttp = async (c) => (c.method === 'PUT' ? { status: 500, headers: {}, body: '' } : http(c));
    await expect(adapter(failing).publish(payload([pdf]), 'idem-1')).rejects.toMatchObject({ permanent: false, providerCode: 'DocumentUploadFailed' });
    expect(calls.some((c) => c.url === 'https://api.linkedin.com/rest/posts')).toBe(false);
  });
});
