/**
 * A stand-in for the OpenAI chat API, for the Communications Hub e2e (CH8.1). The backend's OpenAI
 * client honours OPENAI_BASE_URL, so pointing it here keeps every model call on this machine: no
 * key, no cost, the same answer every time.
 *
 * It answers only what the hub asks for (a message draft, JSON with community_post + in_app, plus whatsapp
 * when the prompt asks for it) and
 * writes {{DATE}} and {{TIME}}, which the hub fills from the event, so the drafts pass the hub's own
 * date and time check exactly as a good real draft would. Any other request gets a 400, so a code path
 * that unexpectedly calls a model shows up as a failure instead of passing on made-up text.
 *
 * Usage: node tests/systemV2/lib/fakeOpenAI.js   (env: FAKE_OPENAI_PORT=3199). Binds 127.0.0.1 only.
 * Then start the backend with OPENAI_BASE_URL=http://127.0.0.1:3199/v1 and OPENAI_API_KEY=e2e-fake.
 */
const http = require('http');

const PORT = Number(process.env.FAKE_OPENAI_PORT || 3199);
let calls = 0;

function draft(prompt, system) {
  const title = (/This message is about an event: "([^"]+)"/.exec(prompt) || [])[1] || 'This session';
  const out = {
    community_post: { body: `${title} is on {{DATE}} at {{TIME}}. Builders show what they shipped. Bring one question.` },
    in_app: { title: title.slice(0, 120), body: `${title}: {{DATE}} at {{TIME}}.` },
  };
  // CH10.3: the three-version prompt (WhatsApp switched on) asks for a plain-text WhatsApp version too.
  if (/3\. whatsapp:/.test(system)) out.whatsapp = { body: `Hi all, ${title} is on {{DATE}} at {{TIME}}. Bring one question.` };
  return out;
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') { reply(res, 200, { ok: true, calls }); return; }
  if (req.method !== 'POST' || !/\/chat\/completions$/.test(req.url || '')) { reply(res, 404, { error: { message: `fake OpenAI: ${req.method} ${req.url} is not served` } }); return; }
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); } catch { reply(res, 400, { error: { message: 'fake OpenAI: body is not JSON' } }); return; }
    const user = (body.messages || []).filter((m) => m.role === 'user').map((m) => String(m.content)).join('\n');
    if (!/Kind of message:/.test(user)) { reply(res, 400, { error: { message: 'fake OpenAI: only Communications Hub message drafts are served' } }); return; }
    calls += 1;
    const system = (body.messages || []).filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n');
    const content = JSON.stringify(draft(user, system));
    console.log(JSON.stringify({ event: 'fake_openai_draft', call: calls }));
    reply(res, 200, {
      id: `chatcmpl-e2e-${calls}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: body.model || 'fake',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
      usage: { prompt_tokens: 100, completion_tokens: 60, total_tokens: 160 },
    });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(JSON.stringify({ event: 'fake_openai_ready', port: PORT })));
