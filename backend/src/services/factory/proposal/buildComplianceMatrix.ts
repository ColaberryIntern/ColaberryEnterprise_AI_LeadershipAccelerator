import ExcelJS from 'exceljs';

/**
 * buildComplianceMatrix — the deterministic requirements compliance matrix (v3 §V2, T09). A reviewer-facing cross
 * reference: one row per requirement with where in the proposal it is answered and whether it is covered yet. It is
 * built with NO AI from the extracted requirements + the document coverage map, so the same inputs always yield the
 * same workbook. The pure `buildComplianceRows` is table-tested; `renderComplianceMatrixXlsx` renders those rows to
 * a real .xlsx (exceljs, already a dependency) that the package/download path serves.
 */

export interface ComplianceReqInput {
  reqId: string;
  requirement: string;
  /** The source file (and optionally a short quote) the requirement was read from. */
  source?: string;
}

/** reqId -> where it is answered in the proposal (which document, which section). Absent ⇒ still open. */
export type ComplianceCoverage = Record<string, { document: string; section?: string } | undefined>;

export interface ComplianceRow {
  reqId: string;
  requirement: string;
  source: string;
  whereAnswered: string;
  status: 'Covered' | 'Open';
}

export const COMPLIANCE_COLUMNS = ['Req ID', 'Requirement', 'Source', 'Where Answered', 'Status'] as const;

/** PURE: one row per requirement (deduped by reqId, input order preserved), with coverage + status folded in. */
export function buildComplianceRows(reqs: ComplianceReqInput[], coverage: ComplianceCoverage = {}): ComplianceRow[] {
  const seen = new Set<string>();
  const rows: ComplianceRow[] = [];
  for (const r of reqs || []) {
    const reqId = String(r?.reqId ?? '').trim();
    if (!reqId || seen.has(reqId)) continue;
    seen.add(reqId);
    const where = coverage[reqId];
    rows.push({
      reqId,
      requirement: String(r?.requirement ?? '').trim(),
      source: String(r?.source ?? '').trim(),
      whereAnswered: where ? (where.section ? `${where.document} > ${where.section}` : where.document) : '',
      status: where ? 'Covered' : 'Open',
    });
  }
  return rows;
}

/** Render the rows to a real .xlsx workbook buffer. Deterministic layout; no AI. */
export async function renderComplianceMatrixXlsx(rows: ComplianceRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Colaberry Proposal Studio';
  const ws = wb.addWorksheet('Compliance Matrix');
  ws.columns = [
    { header: COMPLIANCE_COLUMNS[0], key: 'reqId', width: 14 },
    { header: COMPLIANCE_COLUMNS[1], key: 'requirement', width: 60 },
    { header: COMPLIANCE_COLUMNS[2], key: 'source', width: 28 },
    { header: COMPLIANCE_COLUMNS[3], key: 'whereAnswered', width: 34 },
    { header: COMPLIANCE_COLUMNS[4], key: 'status', width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };
  for (const r of rows) {
    ws.addRow({ reqId: r.reqId, requirement: r.requirement, source: r.source, whereAnswered: r.whereAnswered, status: r.status });
  }
  ws.getColumn('requirement').alignment = { wrapText: true, vertical: 'top' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
