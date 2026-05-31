// Extract text from RFP files for AI task generation.
//
// Goal: turn a directory of PDF/DOCX/XLSX/TXT files into a list of
// { filename, text, truncated } so the AI can read the RFP and propose a
// custom task list.
//
// Handlers:
//   - .pdf  -> pdf-parse
//   - .docx -> AdmZip + grep word/document.xml
//   - .xlsx -> AdmZip + grep xl/sharedStrings.xml + xl/worksheets/sheet*.xml
//   - .txt  -> fs.readFileSync
//   - others (.zip nested, .png, etc) -> skipped with a stub
//
// Each file's text is hard-capped at CHARS_PER_FILE to keep the gpt-4o
// context under control. Total across all files is also capped.

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const CHARS_PER_FILE = 8000;
const CHARS_TOTAL = 80000;

function stripXmlTags(s) {
  return (s || '')
    .replace(/<w:p[^>]*>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdf(filePath) {
  try {
    // pdf-parse v2.x: class-based API. Older `require('pdf-parse')(buf)` form
    // no longer works in v2.0+.
    const { PDFParse } = require('pdf-parse');
    const buf = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    return result?.text || '';
  } catch (e) {
    return `[pdf-parse failed: ${e.message}]`;
  }
}

function extractDocx(filePath) {
  try {
    const zip = new AdmZip(filePath);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return '[no word/document.xml in docx]';
    return stripXmlTags(entry.getData().toString('utf8'));
  } catch (e) {
    return `[docx extract failed: ${e.message}]`;
  }
}

function extractXlsx(filePath) {
  try {
    const zip = new AdmZip(filePath);
    // sharedStrings holds most text content; sheets reference by index
    const stringsEntry = zip.getEntry('xl/sharedStrings.xml');
    const strings = stringsEntry ? stripXmlTags(stringsEntry.getData().toString('utf8')) : '';
    // Also grab the first 3 sheets in case inline strings or numbers are there
    const entries = zip.getEntries()
      .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.entryName))
      .slice(0, 3);
    const sheets = entries.map((e) => stripXmlTags(e.getData().toString('utf8'))).join('\n---\n');
    return `[shared strings]\n${strings}\n\n[sheet content]\n${sheets}`;
  } catch (e) {
    return `[xlsx extract failed: ${e.message}]`;
  }
}

function extractTxt(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch (e) { return `[txt read failed: ${e.message}]`; }
}

async function extractTextFromFiles(filesDir, { charsPerFile = CHARS_PER_FILE, charsTotal = CHARS_TOTAL } = {}) {
  const files = fs.readdirSync(filesDir).filter((f) => fs.statSync(path.join(filesDir, f)).isFile()).sort();
  const out = [];
  let totalChars = 0;
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const fp = path.join(filesDir, f);
    let raw = '';
    if (ext === '.pdf') raw = await extractPdf(fp);
    else if (ext === '.docx') raw = extractDocx(fp);
    else if (ext === '.xlsx') raw = extractXlsx(fp);
    else if (ext === '.txt') raw = extractTxt(fp);
    else { out.push({ filename: f, text: `[skipped: unsupported ${ext}]`, truncated: false, bytes: fs.statSync(fp).size }); continue; }

    const truncated = raw.length > charsPerFile;
    let text = raw.slice(0, charsPerFile);
    if (totalChars + text.length > charsTotal) {
      const remaining = Math.max(0, charsTotal - totalChars);
      text = text.slice(0, remaining);
      out.push({ filename: f, text, truncated: true, bytes: fs.statSync(fp).size, totalCapReached: true });
      break;
    }
    totalChars += text.length;
    out.push({ filename: f, text, truncated, bytes: fs.statSync(fp).size });
  }
  return out;
}

module.exports = { extractTextFromFiles, extractPdf, extractDocx, extractXlsx, extractTxt };
