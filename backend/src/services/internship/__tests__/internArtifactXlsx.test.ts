import ExcelJS from 'exceljs';
import { csvRowsToXlsx, safeCell, sheetName } from '../internArtifactXlsx';

describe('internArtifactXlsx: a CSV artifact opened in Excel', () => {
  it('builds a workbook with the same cells, a bold frozen filterable header and wrapped text', async () => {
    const rows = [['Deliverable', 'Verdict'], ['MCP server', 'Solid'], ['Workflow assistant', 'Missing']];
    const buf = await csvRowsToXlsx(rows, 'coreops_program_inventory.csv');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe('coreops_program_inventory');
    expect(ws.getRow(1).values).toEqual([undefined, 'Deliverable', 'Verdict']);
    expect(ws.getRow(3).getCell(2).value).toBe('Missing');
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.views[0]).toEqual(expect.objectContaining({ state: 'frozen', ySplit: 1 }));
    expect(ws.getColumn(1).alignment?.wrapText).toBe(true);
  });

  it('a cell that would run as a formula stays text (CSV injection)', () => {
    expect(safeCell('=HYPERLINK("http://x")')).toBe('\'=HYPERLINK("http://x")');
    expect(safeCell('+1')).toBe("'+1");
    expect(safeCell('Solid')).toBe('Solid');
  });

  it('sheet names obey Excel rules', () => {
    expect(sheetName('a/b:c?.csv')).toBe('a b c');
    expect(sheetName('x'.repeat(50) + '.csv')).toHaveLength(31);
    expect(sheetName('.csv')).toBe('Artifact');
  });

  it('an empty CSV still gives a valid workbook', async () => {
    const buf = await csvRowsToXlsx([], 'empty.csv');
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });
});
