#!/usr/bin/env node
// Generate the QR PNG for the RE Magazine ad pointing at the tracking URL.
// Replaces docs/img/ad-mockups-2026-06-02/qr-utility-ai.png so the V12
// ad render picks it up automatically without touching the HTML.

const path = require('path');
const fs = require('fs');
const QRCode = require(path.resolve(__dirname, '../../../node_modules/qrcode'));

const REPO = path.resolve(__dirname, '../../..');
const TARGET_URL = 'https://enterprise.colaberry.ai/qr/re-magazine-2026-07';
const OUT_PATH = path.join(REPO, 'docs/img/ad-mockups-2026-06-02/qr-utility-ai.png');

(async () => {
  // High error correction so the QR survives print + crop. Margin small so
  // it fills the box in the ad.
  await QRCode.toFile(OUT_PATH, TARGET_URL, {
    errorCorrectionLevel: 'H',
    width: 600,           // print-quality at 36px on the half-page ad
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  console.log('QR PNG:', OUT_PATH);
  console.log('Encoded URL:', TARGET_URL);
  console.log('Size:', (fs.statSync(OUT_PATH).size / 1024).toFixed(1), 'KB');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
