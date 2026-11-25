#!/usr/bin/env node
/*
 * checkSandbox - CI only. Runs the runner's own sandbox proof on a real GitHub runner, with a dummy
 * key in the proxy and no paid call. Prints which check failed: there is no student data here.
 */
import fs from 'node:fs';
import { assertSandbox, createEngine, destroyEngine, proxyPort } from './codexEngine.mjs';

const workspace = process.env.WORKSPACE;
fs.mkdirSync(workspace, { recursive: true });
const engine = createEngine({
  codexBin: process.env.CODEX_BIN, model: 'gpt-6.2-sol', port: proxyPort(process.env.PROXY_INFO), workspace,
});
try {
  assertSandbox(engine);
  console.log('sandbox proven');
} catch (err) {
  console.log(`${err.errorClass || err.name}: ${err.message}`);
  process.exitCode = 1;
} finally {
  destroyEngine(engine);
}
