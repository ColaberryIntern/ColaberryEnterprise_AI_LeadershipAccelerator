/**
 * pricingWorkbook — the sealed pricing file passthrough (Proposal Studio P6). The agency pricing workbook stays in
 * its OWN sealed file, never merged into the proposal PDFs and admin-only at the API. exceljs is used to validate
 * the uploaded workbook and confirm its FORMULAS survive a round-trip (HHSC wants live formulas), so a passthrough
 * never silently flattens a cost model to static values.
 *
 * Pure-ish (exceljs in-memory; no disk/network here). The route stores the admin's bytes; this verifies them.
 */
import ExcelJS from 'exceljs';

export async function readWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb;
}

export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Count cells that carry a formula (a live cost model), across all sheets. */
export function countFormulaCells(wb: ExcelJS.Workbook): number {
  let n = 0;
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v: any = cell.value;
        if (cell.type === ExcelJS.ValueType.Formula || (v && typeof v === 'object' && 'formula' in v)) n += 1;
      });
    });
  });
  return n;
}

/**
 * True when loading the pricing bytes, re-writing them, and loading again preserves the formula-cell count — i.e.
 * the passthrough did not flatten formulas to static values. Returns { ok, formulaCells }.
 */
export async function roundTripPreservesFormulas(buffer: Buffer): Promise<{ ok: boolean; formulaCells: number }> {
  const first = await readWorkbook(buffer);
  const before = countFormulaCells(first);
  const rewritten = await workbookToBuffer(first);
  const second = await readWorkbook(rewritten);
  const after = countFormulaCells(second);
  return { ok: before === after, formulaCells: after };
}
