/**
 * pricingWorkbook — a real exceljs round-trip proves the sealed pricing passthrough PRESERVES formulas (never
 * flattens a live cost model to static values). No mock — exceljs runs in-memory.
 */
import ExcelJS from 'exceljs';
import { countFormulaCells, roundTripPreservesFormulas, workbookToBuffer } from '../pricingWorkbook';

async function pricingBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pricing');
  ws.getCell('A1').value = 100;        // unit price
  ws.getCell('B1').value = 12;         // quantity
  ws.getCell('C1').value = { formula: 'A1*B1', result: 1200 }; // extended price — a LIVE formula
  ws.getCell('C2').value = { formula: 'SUM(C1:C1)', result: 1200 };
  return workbookToBuffer(wb);
}

describe('pricingWorkbook', () => {
  it('counts the formula cells in a pricing workbook', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await pricingBuffer() as any);
    expect(countFormulaCells(wb)).toBe(2);
  });

  it('round-trips the workbook WITHOUT flattening its formulas', async () => {
    const r = await roundTripPreservesFormulas(await pricingBuffer());
    expect(r.ok).toBe(true);
    expect(r.formulaCells).toBe(2);
  });
});
