#!/usr/bin/env node
// Build V10 standalone HTML by wrapping the V10 source PNG (which has the
// full ad visible, no cutoff) in a responsive HTML page. Sidesteps the
// CSS aspect-ratio + overflow conflict from V8/V9 standalone approach.
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '../../..');
const PNG_IN = path.join(REPO, 'tmp/m4-v10-source.png');
const HTML_OUT = path.join(REPO, 'docs/m4-v10-standalone.html');

const buf = fs.readFileSync(PNG_IN);
const b64 = buf.toString('base64');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RE Magazine - Mockup 4 V10 - press-ready</title>
<style>
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Inter, Arial, sans-serif;
    background: #f1f5f9;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
  }
  .ad-container {
    width: 100%;
    max-width: 1200px;
    background: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(15, 23, 42, 0.12);
    box-sizing: border-box;
  }
  .ad-container img {
    width: 100%;
    height: auto;
    display: block;
    border: 1px solid #e5e8ec;
    border-radius: 4px;
  }
  .caption {
    max-width: 1200px;
    margin: 14px auto 0;
    font-family: Inter, Arial, sans-serif;
    font-size: 11px;
    letter-spacing: 0.4px;
    color: #64748b;
    text-align: center;
  }
</style>
</head>
<body>
  <div>
    <div class="ad-container">
      <img src="data:image/png;base64,${b64}" alt="Mockup 4 V10 - RE Magazine half-page horizontal">
    </div>
    <div class="caption">RE Magazine - July 2026 Directory Issue - half-page horizontal - M4 V10</div>
  </div>
</body>
</html>`;

fs.writeFileSync(HTML_OUT, html);
console.log('Standalone HTML:', HTML_OUT, '(' + (fs.statSync(HTML_OUT).size / 1024).toFixed(1) + ' KB)');
