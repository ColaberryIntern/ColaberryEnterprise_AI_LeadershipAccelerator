import ExcelJS from 'exceljs';
import { buildComplianceRows, renderComplianceMatrixXlsx, COMPLIANCE_COLUMNS } from '../buildComplianceMatrix';

const reqs = [
  { reqId: 'R-1', requirement: 'Provide a transition plan', source: 'rfp.pdf p.12' },
  { reqId: 'R-2', requirement: 'Hold a valid HUB certification', source: 'rfp.pdf p.4' },
  { reqId: 'R-1', requirement: 'dupe ignored', source: 'x' },
];

describe('buildComplianceRows', () => {
  it('maps each requirement to a row with coverage + status, deduped and in order', () => {
    const rows = buildComplianceRows(reqs, { 'R-1': { document: 'Technical Proposal', section: 'Transition' } });
    expect(rows.map((r) => r.reqId)).toEqual(['R-1', 'R-2']);
    expect(rows[0]).toMatchObject({ status: 'Covered', whereAnswered: 'Technical Proposal > Transition', source: 'rfp.pdf p.12' });
    expect(rows[1]).toMatchObject({ status: 'Open', whereAnswered: '' });
  });

  it('shows the document alone when there is no section', () => {
    const rows = buildComplianceRows([{ reqId: 'R-9', requirement: 'x' }], { 'R-9': { document: 'Cover Letter' } });
    expect(rows[0].whereAnswered).toBe('Cover Letter');
  });

  it('is total on empty / junk', () => {
    expect(buildComplianceRows([], {})).toEqual([]);
    expect(buildComplianceRows([{ reqId: '', requirement: 'x' }])).toEqual([]);
  });
});

describe('renderComplianceMatrixXlsx', () => {
  it('renders a real workbook whose rows round-trip back to the requirements', async () => {
    const rows = buildComplianceRows(reqs, { 'R-2': { document: 'HUB Plan' } });
    const buf = await renderComplianceMatrixXlsx(rows);
    expect(Buffer.isBuffer(buf)).toBe(true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any); // exceljs bundles its own `Buffer` type; cross the boundary like pricingWorkbook does
    const ws = wb.getWorksheet('Compliance Matrix')!;
    expect(ws).toBeTruthy();
    const header = ws.getRow(1).values as any[];
    expect(header.slice(1)).toEqual([...COMPLIANCE_COLUMNS]);
    // header + 2 data rows
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(2).getCell(1).value).toBe('R-1'); // column 1 = Req ID
    expect(ws.getRow(3).getCell(5).value).toBe('Covered'); // column 5 = Status; R-2 is covered by HUB Plan
  });
});
