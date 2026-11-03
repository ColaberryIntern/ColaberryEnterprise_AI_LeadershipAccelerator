const mockBcGetAll = jest.fn();
jest.mock('../../services/ops/basecampClient', () => ({
  bcGet: jest.fn(),
  bcGetAll: (...a: unknown[]) => mockBcGetAll(...a),
}));

import {
  scanAttachments,
  pdfCount,
  renderAudit,
  listBoth,
  type TicketAudit,
} from '../auditTicketArtifacts';

beforeEach(() => { mockBcGetAll.mockReset(); });

describe('listBoth — a sweep that cannot see a closed ticket reports it as open', () => {
  function respond(map: Record<string, unknown[]>) {
    mockBcGetAll.mockImplementation(async (url: string) => {
      const hit = Object.keys(map).find((k) => url.includes(k));
      return hit ? map[hit] : [];
    });
  }

  it('makes TWO requests, one of them for the completed collection', async () => {
    respond({ '/todos.json': [] });
    await listBoth(7463955, 11);
    const urls = mockBcGetAll.mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.includes('completed=true'))).toBe(true);
    // `?status=` is the parameter that caused the blind spot; it must not return.
    expect(urls.some((u) => u.includes('status='))).toBe(false);
  });

  it('returns open AND completed ids', async () => {
    respond({
      '/todos.json?completed=true': [{ id: 99 }],
      '/todos.json': [{ id: 1 }, { id: 2 }],
    });
    expect((await listBoth(7463955, 11)).sort((a, b) => a - b)).toEqual([1, 2, 99]);
  });

  it('NEGATIVE CONTROL: with an empty completed collection only the open ids come back', async () => {
    respond({ '/todos.json?completed=true': [], '/todos.json': [{ id: 1 }] });
    expect(await listBoth(7463955, 11)).toEqual([1]);
  });
});

/** The markup shape that `htmlToText` destroys: the filename is an ATTRIBUTE, not text. */
const COMMENT_WITH_TWO_PDFS = `
<div>Artifacts for review.</div>
<bc-attachment sgid="BAh7CEkiCG" content-type="application/pdf" filename="C2_6_VISUAL.pdf" filesize="81234"></bc-attachment>
<bc-attachment sgid="BAh7CEkiCH" content-type="application/pdf" filename="C2_6_DOCUMENT.pdf" filesize="221111"></bc-attachment>
`;

describe('scanAttachments — the thing readBasecampTicket cannot do', () => {
  it('counts bc-attachment elements', () => {
    expect(scanAttachments([COMMENT_WITH_TWO_PDFS]).attachments).toBe(2);
  });

  it('recovers PDF filenames from attributes', () => {
    const scan = scanAttachments([COMMENT_WITH_TWO_PDFS]);
    expect(scan.pdfNames).toEqual(['C2_6_DOCUMENT.pdf', 'C2_6_VISUAL.pdf']);
    expect(pdfCount(scan)).toBe(2);
  });

  it('records content types', () => {
    expect(scanAttachments([COMMENT_WITH_TWO_PDFS]).contentTypes).toEqual(['application/pdf']);
  });

  it('NEGATIVE CONTROL: tag-stripped text yields zero, which is why the raw HTML is required', () => {
    // This is exactly what readBasecampTicket.htmlToText hands you. If this returned 2, the
    // existing reader would have been sufficient and this module would not need to exist.
    const stripped = COMMENT_WITH_TWO_PDFS.replace(/<[^>]*>/g, '');
    const scan = scanAttachments([stripped]);
    expect(scan.attachments).toBe(0);
    expect(pdfCount(scan)).toBe(0);
  });

  it('finds a PDF named only in a caption or href', () => {
    const scan = scanAttachments([
      '<bc-attachment sgid="x" caption="AF2_3_SPEC.pdf"></bc-attachment>',
      '<a href="https://bc.example/files/AF2_3_VISUAL.pdf">visual</a>',
    ]);
    expect(scan.pdfNames).toEqual(['AF2_3_SPEC.pdf', 'AF2_3_VISUAL.pdf']);
  });

  it('falls back to counting application/pdf attachments when no filename is exposed', () => {
    const scan = scanAttachments([
      '<bc-attachment sgid="a" content-type="application/pdf"></bc-attachment>',
      '<bc-attachment sgid="b" content-type="application/pdf"></bc-attachment>',
    ]);
    expect(scan.pdfNames).toEqual([]);
    expect(pdfCount(scan)).toBe(2);
  });

  it('does not count a PNG attachment as a PDF', () => {
    const scan = scanAttachments([
      '<bc-attachment sgid="a" content-type="image/png" filename="chart.png"></bc-attachment>',
    ]);
    expect(scan.attachments).toBe(1);
    expect(pdfCount(scan)).toBe(0);
  });

  it('deduplicates the same PDF referenced twice', () => {
    const scan = scanAttachments([
      '<bc-attachment filename="SAME.pdf"></bc-attachment>',
      '<a href="SAME.pdf">again</a>',
    ]);
    expect(scan.pdfNames).toEqual(['SAME.pdf']);
    expect(pdfCount(scan)).toBe(1);
  });

  it('decodes a percent-encoded filename', () => {
    const scan = scanAttachments(['<a href="C2%206%20VISUAL.pdf">v</a>']);
    expect(scan.pdfNames).toEqual(['C2 6 VISUAL.pdf']);
  });

  it('tolerates undefined and empty entries', () => {
    const scan = scanAttachments([undefined, '', COMMENT_WITH_TWO_PDFS]);
    expect(scan.attachments).toBe(2);
  });

  it('keeps raw tags for diagnosing an unexpected shape', () => {
    const scan = scanAttachments([COMMENT_WITH_TWO_PDFS]);
    expect(scan.rawTags).toHaveLength(2);
    expect(scan.rawTags[0]).toContain('bc-attachment');
  });
});

describe('renderAudit', () => {
  function audit(id: number, pdfs: number, completed = false): TicketAudit {
    const names = Array.from({ length: pdfs }, (_, i) => `T${id}_${i}.pdf`);
    return {
      id,
      title: `ticket ${id}`,
      completed,
      due: '2026-10-21',
      commentCount: 3,
      scan: {
        attachments: pdfs,
        pdfNames: names,
        contentTypes: ['application/pdf'],
        pdfTypedAttachments: pdfs,
        rawTags: [],
      },
      pdfs,
    };
  }

  it('names the tickets carrying 2 or more PDFs', () => {
    const text = renderAudit([audit(1, 0), audit(2, 2), audit(3, 3)], false);
    expect(text).toContain('3 ticket(s) audited; 2 carry 2+ PDFs');
    expect(text).toContain('2+ PDFs: 2, 3');
  });

  it('says plainly that an artifact count is not a completeness judgement', () => {
    expect(renderAudit([audit(1, 2)], false)).toContain('separate judgement');
  });

  it('reports zero eligible without claiming anything else', () => {
    const text = renderAudit([audit(1, 0), audit(2, 1)], false);
    expect(text).toContain('0 carry 2+ PDFs');
    expect(text).not.toContain('2+ PDFs:');
  });

  it('omits raw tags unless asked', () => {
    const withRaw: TicketAudit = {
      ...audit(9, 1),
      scan: {
        attachments: 1,
        pdfNames: ['x.pdf'],
        contentTypes: [],
        pdfTypedAttachments: 0,
        rawTags: ['<bc-attachment a="1">'],
      },
    };
    expect(renderAudit([withRaw], false)).not.toContain('raw:');
    expect(renderAudit([withRaw], true)).toContain('raw:');
  });
});
