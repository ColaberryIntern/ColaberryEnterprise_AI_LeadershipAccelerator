/**
 * internArtifactXlsx - turn an intern's CSV artifact into a formatted Excel workbook.
 *
 * Ali, 10 Nov 2026: "I should be able to have a csv viewer where I can view in excel". A raw .csv
 * opens in Excel too, but as one cramped unformatted block; this gives the same data with a bold,
 * frozen, filterable header row, wrapped text and readable column widths.
 *
 * Pure except for exceljs (already a dependency of the backend image). Input is the CSV rows the
 * viewer already parsed (`csvRows`), so a malformed CSV never reaches here.
 */
import ExcelJS from 'exceljs';

const MAX_COL_WIDTH = 60;
const MIN_COL_WIDTH = 10;

/** Excel sheet names: at most 31 characters, none of : \ / ? * [ ] */
export function sheetName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[:\\/?*[\]]/g, ' ').trim();
  return (base || 'Artifact').slice(0, 31);
}

/** A cell that starts with = + - @ would run as a formula in Excel; prefix it so it stays text. */
export function safeCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export async function csvRowsToXlsx(rows: string[][], fileName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Colaberry Internship Report';
  const ws = wb.addWorksheet(sheetName(fileName), { views: [{ state: 'frozen', ySplit: 1 }] });
  for (const r of rows) ws.addRow(r.map(safeCell));
  const width = Math.max(0, ...rows.map((r) => r.length));
  for (let i = 1; i <= width; i += 1) {
    const longest = Math.max(...rows.map((r) => Math.min((r[i - 1] ?? '').length, MAX_COL_WIDTH)));
    const col = ws.getColumn(i);
    col.width = Math.max(MIN_COL_WIDTH, longest + 2);
    col.alignment = { wrapText: true, vertical: 'top' };
  }
  if (rows.length) {
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A365D' } };
    if (width) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: width } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
