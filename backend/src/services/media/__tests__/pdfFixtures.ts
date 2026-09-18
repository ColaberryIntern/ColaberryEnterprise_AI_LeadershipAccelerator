/**
 * Hand-built PDFs for tests: every byte explained, no binary fixture. Not a test file itself,
 * so importing it does not re-register another suite's cases (the way fakeModels.ts is done).
 * Both builders produce files a strict reader (pypdf strict mode, MuPDF) opens and counts.
 */

const PAGE = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>';

/** A minimal, valid PDF with N blank pages: catalog -> pages tree -> page objects, plus xref. */
export function minimalPdf(pages: number, opts: { parentOnRoot?: boolean; version?: string } = {}): Buffer {
  const objs: string[] = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(' ');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages}${opts.parentOnRoot ? ' /Parent 9 0 R' : ''} >>`);
  for (let i = 0; i < pages; i += 1) objs.push(PAGE);
  let body = `%PDF-${opts.version ?? '1.4'}\n`;
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(body, 'latin1')); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xrefAt = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/**
 * The same file after an INCREMENTAL save that changed the page count: the original bytes are
 * untouched and a new generation of the root Pages object (plus any new page objects, so every
 * /Kids reference resolves) is appended with its own xref and a trailer pointing back with
 * /Prev. This is what "Save" (not "Save As") produces in most editors, and a reader must take
 * the newest generation.
 */
export function incrementallySavedPdf(originalPages: number, newPages: number): Buffer {
  const base = minimalPdf(originalPages);
  const kids = Array.from({ length: newPages }, (_, i) => `${3 + i} 0 R`).join(' ');
  const added: Array<{ num: number; body: string }> = [{ num: 2, body: `<< /Type /Pages /Kids [${kids}] /Count ${newPages} >>` }];
  for (let i = originalPages; i < newPages; i += 1) added.push({ num: 3 + i, body: PAGE });

  let update = '';
  const offsets: Array<{ num: number; at: number }> = [];
  for (const obj of added) {
    offsets.push({ num: obj.num, at: base.length + Buffer.byteLength(update, 'latin1') });
    update += `${obj.num} 0 obj\n${obj.body}\nendobj\n`;
  }
  const xrefAt = base.length + Buffer.byteLength(update, 'latin1');
  const prev = Number(/startxref\n(\d+)/.exec(base.toString('latin1'))![1]);
  const size = 3 + Math.max(originalPages, newPages);
  let tail = 'xref\n';
  for (const o of offsets) tail += `${o.num} 1\n${String(o.at).padStart(10, '0')} 00000 n \n`;
  tail += `trailer\n<< /Size ${size} /Root 1 0 R /Prev ${prev} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.concat([base, Buffer.from(update + tail, 'latin1')]);
}
