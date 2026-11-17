/**
 * familySpark - the Spark Hour card in the Family Dashboard email: a QR code and a button that open
 * Ali and Addie's private check-in page (frontend/public/spark, API in routes/sparkRoutes.ts).
 *
 * Ali, 2026-11-16: "put it as a QR code on the command center." The card is deliberately vague
 * ("Your 2-minute check-in"): no plans, prizes or answers ever appear in the email, so anyone glancing
 * at the screen learns nothing. The page itself needs the person's 4-digit code.
 *
 * The link carries a private key, so it lives only on this host in SPARK_FILE (written when Spark was
 * set up, never committed). No file, no card. The QR PNG is drawn by the `qrcode` package inside the
 * backend container (it is not installed on the host), the same way the video feed borrows ffmpeg.
 */
const fs = require('fs');
const { execFile } = require('child_process');

const SPARK_FILE = process.env.FAMILY_SPARK_FILE || '/var/lib/family-dashboard/spark.json';
const CONTAINER = process.env.FAMILY_QR_CONTAINER ?? 'accelerator-backend';
const QR_JS = "require('qrcode').toBuffer(process.env.SPARK_URL,{width:360,margin:1,color:{dark:'#1d3557',light:'#ffffff'}}).then(b=>process.stdout.write(b.toString('base64'))).catch(e=>{console.error(e.message);process.exit(1)})";

function readSparkUrl(file = SPARK_FILE) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof j.url === 'string' && /^https:\/\/[^\s]+\?k=[A-Za-z0-9_-]{16,}$/.test(j.url) ? j.url : null;
  } catch { return null; }
}

function qrPng(url, run = execFile) {
  const [cmd, args] = CONTAINER
    ? ['docker', ['exec', '-w', '/app', '-e', `SPARK_URL=${url}`, CONTAINER, 'node', '-e', QR_JS]]
    : ['node', ['-e', QR_JS]];
  return new Promise((resolve, reject) => {
    run(cmd, args, { timeout: 30000, env: { ...process.env, SPARK_URL: url } }, (err, out) => {
      if (err) return reject(new Error(`qr failed: ${err.message.slice(0, 160)}`));
      const buf = Buffer.from(String(out).trim(), 'base64');
      if (buf.slice(1, 4).toString() !== 'PNG') return reject(new Error('qr failed: not a PNG'));
      resolve(buf);
    });
  });
}

/** { url, cid, buf } for the email, or null when Spark is not set up on this host. */
async function compileSparkCard({ file, run } = {}) {
  const url = readSparkUrl(file);
  if (!url) return null;
  return { url, cid: 'spark-qr', buf: await qrPng(url, run) };
}

function renderSpark(data, k) {
  const s = data.spark;
  if (!s) return '';
  return `<tr><td style="padding:9px 0 0 0">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${k.C.card || '#ffffff'};border:3px solid #e0446a;border-collapse:separate">
    <tr>
      <td valign="middle" style="padding:16px 8px 16px 18px;font-family:${k.FONT}">
        <div style="font-size:18px;font-weight:800;color:${k.C.ink}">🔒 Your 2-minute check-in</div>
        <div style="font-size:14px;color:${k.C.ink2 || k.C.muted};margin:6px 0 12px">Scan with your phone camera, or tap the button. You will need your 4-digit code.</div>
        <a href="${k.esc(s.url)}" style="display:inline-block;background:#e0446a;color:#ffffff;font-weight:800;font-size:15px;text-decoration:none;border-radius:10px;padding:11px 18px">Open my check-in</a>
      </td>
      <td width="140" valign="middle" align="center" style="padding:12px 14px 12px 0">
        <img src="cid:${s.cid}" alt="Check-in QR code" width="130" height="130" style="display:block;width:130px;height:130px;border:0" />
      </td>
    </tr>
  </table>
</td></tr>`;
}

module.exports = { compileSparkCard, renderSpark, readSparkUrl, qrPng };
