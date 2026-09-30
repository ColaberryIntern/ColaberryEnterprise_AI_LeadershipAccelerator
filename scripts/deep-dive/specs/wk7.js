module.exports = {
  week: 7,
  role: "Integration Engineer",
  tag: "INT · Wk 7",
  sections: [
    {
      id: "dashboard",
      navLabel: "Dashboard",
      eyebrow: "Integration Engineer · Week 7",
      title: "Make separate systems talk reliably",
      body: `
        <p class="lead">The Integration Engineer decides <strong>how independent systems and AI services exchange data without losing, duplicating, or corrupting it</strong>. Most integrations work in the demo and fail in production — on a timeout, a retry, a schema change, a rate limit. Your job as an architect isn't to wire every endpoint; it's to <strong>direct, evaluate, and approve</strong> the integrations an AI drafts, so the seams between systems hold under real traffic.</p>
        <div class="kpis">
          <div class="kpi"><div class="v">6</div><div class="l">Docs you'll build</div></div>
          <div class="kpi c1"><div class="v">6</div><div class="l">Systems to wire</div></div>
          <div class="kpi c2"><div class="v">100%</div><div class="l">Idempotent writes</div></div>
          <div class="kpi c3"><div class="v">0</div><div class="l">Silent failures</div></div>
        </div>
        <div class="callout"><strong>Running example.</strong> Throughout, we use one case — a regional insurer launching <em>AI-assisted claims intake</em>. It must connect six systems: the customer portal, the legacy policy admin system (PAS), a payment gateway, a document-OCR AI service, a fraud-scoring AI service, and a notification service. In your build you can pick any of Restaurant, Insurance, Healthcare, Retail, or Manufacturing.</div>
      `
    },
    {
      id: "overview",
      navLabel: "Overview & Mission",
      eyebrow: "Overview · Mission",
      title: "Why integration exists",
      body: `
        <p>Two systems that each work perfectly can still fail together. The customer portal accepts a claim; the policy admin system is having a slow morning; the payment gateway returns a 200 but the notification never fires. Nobody wrote a bug — the <strong>seam</strong> between systems was never designed for failure. Integration is the discipline of making those seams reliable: agreeing on a contract, translating one system's language into another's, and deciding exactly what happens when a dependency is slow, down, or duplicating messages.</p>
        <div class="card"><div class="sub">Business value</div><ul class="clean"><li>Lets a company reuse the systems it already paid for instead of rebuilding them.</li><li>Turns brittle, one-off scripts into repeatable, monitored data flows.</li><li>Prevents the expensive failures: a double-charged customer, a lost claim, a duplicate ticket.</li><li>Makes AI services usable in production by wrapping them in retries, timeouts, and fallbacks.</li></ul></div>
        <div class="card"><div class="sub">What breaks without it</div><ul class="clean"><li>A slow partner API with no timeout hangs your whole request thread.</li><li>A retried payment with no idempotency key charges the customer twice.</li><li>A partner adds one JSON field and your rigid parser breaks for everyone.</li><li>An error is swallowed in an empty catch, and a claim silently vanishes.</li></ul></div>
        <div class="callout warn"><strong>How AI changes integration.</strong> AI can draft an OpenAPI spec, a field-mapping table, and retry boilerplate in seconds — and it can be a system on the seam itself (OCR, scoring). What it can't decide is whether a call should be synchronous, what THIS partner's real failure modes are, or whether an idempotency key is actually unique. You supply that judgment; AI supplies the first draft.</div>
      `
    },
    {
      id: "twenty",
      navLabel: "The 20% You Need",
      eyebrow: "The 20% You Need to Know",
      title: "Enough integration to direct and judge it",
      body: `
        <p>You don't need to become an Integration Engineer. You need these building blocks well enough to spot when an AI's integration is naive, unsafe, or fragile.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Concept</th><th>What it is</th><th>The tell of good work</th></tr></thead>
          <tbody>
            <tr><td>REST / GraphQL / events</td><td>Three shapes of an API: request/response, query-shaped, and published facts</td><td>Right shape for the job, not one-size-fits-all</td></tr>
            <tr><td>API contract + versioning</td><td>The agreed request/response schema, versioned so change doesn't break callers</td><td>Explicit schema, <code>v1</code>/<code>v2</code>, backward compatible</td></tr>
            <tr><td>Authentication</td><td>Keys, OAuth tokens, or signed requests that prove who is calling</td><td>Tokens expire &amp; rotate; no secrets in the URL</td></tr>
            <tr><td>Webhooks vs polling</td><td>Push (they call you on an event) vs pull (you ask on a schedule)</td><td>Webhook for timely events; polling only as fallback</td></tr>
            <tr><td>Idempotency</td><td>The same request sent twice produces exactly one effect</td><td>An idempotency key on every write</td></tr>
            <tr><td>Retries + backoff</td><td>Re-attempting transient failures with a growing, jittered delay</td><td>Capped attempts, exponential backoff, not a tight loop</td></tr>
            <tr><td>Timeouts + circuit breakers</td><td>A bounded wait, and stopping calls to a dependency that keeps failing</td><td>Every call has a timeout; breaker opens on repeated failure</td></tr>
            <tr><td>Data mapping / transformation</td><td>Translating one system's fields, units, and enums into another's</td><td>Explicit field map; no silent type coercion</td></tr>
            <tr><td>Rate limits</td><td>The ceiling on calls per time window a partner allows</td><td>Honored: <code>429</code> handled, requests throttled</td></tr>
            <tr><td>Error handling + dead-letter</td><td>Where a message goes when it cannot be processed</td><td>Nothing lost; a dead-letter store with full context</td></tr>
            <tr><td>Sync vs async</td><td>Answer now vs accept-and-process-later with a callback</td><td>Slow or fragile work is async, not blocking</td></tr>
          </tbody>
        </table></div>
        <div class="callout"><strong>Example.</strong> Weak: "The portal calls the fraud-scoring service and waits for the answer." Strong: "The portal submits the claim, gets a <code>202 Accepted</code> with a claim ID, and the fraud score arrives later via callback — with a 3-second timeout, three capped retries, and a fallback to manual review if scoring is down."</div>
      `
    },
    {
      id: "role",
      navLabel: "Role in the SDLC",
      eyebrow: "Where it fits",
      title: "Role in the SDLC",
      body: `
        <p>The Integration Engineer owns the <strong>connect</strong> phase — turning designed, standalone services into a working system. It takes interface specs from architects and service owners and hands a monitored, resilient set of integrations to QA and operations.</p>
        <div class="flow">
          <div class="step"><div class="k">Before</div><div class="t">Service &amp; API design</div></div>
          <div class="step"><div class="k">You are here</div><div class="t">Integration Engineer</div></div>
          <div class="step"><div class="k">After</div><div class="t">QA / SRE / Operations</div></div>
        </div>
        <div class="stack" style="margin-top:.4rem">
          <div class="tier"><div class="lab">Gives integration its input</div><div class="row"><span class="chip">Solution Architect</span><span class="chip">Backend / Service owners</span><span class="chip">Partner / vendor APIs</span></div></div>
          <div class="tier"><div class="lab">The integration role (you direct it)</div><div class="row"><span class="chip pri">Integration Engineer</span></div></div>
          <div class="tier"><div class="lab">Consumes integration's output</div><div class="row"><span class="chip">QA (runs the test plan)</span><span class="chip">SRE / Ops (monitors)</span><span class="chip">Support (triages the DLQ)</span></div></div>
        </div>
        <div class="callout"><strong>Approval gate you own:</strong> integration sign-off. Before the system goes live, you confirm every external call is bounded, every write is idempotent, and every failure has somewhere to go.</div>
      `
    },
    {
      id: "io",
      navLabel: "Inputs & Outputs",
      eyebrow: "Section · Inputs & Outputs",
      title: "What comes in, what hands off",
      body: `
        <div class="grid g2">
          <div class="card"><h4>Inputs</h4><ul class="clean"><li>Interface specs &amp; API docs for each system</li><li>Auth credentials and rate-limit terms</li><li>The systems' data schemas (source &amp; target)</li><li>SLAs and failure expectations per dependency</li></ul></div>
          <div class="card"><h4>Outputs</h4><ul class="clean"><li>Integration architecture (systems + seams)</li><li>Versioned API contract / interface spec</li><li>Sequence diagrams and retry/idempotency design</li><li>Data mapping document and integration test plan</li></ul></div>
        </div>
        <div class="sub">Information flow</div>
        <div class="flow"><div class="step"><div class="k">In</div><div class="t">System APIs</div></div><div class="step"><div class="k">Contract</div><div class="t">Agree schema</div></div><div class="step"><div class="k">Map</div><div class="t">Fields &amp; units</div></div><div class="step"><div class="k">Harden</div><div class="t">Retry &amp; DLQ</div></div><div class="step"><div class="k">Out</div><div class="t">Live integration</div></div></div>
      `
    },
    {
      id: "responsibilities",
      navLabel: "Responsibilities",
      eyebrow: "Ownership",
      title: "What an Integration Engineer actually does",
      body: `
        <div class="grid g2">
          <div class="card"><h4>Design the seam</h4><ul class="clean"><li>Choose sync vs async per call</li><li>Choose webhooks vs polling</li><li>Define the versioned contract</li></ul></div>
          <div class="card"><h4>Translate</h4><ul class="clean"><li>Map source fields to target fields</li><li>Normalize units, dates, and enums</li><li>Validate payloads at the boundary</li></ul></div>
          <div class="card"><h4>Make it reliable</h4><ul class="clean"><li>Add timeouts and capped retries</li><li>Add idempotency keys to writes</li><li>Add circuit breakers and fallbacks</li></ul></div>
          <div class="card"><h4>Make it safe &amp; visible</h4><ul class="clean"><li>Manage tokens, keys, and rotation</li><li>Route failures to a dead-letter store</li><li>Instrument correlation IDs and metrics</li></ul></div>
        </div>
        <div class="card"><div class="sub">You own vs you don't</div>
          <div class="kv"><span class="k">Own</span><span class="val">The seams · Delivery modes · Failure paths · Idempotency</span></div>
          <div class="kv"><span class="k">Don't own</span><span class="val">The internals of each system · Business logic · The AI models themselves</span></div>
        </div>
      `
    },
    {
      id: "artifacts",
      navLabel: "Documents You'll Generate",
      eyebrow: "Section · Documents",
      title: "The 6 documents your Field Guide builds",
      body: `
        <p>These are exactly what your Field Guide generates for your chosen example — each viewable, searchable, and downloadable. Learn what each one proves.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Document</th><th>What it proves</th></tr></thead>
          <tbody>
            <tr><td>Integration Architecture</td><td>Every system, every seam, and how data moves between them</td></tr>
            <tr><td>API Contract / Interface Spec (OpenAPI-style)</td><td>Endpoints, request/response schemas, auth, error codes, versioning</td></tr>
            <tr><td>Sequence Diagrams</td><td>The order of calls — including the retry and the failure branch</td></tr>
            <tr><td>Error-Handling + Retry / Idempotency Design</td><td>Timeouts, backoff, circuit breakers, idempotency keys, dead-letter</td></tr>
            <tr><td>Data Mapping Document</td><td>Each target field sourced, with units and enums normalized</td></tr>
            <tr><td>Integration Test Plan</td><td>Coverage of 5xx, 429, timeout, malformed payload, and duplicate delivery</td></tr>
          </tbody>
        </table></div>
      `
    },
    {
      id: "goodbad",
      navLabel: "Good vs Bad Integration",
      eyebrow: "Section · Good vs Bad",
      title: "Good vs bad integration",
      body: `
        <div class="gb">
          <div class="col good"><h4>Good integration</h4><ul>
            <li>Every write carries an idempotency key — a retried "charge card" acts once.</li>
            <li>Every external call has a timeout and capped, backed-off retries.</li>
            <li>Contracts are versioned; a schema change ships <code>v2</code> without breaking <code>v1</code> callers.</li>
            <li>Failed messages land in a dead-letter queue with full context for triage.</li>
            <li>Tokens expire, rotate, and never appear in a URL or a log line.</li>
          </ul></div>
          <div class="col bad"><h4>Bad integration</h4><ul>
            <li>"It worked in the demo" — no timeout, so one slow dependency hangs everything.</li>
            <li>A retried payment with no idempotency key double-charges on the second attempt.</li>
            <li>Parsing the partner's JSON by position; one added field breaks the whole flow.</li>
            <li>Secrets pasted into the URL query string and logged on every request.</li>
            <li>Errors swallowed in an empty <code>catch</code> — failures vanish with no trace.</li>
          </ul></div>
        </div>
        <div class="callout warn"><strong>Red flags in AI-drafted integrations:</strong> a happy-path-only sequence diagram, retries with no cap, writes with no idempotency key, a data map with unsourced target fields, and secrets hardcoded in the sample request.</div>
      `
    },
    {
      id: "metrics",
      navLabel: "KPIs & Success",
      eyebrow: "Section · Measurement",
      title: "KPIs & success metrics",
      body: `
        <div class="grid g2">
          <div class="card"><h4>Quality signals</h4><ul class="clean"><li>% of writes protected by an idempotency key</li><li>Contract-test coverage (consumer + provider)</li><li>% of calls with an explicit timeout and retry policy</li></ul></div>
          <div class="card"><h4>Health signals</h4><ul class="clean"><li>Integration success rate (rolling)</li><li>p95 / p99 latency per dependency</li><li>Dead-letter queue depth and age</li><li>Retry rate — a proxy for upstream brittleness</li></ul></div>
        </div>
        <div class="callout"><strong>Leading vs lagging.</strong> Idempotency coverage and contract-test coverage are <em>leading</em> — they predict resilience before launch. Dead-letter depth and retry rate are <em>lagging</em> — they confirm where a seam is actually straining in production.</div>
      `
    },
    {
      id: "tools",
      navLabel: "Common Tools",
      eyebrow: "Section · Tools",
      title: "Common tools (recognition only)",
      body: `
        <div class="table-wrap"><table>
          <thead><tr><th>Tool</th><th>Used for</th><th>Where AI assists</th></tr></thead>
          <tbody>
            <tr><td>Postman / Insomnia</td><td>Exercising &amp; documenting APIs</td><td>Draft request collections &amp; tests</td></tr>
            <tr><td>OpenAPI / Swagger</td><td>The contract spec &amp; client stubs</td><td>Generate the first spec from a description</td></tr>
            <tr><td>Kafka / RabbitMQ / SQS</td><td>Async messaging &amp; dead-letter queues</td><td>Draft topic / queue &amp; DLQ design</td></tr>
            <tr><td>webhook.site / ngrok</td><td>Receiving &amp; inspecting webhooks</td><td>Draft the handler + signature check</td></tr>
            <tr><td>Zod / JSON Schema</td><td>Validating payloads at the boundary</td><td>Generate schemas from sample payloads</td></tr>
            <tr><td>Datadog / OpenTelemetry</td><td>Tracing &amp; monitoring calls</td><td>Draft correlation-ID instrumentation</td></tr>
          </tbody>
        </table></div>
      `
    },
    {
      id: "ai",
      navLabel: "AI Collaboration",
      eyebrow: "Section · AI Collaboration",
      title: "Working with AI on integrations",
      body: `
        <div class="grid g2">
          <div class="card"><h4>AI does well</h4><ul class="clean"><li>Draft an OpenAPI spec from a description</li><li>Generate a field-mapping table between schemas</li><li>Write retry, backoff, and idempotency boilerplate</li><li>Draft webhook signature verification</li></ul></div>
          <div class="card"><h4>You still own</h4><ul class="clean"><li>Which delivery mode fits — sync or async</li><li>This partner's real failure modes</li><li>Whether the idempotency key is truly unique</li><li>The security posture of tokens and secrets</li></ul></div>
        </div>
        <div class="sub">The loop</div>
        <div class="flow"><div class="step"><div class="k">1</div><div class="t">Describe the systems</div></div><div class="step"><div class="k">2</div><div class="t">AI drafts contract &amp; map</div></div><div class="step"><div class="k">3</div><div class="t">You evaluate</div></div><div class="step"><div class="k">4</div><div class="t">Break it on purpose</div></div><div class="step"><div class="k">5</div><div class="t">Approve</div></div></div>
      `
    },
    {
      id: "review",
      navLabel: "Architect Review Lens",
      eyebrow: "Architect Review",
      title: "Before you approve an integration",
      body: `
        <p>Run every AI-generated integration through this lens.</p>
        <div class="grid g2">
          <div class="card"><h4>Contract &amp; versioning</h4><ul class="clean"><li>Is the schema explicit and versioned?</li><li>Is it backward compatible?</li><li>Does it reject malformed input at the boundary?</li></ul></div>
          <div class="card"><h4>Reliability</h4><ul class="clean"><li>Does every call have a timeout?</li><li>Are retries capped with backoff?</li><li>Is every write idempotent?</li></ul></div>
          <div class="card"><h4>Failure path</h4><ul class="clean"><li>Where do failures go — a dead-letter store?</li><li>Is there a circuit breaker or fallback?</li><li>Is anything swallowed silently?</li></ul></div>
          <div class="card"><h4>Security</h4><ul class="clean"><li>Do tokens expire and rotate?</li><li>Are secrets kept out of URLs and logs?</li><li>Is each credential least-privilege?</li></ul></div>
        </div>
        <div class="callout"><strong>Approve only when:</strong> every external call has a timeout and a capped retry, every write is idempotent, failures land in a dead-letter store with context, the contract is versioned and validated at the boundary, and no secret appears in a URL or a log line.</div>
      `
    },
    {
      id: "inspect",
      navLabel: "How to Inspect It",
      eyebrow: "Inspect Your Build",
      title: "What to check in your Field Guide",
      body: `
        <p>After Claude Code builds your Field Guide, open it and check these — this is how you practice the architect's review:</p>
        <ul class="clean">
          <li><strong>Integration architecture</strong> — does every external boundary show a timeout, a retry, and a failure path?</li>
          <li><strong>API contract</strong> — is it versioned, with request/response schemas AND error codes, not just the happy path?</li>
          <li><strong>Sequence diagrams</strong> — do they show the retry and the failure branch, not only success?</li>
          <li><strong>Retry / idempotency design</strong> — is the idempotency key defined and genuinely unique per business event?</li>
          <li><strong>Data mapping</strong> — is every target field sourced, with units and enums normalized and unmapped fields flagged?</li>
          <li><strong>Integration test plan</strong> — does it cover 5xx, 429, timeout, malformed payload, and duplicate delivery?</li>
          <li><strong>Ask assistant</strong> — try asking it "what happens when the payment gateway times out?" and see if it answers from your design.</li>
        </ul>
        <div class="callout">Found a gap? That's the point — refine your prompt, rebuild, and re-upload. The newest version replaces the old; points are awarded once.</div>
      `
    },
    {
      id: "kb",
      navLabel: "Knowledge Base",
      eyebrow: "Knowledge Base",
      title: "Glossary",
      body: `
        <div class="terms">
          <div class="term"><b>Idempotency key</b><p>A unique token on a write so a retried request produces exactly one effect.</p></div>
          <div class="term"><b>Exponential backoff</b><p>Growing, jittered delays between retries so a struggling service isn't hammered.</p></div>
          <div class="term"><b>Circuit breaker</b><p>Stops calling a dependency after repeated failures, then probes to see if it recovered.</p></div>
          <div class="term"><b>Dead-letter queue (DLQ)</b><p>Where a message goes when it cannot be processed, kept with full context for triage.</p></div>
          <div class="term"><b>Webhook</b><p>A push notification: the partner calls your endpoint when an event happens.</p></div>
          <div class="term"><b>Polling</b><p>A pull model: you ask a partner for new data on a schedule.</p></div>
          <div class="term"><b>OAuth 2.0</b><p>A token-based auth flow that issues short-lived, scoped access without sharing a password.</p></div>
          <div class="term"><b>Rate limit (429)</b><p>The ceiling on calls per window; exceeding it returns HTTP <code>429 Too Many Requests</code>.</p></div>
          <div class="term"><b>OpenAPI</b><p>A standard, machine-readable description of an API's endpoints, schemas, and auth.</p></div>
          <div class="term"><b>Schema / payload</b><p>The agreed structure of the data body sent or returned by a call.</p></div>
          <div class="term"><b>Sync vs async</b><p>Answer within the request vs accept now and finish later via callback or status.</p></div>
          <div class="term"><b>Correlation ID</b><p>An ID attached to a request and every downstream call so one failure can be traced end to end.</p></div>
        </div>
        <div class="q"><div class="qt">When should I use a webhook instead of polling?</div><button class="revealbtn">Reveal</button><div class="ans">Use a webhook when the partner can push you the event and timeliness matters — you react the moment it happens instead of asking on a schedule. Poll only as a fallback when no webhook exists, and always make the handler idempotent, because webhooks can arrive twice.</div></div>
        <div class="q"><div class="qt">Why does every write need an idempotency key?</div><button class="revealbtn">Reveal</button><div class="ans">Networks retry. Without a key, the second attempt of "create claim" or "charge card" becomes a duplicate. With a key, the receiver recognizes the repeat and returns the first result instead of acting twice.</div></div>
        <div class="q"><div class="qt">Sync or async — how do I choose?</div><button class="revealbtn">Reveal</button><div class="ans">If the caller needs the answer now and the work is fast, use sync. If the work is slow, external, or failure-prone (like AI scoring or document OCR), accept the request, return a ticket or <code>202</code>, and finish asynchronously with a callback or a status endpoint.</div></div>
      `
    },
    {
      id: "build",
      navLabel: "Build & Submit",
      eyebrow: "Build & Submit",
      title: "Build your Integration Engineer Field Guide",
      body: `
        <p class="lead">You'll build your Field Guide in <strong>your own Claude Code</strong>: a searchable, Colaberry-branded guide with the integration documents generated for a chosen example, an Ask assistant, and downloadable docs. Then upload it here.</p>
        <p>Your Field Guide will contain real, substantial versions of the six documents an Integration Engineer produces:</p>
        <ul class="clean">
          <li><strong>Integration Architecture</strong> — every system, seam, and delivery mode</li>
          <li><strong>API Contract / Interface Spec</strong> — OpenAPI-style endpoints, schemas, auth, error codes, versioning</li>
          <li><strong>Sequence Diagrams</strong> — happy path plus retry and failure branches</li>
          <li><strong>Error-Handling + Retry / Idempotency Design</strong> — timeouts, backoff, circuit breakers, dead-letter</li>
          <li><strong>Data Mapping Document</strong> — source-to-target fields, transformations, units and enums</li>
          <li><strong>Integration Test Plan</strong> — happy path, 5xx, 429, timeout, malformed payload, duplicate delivery</li>
        </ul>
        <button class="buildcta" id="copyPromptBtn2" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy the build prompt</button>
        <p class="muted small">The prompt is long on purpose — just copy it and paste it straight into Claude Code. You don't need to read it.</p>
      `
    }
  ],
  buildPrompt: "Build a rich, self-contained Integration Engineer FIELD GUIDE as a single HTML file named IntegrationEngineer_FieldGuide.html. Take your time and make it genuinely substantial — this is a 5 to 10 minute build that should produce a polished, knowledge-base-style guide, not a quick page.\n\nWHO IT'S FOR: I'm a learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect. I need the ~20% of integration engineering required to DIRECT, EVALUATE, and APPROVE AI-generated integrations between separate systems and AI services. I have no project yet — pick ONE example industry (Restaurant, Insurance, Healthcare, Retail, or Manufacturing), invent a believable initiative that spans several systems (for Insurance: AI-assisted claims intake connecting a customer portal, a legacy policy admin system, a payment gateway, a document-OCR AI service, a fraud-scoring AI service, and a notification service), and make every document concrete to that example.\n\nMAKE IT A KNOWLEDGE BASE, not a brochure. Model it on a clean help-center / knowledge base (like a polished docs site): a left topic nav, a prominent SEARCH box, and an \"Ask\" assistant the learner can type questions into that answers FROM THE GUIDE'S OWN CONTENT (embed a small offline Q&A — match the question to the most relevant section/FAQ and show that answer; no external API; it must work offline).\n\nBRANDING & QUALITY: put the Colaberry logo in the header and on the print/PDF export. Executive, calm, authoritative voice. Light/dark aware. Fully self-contained: inline CSS + JS, NO external libraries or CDNs, works offline when saved as one file.\n\nTEACH THE DISCIPLINE (concise): why integration exists; the 20% to know — REST vs GraphQL vs event APIs; API contracts & versioning; authentication (keys, OAuth, tokens); webhooks vs polling; idempotency, retries & backoff; timeouts & circuit breakers; data mapping & transformation; rate limits; error handling & dead-letter queues; synchronous vs asynchronous; good vs bad integration; KPIs; the architect's review lens.\n\nTHEN GENERATE THE DOCUMENTS — this is the heart of it. For the chosen example, produce REAL, substantial documents (not placeholders), each in its own searchable section, each individually DOWNLOADABLE. The PRIMARY format is a fully-styled, self-contained HTML file that must look like a genuine, reusable, professional deliverable — a branded cover with the Colaberry logo, a document-control strip (version, owner, status, date), styled section headers and navy tables, callouts, a sign-off block (Prepared / Reviewed / Approved), and a footer. Make each document EXTENSIVE and complete, not a summary. ALSO provide a Save-as-PDF that prints that SAME designed document, and an Excel-friendly .csv export for the tabular documents (data mapping, test plan). Do NOT default to plain .md:\n  1. Integration Architecture — the systems, the seams between them, and each delivery mode (sync/async, webhook/poll)\n  2. API Contract / Interface Spec (OpenAPI-style) — endpoints, request/response schemas, authentication, error codes, and versioning\n  3. Sequence Diagrams — the order of calls for the main flows, including the retry path and the failure branch\n  4. Error-Handling + Retry / Idempotency Design — timeouts, backoff curves, circuit breakers, idempotency keys, and dead-letter handling\n  5. Data Mapping Document — every target field mapped to its source, with transformations and normalized units and enums\n  6. Integration Test Plan — happy path plus 5xx, 429 rate limit, timeout, malformed payload, and duplicate-delivery cases with idempotency checks\n\nUSE RICH VISUALS wherever they aid understanding: Mermaid-style diagrams (integration / C4 architecture maps, sequence diagrams, flow maps) AND Power BI-style charts (KPI tiles, bar / line / donut) for anything quantitative (integration success rate, latency percentiles, retry mix, DLQ depth). Render ALL diagrams and charts as INLINE SVG (self-contained, no external libraries or CDNs) so the guide works offline. QUALITY BAR: every external call has a timeout and a capped, backed-off retry; every write carries an idempotency key; the contract is versioned and validated; failures route to a dead-letter store; no secret appears in a URL or a log. No happy-path-only sequence diagrams. No unsourced fields in the data map. Every document must be findable via the search box and answerable by the Ask assistant.\n\nEMBED metadata as a JSON script tag with id=\"deepdive-metadata\": { guide_type:\"Integration Engineer Field Guide\", curriculum_type:\"deep_dive\", week:7, discipline:\"Integration Engineer\", student_id, project_id, repository, generated_by:\"Claude Code\", generated_date, version, build_number }.\n\nWhen finished, open the file in the browser."
};
