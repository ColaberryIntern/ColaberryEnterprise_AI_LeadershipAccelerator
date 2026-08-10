/**
 * week5.ts — the complete authored content pack for WEEK 5,
 * "MCP Foundations + First MCP Server" (Intensive 2 · Create Your AI Team).
 *
 * Arc beat: "Your AI gets hands — it can finally reach the systems your
 * business runs on." Act II (Reach), trust-ladder position: the system now
 * touches real systems, read-mostly.
 *
 * Week 3 taught the tool_use round trip by hand: the schema lived in the
 * student's Python file, they checked stop_reason, they ran the function, they
 * posted a tool_result back. Week 5 is that exact idea, standardised — the
 * schema and the execution move OFF the app and onto a server any MCP client
 * can consume. That relocation is the whole week, and it is organisational as
 * much as technical: the integration stops being a feature of one app and
 * becomes an asset of the company.
 *
 * Authoring rules honoured here (see docs/training-program-2026-q3/
 * TWELVE_WEEK_STORY_ARC.md):
 *   • every teach slide carries its own mermaid diagram, ≤7 short-labelled
 *     nodes, because it gets click-zoomed and read from the back of the room
 *   • code blocks are Claude Code PROMPTS or read-together code, never
 *     "type this in" — shell commands are explicitly marked for the terminal
 *   • current API surface only (claude-opus-5 / claude-sonnet-5 /
 *     claude-haiku-4-5; structured output via output_config, never the
 *     deprecated top-level output_format)
 *   • everything points back at the student's OWN build plan
 *
 * Pure data, one type-only import, so it type-checks and renders in isolation.
 */
import type { WeekPack } from '../weekPack';

export const WEEK5_PACK: WeekPack = {
  week: 5,
  arcBeat: 'Your AI gets hands — it can finally reach the systems your business runs on.',

  /* ====================================================================== */
  /*  MONDAY — Architecture Day                                             */
  /* ====================================================================== */
  monday: {
    hook: {
      headline: 'Everything you have built so far can only see what you paste into it.',
      caption: 'Tonight that ends. MCP is the standard way your AI reaches the systems your business actually runs on.',
    },

    teach: [
      /* ======================= check-in · where you are ==================== */
      {
        segment: 'checkin', eyebrow: '🪜 Where you are', title: 'Four weeks in, and your AI still cannot open a single door by itself',
        body: 'Look honestly at what you have built. Week 1 you stopped typing code and started directing an engineer. Week 2 you taught it once instead of every time. Week 3 it ran without you in the room and started costing money per run. Week 4 your private judgment became a tested, versioned asset your team can use. All of that is real — and all of it still ends with you as the integration. You export the CSV. You paste the ticket. You look up the order and hand it over. Tonight the AI stops waiting on your clipboard.',
        bullets: [
          'W1 you direct it · W2 you teach it once · W3 it runs unattended · W4 your judgment is reusable',
          'Every one of those still ends with a human moving the data by hand',
          'Tonight: the standard way to give it reach into real systems',
          'On the trust ladder this is a real step — it reaches your systems, read-mostly',
        ],
        diagram: `flowchart LR
  W1["1️⃣ You direct it"] --> W2["2️⃣ You teach it once"]
  W2 --> W3["3️⃣ It runs<br/>without you"]
  W3 --> W4["4️⃣ Your judgment<br/>is reusable"]
  W4 --> W5["5️⃣ It reaches<br/>real systems"]`,
        script: 'Walk the ladder left to right and name each week out loud — the room has lived all four, so this takes twenty seconds and buys you the whole night. Then land the turn: "every single one of those still has you in the middle, moving data with your hands." Pause there. That pause is the setup for the entire class.',
      },
      {
        segment: 'checkin', eyebrow: '🗺️ Tonight', title: 'Three things you leave with, and one decision you have to make',
        body: 'Here is the shape of the next two hours. First, what MCP actually is and the specific pain it was invented to kill — this part is architecture, not vocabulary. Second, the three primitives a server can expose, taught honestly and distinctly, because confusing them is the number-one beginner mistake and it has real consequences. Third, your own scaffolded server answering a real call in the inspector. And one decision: which capability from your own build plan your server will expose on Thursday.',
        bullets: [
          '1️⃣ What MCP is, and the M×N problem it exists to kill',
          '2️⃣ Tools, resources, prompts — and who controls each',
          '3️⃣ Your own server, running, answering in the inspector',
          '🎯 The decision: which capability YOUR project needs exposed',
        ],
        diagram: `flowchart TD
  T["📚 Tonight"] --> A["1️⃣ Why MCP<br/>exists at all"]
  T --> B["2️⃣ The three<br/>primitives"]
  T --> C["3️⃣ Your server,<br/>live in the inspector"]
  T --> D["🎯 Pick YOUR<br/>capability"]`,
        script: 'Hold up three fingers, then a fourth for the decision. Say plainly that the decision is homework they do DURING class, not after — by the trailer segment you will ask several students to name their capability out loud, and they should know that now.',
      },

      /* ================== business problem · the reach ceiling ============= */
      {
        segment: 'business-problem', eyebrow: '🔌 The reach problem', title: 'A brilliant consultant, locked in a room, with no phone',
        body: 'Imagine hiring the sharpest analyst you have ever met and then putting them in a room with no phone, no network, and no access to any of your systems. They can reason beautifully about anything you slide under the door. They cannot look up today’s order status, read your runbook, or file a ticket. That is exactly the state of a model with no reach. The ceiling on enterprise AI is almost never how smart the model is — it is what the model is allowed to see and permitted to do.',
        bullets: [
          'A model knows the world up to its training cutoff and nothing about your company today',
          'Useful = reasoning + live context + the ability to act',
          'Every AI feature you have shipped so far worked because a human fed it context',
          'The ceiling is reach, not intelligence',
        ],
        diagram: `flowchart LR
  M["🧠 The model<br/>reasons brilliantly"] --> W["🧱 No reach"]
  W -.->|"blocked"| S1[("🗄️ Your CRM")]
  W -.->|"blocked"| S2[("🎫 Your tickets")]
  W -.->|"blocked"| S3[("📄 Your runbooks")]`,
        script: 'Ask the room: "what is the single most useful thing AI has done for you at work, and what made it useful?" Steer every answer to the same truth — it was useful because it could reach something real, and usually because a human carried the data in by hand. Do not name MCP yet.',
      },
      {
        segment: 'business-problem', eyebrow: '🧨 The M×N explosion', title: 'Why four teams at the same company each wrote the same connector',
        body: 'Before MCP, if you had M AI applications and N systems to connect, you wrote M×N integrations. Each application re-implemented the tool schema, the authentication, the execution, the retries, and the error handling for every system, in its own way, inside its own codebase. Six apps and five systems is thirty bespoke connectors, each drifting independently. Because the tool definitions lived inside each app, nothing was reusable: a bug fixed in one connector stayed broken in the other three, and nobody could tell you how many copies existed.',
        bullets: [
          'Schema + auth + execution + error handling, copied once per app per system',
          'No reuse: your CRM connector cannot be lifted into a teammate’s app',
          'Drift: four copies, four behaviours, one fix that lands in one place',
          'Governance nightmare: nobody can list who is talking to what',
        ],
        diagram: `flowchart LR
  A1["🤖 App A"] --> S1[("🗄️ CRM")]
  A1 --> S2[("🎫 Tickets")]
  A2["🤖 App B"] --> S1
  A2 --> S2
  A3["🤖 App C"] --> S1
  A3 --> S2`,
        script: 'Draw the extra lines on the board live — three apps, two systems, six lines, and it already looks like a mess. Then ask: "now make it six apps and five systems." Let someone say thirty. Then ask the reframing question: "what number do we actually want?" Land on eleven. That reframe is the whole reason MCP exists.',
      },
      {
        segment: 'business-problem', eyebrow: '🔋 One standard', title: 'MCP turns M×N into M+N — write the connector once, every client uses it',
        body: 'Model Context Protocol is an open standard that defines one common way for AI applications to talk to external capabilities. Each system gets exposed once, behind an MCP server. Any MCP-capable application then speaks that one protocol to consume it. Write the CRM server once and Claude Code, Claude Desktop, your internal app, and a tool that does not exist yet all use it unchanged. The old analogy is USB-C: one connector standard replacing a drawer full of proprietary cables that each only fitted one device.',
        bullets: [
          'Server author integrates a system once — for every client that will ever exist',
          'Client author speaks one protocol — for every server that will ever exist',
          'M+N connectors instead of M×N, and the ecosystem compounds',
          'Integrations stop being a per-app tax and become shareable assets',
        ],
        evidence: [
          {
            claim: 'MCP is an open protocol, originated by Anthropic and now broadly adopted, for connecting AI applications to external tools and data',
            publisher: 'Anthropic',
            sourceTitle: 'Model Context Protocol documentation (modelcontextprotocol.io)',
            publicationDate: '2024',
            sourceType: 'official-doc',
            note: 'Adoption and the client/server ecosystem move quickly — open the spec site live in class rather than quoting a vendor list off this slide.',
          },
        ],
        diagram: `flowchart LR
  A1["🤖 App A"] --> P["🔌 MCP<br/>one protocol"]
  A2["🤖 App B"] --> P
  A3["🤖 App C"] --> P
  P --> S1["🗄️ CRM server"]
  P --> S2["🎫 Ticket server"]`,
        script: 'Put this diagram next to the previous one and let the visual do the arguing — six tangled lines becomes five clean ones. Say the payoff plainly: the moment a standard exists, an integration becomes something you can hand to somebody else. Then promise Thursday: every person in this room authors one of these.',
      },
      {
        segment: 'business-problem', eyebrow: '🏢 Why your org cares', title: 'The integration stops belonging to your app and starts belonging to the company',
        body: 'This is the part that is easy to miss and matters most in a large organisation. When the tool definition and the execution move onto a server, ownership moves with them. The team that owns the CRM owns the CRM server — its auth, its rate limits, its audit log, its version. Your application team stops being asked to understand Salesforce authentication. Security reviews the connector once instead of once per app. And when the API changes, one team ships one fix and every client gets it. That is not a technical convenience; that is an operating-model change.',
        bullets: [
          'The system owner owns the server — auth, limits, audit, versioning',
          'App teams stop re-learning somebody else’s API',
          'Security reviews one connector, not one per application',
          'An upstream change is one fix, not a company-wide search-and-replace',
        ],
        diagram: `flowchart TD
  OWN["👥 The team that<br/>owns the system"] --> SRV["🗄️ One MCP server<br/>auth · limits · audit"]
  SRV --> C1["🤖 Your app"]
  SRV --> C2["💻 Claude Code"]
  SRV --> C3["🖥️ Claude Desktop"]
  SEC["🛡️ Security reviews<br/>it once"] -.-> SRV`,
        script: 'This is the slide the executives in the room came for. Ask: "who at your company would own the connector to your biggest system?" Let two people answer. Most rooms discover the honest answer is "nobody, and four teams have each half-built it" — which is exactly the problem MCP is shaped to solve.',
      },

      /* ================== architecture · how MCP is put together =========== */
      {
        segment: 'architecture', eyebrow: '🏛️ The four roles', title: 'Host, client, server, transport — and the one-to-one rule',
        body: 'MCP has four moving parts and they are worth naming precisely, because every error message you will read this week uses these words. The host is the AI application a human runs — Claude Code, Claude Desktop, your own app. Inside the host lives one MCP client per server, each holding a dedicated connection. The server is a separate program that exposes capabilities. The transport is the pipe between them: STDIO when the server is a local subprocess, Streamable HTTP when it is a remote service. The design fact worth memorising is that one-to-one relationship — a host runs many clients, and each client talks to exactly one server, which keeps namespaces and lifecycles cleanly isolated.',
        bullets: [
          'Host = the app the human uses; it can run many clients at once',
          'Client = one per server, owns a single connection and its lifecycle',
          'Server = its own process, exposing tools / resources / prompts',
          'Transport = STDIO (local subprocess, this week) or Streamable HTTP (Week 6)',
        ],
        diagram: `flowchart LR
  H["🖥️ Host<br/>the app you run"] --> C1["🔗 Client 1"]
  H --> C2["🔗 Client 2"]
  C1 -->|"STDIO"| S1["🗄️ Server A"]
  C2 -->|"STDIO"| S2["🎫 Server B"]`,
        script: 'Draw the host as one big box with two circles inside it and two boxes outside, one line each. Say the one-to-one rule twice — it is why a misbehaving server cannot corrupt another server’s namespace, and it is the mental model for the entire intensive.',
      },
      {
        segment: 'architecture', eyebrow: '📦 The big shift', title: 'Tool definition AND execution both move off your application',
        body: 'This is the architectural heart of the week, and it is worth slowing down on. In the old world, the tool’s JSON schema and the code that runs it both lived inside your application. Under MCP, both leave. Your app no longer knows how to query the CRM; it only knows how to speak MCP. It asks the server what exists, the server returns the schemas, the model picks one, the app forwards the call, and the server executes it. Your application shrinks toward being a protocol client, and every piece of integration-specific knowledge — schema, credentials, retries, rate limits — becomes the server’s concern, versioned in exactly one place.',
        bullets: [
          'Before: schema + execution hardcoded into every app that needs it',
          'After: the app holds neither — it discovers schemas and forwards calls',
          'The server owns the integration logic, the credentials, and the version',
          'Consequence: upgrade or swap a server without touching a single client',
        ],
        diagram: `flowchart LR
  B["📦 BEFORE<br/>app holds schema<br/>+ execution"] --> X["✂️ Both move out"]
  X --> A["🪶 AFTER<br/>app speaks MCP<br/>and nothing else"]
  X --> S["🗄️ Server holds schema,<br/>credentials, execution"]`,
        script: 'Two boxes on the board: "app before," bulging with integration code, and "app after," nearly empty, with all that mass moved into the server box. Tie it straight back to M+N — this relocation is precisely what makes a connector reusable instead of a private copy.',
      },
      {
        segment: 'architecture', eyebrow: '🔁 Week 3, callback', title: 'You already did this by hand. MCP is that same round trip, standardised.',
        body: 'Nothing here is new to you conceptually, and that is worth saying out loud. In Week 3 you wrote a tool schema into your Python file, sent it with your request, checked whether stop_reason came back as tool_use, ran the real function yourself, and posted a tool_result back so Claude could finish. That loop does not disappear under MCP — the host still runs it, turn for turn. What changes is where the two important pieces live. The schema and the function moved out of your file and onto a server, where any client can find them.',
        bullets: [
          'The round trip is identical: model asks → your side executes → result goes back',
          'What moved: the schema and the function, out of your app, onto a server',
          'What stays: your code still never gets executed by Claude — it asks, you run it',
          'What you gain: the same tool now works in every MCP client, unchanged',
        ],
        code: {
          kind: 'review',
          label: 'The same tool, before and after — read it, do not paste it',
          code: '# WEEK 3 — the schema and the function both lived inside YOUR program\ntools = [{\n    "name": "lookup_order",\n    "description": "Look up an order by ID.",\n    "input_schema": {\n        "type": "object",\n        "properties": {"order_id": {"type": "string"}},\n        "required": ["order_id"],\n    },\n}]\n# ...then you checked stop_reason == "tool_use", ran the function yourself,\n#    and posted a tool_result block back with the matching tool_use_id.\n\n# WEEK 5 — the same two things, moved onto a server any client can use\n@mcp.tool()\ndef lookup_order(order_id: str) -> dict:\n    """Look up an order by ID and return its status, carrier and ETA."""\n    return ORDERS[order_id]',
          expectedResult: 'Two fingers on two things: the schema you hand-wrote in Week 3, and the decorator that now generates it for you on the server.',
        },
        diagram: `flowchart LR
  W3["🐍 Week 3<br/>schema + function<br/>inside your app"] --> MV["📦 Move both out"]
  MV --> W5["🗄️ Week 5<br/>schema + function<br/>on a server"]
  W5 --> ANY["🤖 Any MCP client<br/>can use it"]`,
        script: 'Read the two halves side by side and let the room notice how little actually changed. Say the reassuring line explicitly: "you are not learning a new concept tonight, you are learning where to put the one you already know." That defuses most of the anxiety in the room before the primitives arrive.',
      },
      {
        segment: 'architecture', eyebrow: '🧩 Three primitives', title: 'Tools, resources, prompts — and the axis that actually separates them',
        body: 'An MCP server exposes exactly three kinds of capability, and the distinction that matters is not what they do but who decides to invoke them. Tools are model-controlled: the model chooses to call one mid-turn to take an action. Resources are application-controlled: the host decides what read-only context to load into the window. Prompts are user-controlled: a human explicitly triggers them, usually as a slash command or a menu pick. Get that control axis right and the rest of MCP design falls out of it. Get it wrong and your server quietly fights every client that tries to use it correctly.',
        bullets: [
          '🔧 Tools = model-controlled ACTIONS — the model picks them, like a function call',
          '📚 Resources = app-controlled read-only CONTEXT — the app loads them, like GET',
          '💬 Prompts = user-controlled TEMPLATES — the human invokes them, like a slash command',
          'The axis that matters: who initiates — the model, the app, or the person',
        ],
        diagram: `flowchart TD
  S["🗄️ Your MCP server"] --> T["🔧 Tools<br/>model decides"]
  S --> R["📚 Resources<br/>the app decides"]
  S --> P["💬 Prompts<br/>the human decides"]`,
        script: 'Put a three-column table on the board — primitive, everyday analogy, who controls — and fill the "who controls" column last and loudest. That column is the exam-worthy insight and the answer to tonight’s poll. Tell them most beginner MCP bugs are a control-model mismatch, which sets up the deconstruct segment cleanly.',
      },
      {
        segment: 'architecture', eyebrow: '🔧 Tools, precisely', title: 'A tool is an action the model chooses to take — and the description is the routing logic',
        body: 'A tool is a function the model can invoke, published with a name, a description, and a JSON Schema for its inputs. It is model-controlled and it generally does work or has effects: search a database, create a ticket, send a message. Think POST, not GET. The critical thing beginners miss is that the description and the schema are not documentation for humans — they are the model’s only guide to when and how to call this tool. A vague description produces a tool that fires at the wrong moment or never fires at all. And because the model decides when to invoke it, the tool boundary is exactly where input validation and authorisation belong.',
        bullets: [
          'Shape: name + description + input schema + the function that executes',
          'Model-controlled: it decides when to call, mid-turn, without asking you',
          'Does work / has effects — treat it like POST and guard it accordingly',
          'The description is a prompt written for the model, not a code comment',
          'Validation lives here, at the boundary, because the caller is not trusted',
        ],
        diagram: `flowchart LR
  D["📝 Description<br/>= when to use it"] --> T["🔧 Tool"]
  SC["📐 Input schema<br/>= what it accepts"] --> T
  T --> EX["🐍 Your function<br/>runs on the server"]
  EX --> RES["📦 Structured result<br/>back to the model"]`,
        script: 'Say the load-bearing line and then repeat it: "the description is a prompt." Show a vague description and a precise one on screen — this is the same lesson as Week 2’s Skill descriptions, so it lands fast. Foreshadow Thursday: this is where the failure injection happens, because it is where the boundary is.',
      },
      {
        segment: 'architecture', eyebrow: '📚 The other two', title: 'Read-only context has a URI and a MIME type. A workflow a human triggers is a prompt.',
        body: 'A resource is identified by a URI — docs://catalog, file:///runbook.md — and carries a MIME type so the client knows what to do with the bytes: text/markdown, application/json, image/png. Resources are read-only and side-effect free, like GET, and the application decides which to pull into context. A resource template parameterises the URI so one handler serves many items addressable by id. A prompt is a named, argument-taking message template a human invokes deliberately, typically surfaced as a slash command. The rule of thumb fits on one line: data the model reads is a resource, an action the model performs is a tool, a workflow a person triggers is a prompt.',
        bullets: [
          'Resource: URI + MIME type, read-only, app-controlled — behaves like GET',
          'Resource template: one handler serving many items, addressed by id in the URI',
          'Prompt: a named template with arguments, invoked by the human, like a slash command',
          'The rule: reads = resource · does = tool · a person triggers it = prompt',
        ],
        diagram: `flowchart TD
  R["📚 Resource"] --> RU["🔗 URI<br/>docs://catalog"]
  R --> RM["🏷️ MIME type<br/>the handling contract"]
  P["💬 Prompt"] --> PA["🎛️ Named + arguments"]
  P --> PS["⌨️ Shows up as a<br/>slash command"]`,
        script: 'Hammer the MIME type — it is the contract that tells the client whether to render markdown, parse JSON, or show an image, and leaving it off is a real bug, not a style nit. Then read the one-line rule aloud twice. It is the answer to tonight’s design-choice poll and the fix in the deconstruct segment.',
      },
      {
        segment: 'architecture', eyebrow: '📨 Under the hood', title: 'It is JSON-RPC 2.0 over a pipe, and you can watch every single message',
        body: 'MCP is not magic, and seeing the wire format is what makes it stop feeling abstract. It is JSON-RPC 2.0 messages flowing over a transport. The connection opens with an initialize handshake where the client and server negotiate protocol version and capabilities. After that the client sends requests — tools/list, tools/call, resources/list, resources/read, prompts/list, prompts/get — and the server answers, matching each response to the request id. STDIO runs the server as a local subprocess and pipes JSON over stdin and stdout, which is exactly what we do this week. This is also why the inspector is so valuable: it is a window onto these messages.',
        bullets: [
          'Opens with initialize — protocol version and capability negotiation',
          'Methods you will actually see: tools/list, tools/call, resources/read, prompts/get',
          'Every response carries the id of the request it answers',
          'STDIO = local subprocess over stdin/stdout (this week) · Streamable HTTP = Week 6',
        ],
        code: {
          kind: 'review',
          label: 'What actually crosses the wire — read it together',
          code: '// 1. the connection opens with a handshake\n{"jsonrpc": "2.0", "id": 1, "method": "initialize",\n "params": {"protocolVersion": "...", "capabilities": {}, "clientInfo": {"name": "inspector"}}}\n\n// 2. the client asks what this server exposes\n{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}\n\n// 3. the model picked one, so the client calls it\n{"jsonrpc": "2.0", "id": 3, "method": "tools/call",\n "params": {"name": "search_docs", "arguments": {"query": "reset password", "limit": 5}}}\n\n// the server replies with structured content, carrying the SAME id',
          expectedResult: 'Point at three things: method, params.arguments, and the id that ties a response back to its request.',
        },
        diagram: `flowchart LR
  C["🔗 Client"] -->|"initialize"| S["🗄️ Server"]
  C -->|"tools/list"| S
  C -->|"tools/call"| S
  S -->|"result + same id"| C`,
        script: 'Show the raw messages and point at the id. Then say the sentence that pays off in ten minutes: "the inspector you are about to open is nothing more than a friendly window onto exactly these lines." That reframes the inspector from a mystery tool into a message log they already understand.',
      },

      /* ============= deconstruct · the server that is modelled wrong ======= */
      {
        segment: 'deconstruct', eyebrow: '🔎 Broken by design', title: 'A server that exposes the refund policy as a tool',
        body: 'Here is a real anti-pattern, and it is the most common one in the wild. The author has a read-only company refund policy the assistant keeps needing, so they expose it as a tool called get_policy that returns the whole document. It works in the demo. It is also modelled wrong: read-only context has been dressed up as an action. Read the code and notice what is missing — there is no verb, nothing changes, no work is done, and calling it twice produces exactly the same result. Now watch what that miscategorisation costs the moment a real client tries to use it correctly.',
        bullets: [
          'Nothing changes as a result of the call — it is pure data',
          'Yet it is a tool, so only the MODEL can decide to fetch it',
          'The host cannot preload it the way it would preload a resource',
          'It passes the demo, which is exactly why it survives to production',
        ],
        code: {
          kind: 'review',
          label: 'The mismodelled server — read it and find the smell',
          code: '# ANTI-PATTERN: read-only context dressed up as an action\nPOLICY = open("refund_policy.md").read()\n\n@mcp.tool()\ndef get_policy() -> str:\n    """Return the full company refund policy."""\n    return POLICY   # nothing changed. no work was done. this is data.',
          expectedResult: 'Somebody in the room says "that is just data." That is the whole slide — hold that thought for the next one.',
        },
        diagram: `flowchart LR
  P[("📄 Refund policy<br/>read-only")] --> T["🔧 Exposed as<br/>a TOOL"]
  T --> M["🧠 Only the model<br/>can decide to fetch it"]
  M -.->|"or not"| SKIP["🤷 It may simply<br/>never be loaded"]`,
        script: 'Read the code aloud and ask the room to spot the smell before you name it. Wait. Somebody always says "there is no action in there." Confirm it and hold — do not explain the consequences yet, because the next slide is far more persuasive if they arrive at it slightly frustrated.',
      },
      {
        segment: 'deconstruct', eyebrow: '💥 What it costs', title: 'A control-model mismatch is not a style opinion — it changes who is allowed to load the data',
        body: 'Because get_policy is a tool, it is model-controlled, so the policy only enters context if the model happens to decide to call it. That is unreliable, and every fetch burns a tool round trip for data that could have simply been attached. The application — the one component that actually knows this policy is always relevant — has been stripped of the ability to load it. So the assistant sometimes cites the policy, sometimes answers from memory, and sometimes calls it three times in one turn. The symptom looks like model flakiness. The cause is that the primitive choice took control away from the wrong component.',
        bullets: [
          'Model-controlled means it loads only if the model elects to — unreliable by construction',
          'Every fetch is a wasted round trip for data that could have been preloaded',
          'The app cannot attach it as context; the user cannot pin it',
          'Symptom: inconsistent answers that sometimes ignore the policy entirely',
          'Diagnosis: ask "who SHOULD control this load?" and the bug becomes obvious',
        ],
        diagram: `flowchart TD
  W["❌ Modelled as a tool"] --> S1["🎲 Loads only when<br/>the model chooses"]
  W --> S2["🔁 A round trip<br/>for static data"]
  W --> S3["🚫 The app cannot<br/>attach it"]
  S1 --> OUT["😖 Answers that<br/>ignore the policy"]
  S3 --> OUT`,
        script: 'Tie each symptom back to the control axis from the architecture segment — this is the payoff of that table. Say the diagnostic question out loud and write it on the board: "who should control this load?" That single question resolves most primitive-choice arguments in about four seconds.',
      },
      {
        segment: 'deconstruct', eyebrow: '✅ The fix', title: 'Same file, same data, correct primitive — a resource with a URI and a MIME type',
        body: 'The document is read-only context, so it is a resource. Expose it at a stable URI with the right MIME type and the situation inverts: the application can load it deterministically every time, the user can reference it, and not a single tool round trip is spent. The code barely changes. What changes is who is allowed to initiate the load, and that is the difference between an assistant that reliably follows policy and one that occasionally does. One line of judgment prevents this entire class of bug.',
        bullets: [
          'Read-only ⇒ a resource at a stable URI, with a declared MIME type',
          'The app loads it deterministically; zero wasted tool calls',
          'The decorator changed. The judgment behind it is the actual skill.',
          'Say it once more: reads = resource · does = tool · a person triggers it = prompt',
        ],
        code: {
          kind: 'review',
          label: 'Corrected — the same data, as a resource',
          code: '# CORRECT: read-only context is a resource, at a URI, with a MIME type\n@mcp.resource("docs://refund-policy", mime_type="text/markdown")\ndef refund_policy() -> str:\n    """The company refund policy, loadable as context by the host application."""\n    return open("refund_policy.md").read()',
          expectedResult: 'Two differences from the anti-pattern: the decorator, and the URI plus MIME type that make it addressable and renderable.',
        },
        diagram: `flowchart LR
  P[("📄 Refund policy")] --> R["📚 Resource<br/>docs://refund-policy"]
  R --> MT["🏷️ text/markdown"]
  R --> APP["🖥️ The app loads it<br/>every time, on purpose"]`,
        script: 'Put the anti-pattern and the fix side by side and note how small the diff is — that is the point. The skill is not typing the decorator, it is knowing which decorator. Then transition: "now let us build a correct one from nothing."',
      },

      /* ================== micro-build · your first server ================== */
      {
        segment: 'micro-build', eyebrow: '🧰 Toolchain first', title: 'Three version checks before anybody writes a line',
        body: 'Two minutes here saves twenty later, so we do it as a room. You need Python 3.10 or newer, the uv package manager for a clean reproducible environment, and Node — because the MCP inspector runs on it. These are terminal commands, not a Claude Code prompt, and that distinction matters all week: Claude Code writes your server, but you run the toolchain. If any of the three comes back red, fix it now with a mentor rather than discovering it mid-build on Thursday.',
        bullets: [
          'Python 3.10+ — the MCP Python SDK needs it',
          'uv — an isolated, reproducible project environment in one command',
          'Node — the inspector is a Node application, so no Node means no inspector',
          'Red on any of the three? A mentor, now, not at the break',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — verify the three things you need tonight',
          code: '# all three must print a version, not an error\npython --version    # need 3.10 or newer\nnode --version      # the MCP inspector runs on Node\nuv --version        # if this one fails, install uv below\n\n# install uv only if the check above failed\n# macOS / Linux:\ncurl -LsSf https://astral.sh/uv/install.sh | sh\n# Windows PowerShell:\npowershell -c "irm https://astral.sh/uv/install.ps1 | iex"',
          expectedResult: 'Three version numbers printed back. Anything that says "command not found" is a red light.',
          stopCondition: 'Every person in the room has three green version numbers. This blocks everything after it.',
          rescue: 'Just installed uv and the shell still cannot find it? Close the terminal and open a new one — the PATH change only applies to new sessions.',
        },
        diagram: `flowchart LR
  PY["🐍 Python 3.10+"] --> GO["✅ Ready to scaffold"]
  UV["📦 uv"] --> GO
  ND["🟢 Node<br/>for the inspector"] --> GO`,
        script: 'Run all three on screen yourself first, slowly, then stop talking and let the room work. Watch the pulse rail and read the red count out loud. Do not start the scaffold with anyone stuck on a version check — that is how a micro-build turns into a support queue.',
      },
      {
        segment: 'micro-build', eyebrow: '🛠️ Direct it', title: 'You do not type the server. You tell Claude Code exactly what must exist.',
        body: 'Same job as every week since Week 1, pointed at a new target. You are not going to memorise the SDK — you are going to specify what the server must be, let Claude Code write it, and then read what came back and decide whether it is right. Notice what the prompt insists on: a named server, one tool with real input constraints, a docstring written for the model rather than for a human, and STDIO transport. Those four requirements are the entire quality bar for a first server.',
        bullets: [
          'Plan Mode first — read the proposal before any file exists',
          'The server name is how every client will identify it: choose it deliberately',
          'Ask for input constraints explicitly — that is the boundary you will break on Thursday',
          'Then READ the file. Reading it is the skill; typing it never was.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — scaffold a first MCP server',
          code: 'I am building my first MCP server in this project, using the official MCP Python SDK.\n\nIn Plan Mode, propose the following, then wait for my approval before creating anything:\n\n1. A uv-managed project folder with the SDK added as a dependency (the "mcp" package with its CLI extra, so the inspector helper is available).\n2. A server.py containing a FastMCP server instance named "support-kb", running over the STDIO transport when the file is executed directly.\n3. ONE tool called search_docs that takes a query string and an optional result limit, searches a small in-memory list of knowledge-base articles, and returns structured rows rather than prose.\n4. Input constraints on both arguments: the query must be non-empty and bounded in length, the limit must be a small positive integer. Tell me exactly where in the file those constraints live.\n5. A docstring on the tool written as an instruction to the model about WHEN to call it, not as a note to a human developer.\n\nShow me the plan and the proposed file contents. Do not create anything yet.',
          expectedResult: 'A plan with a named server, one constrained tool, and a docstring that reads like an instruction to a model.',
          stopCondition: 'You have read the proposed tool docstring out loud and it says when to use the tool, not just what it does.',
          rescue: 'If the plan skips the input constraints, say so specifically: "add the input constraints and show me the line they live on." Do not approve a boundary-free tool.',
        },
        diagram: `flowchart LR
  P["⌨️ Your prompt —<br/>what must exist"] --> CC["💻 Claude Code<br/>Plan Mode"]
  CC --> PL["📋 A plan you read"]
  PL --> A["✅ You approve"]
  A --> F["📄 server.py"]`,
        script: 'Paste it on screen and narrate the requirements while Claude Code works — especially requirement 5. Then do the thing the whole program is about: read the proposal out loud and reject something in it. Rejecting one small thing in front of the room teaches more than approving perfectly.',
      },
      {
        segment: 'micro-build', eyebrow: '🔬 The inspector', title: 'Your debugging surface for the entire week — open it before you write a client',
        body: 'The MCP inspector is a browser tool that connects directly to your server and lets you list and invoke tools, read resources, and render prompts by hand, with no client code in the picture at all. The SDK launches it for you. What you get is the left panel showing everything your server actually advertises, a form for arguments, and — this is the part people undervalue — the raw JSON-RPC request and response for every call. When something does not work this week, the inspector will tell you within seconds whether the problem is your server or your client. Prove it works here first. Always.',
        bullets: [
          'Launches your server AND opens the inspector wired to it',
          'Left panel: exactly what your server advertises — tools, resources, prompts',
          'Fill in arguments and call a tool with zero client code written',
          'You see the actual request and response, not a summary of them',
          'The rule for this week: inspector-green before any client code exists',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — launch the inspector against your server',
          code: '# from inside your server project folder\nuv run mcp dev server.py\n\n# no SDK CLI available? the inspector also runs standalone:\nnpx @modelcontextprotocol/inspector uv run server.py\n\n# it prints a local URL — open that in your browser',
          expectedResult: 'A browser tab opens, the connection status reads connected, and search_docs is listed under Tools.',
          stopCondition: 'You can see your own tool name in the inspector. Nothing else tonight matters more than this.',
          rescue: 'Connected but the Tools tab is empty? Nine times out of ten the file changed after the server started — stop it, relaunch, and look again.',
        },
        diagram: `flowchart LR
  T["⌨️ uv run mcp dev<br/>server.py"] --> S["🗄️ Your server<br/>starts on STDIO"]
  T --> I["🔬 Inspector opens<br/>in the browser"]
  I --> L["📋 Tools · Resources<br/>· Prompts"]
  I --> W["📨 Raw JSON-RPC<br/>request + response"]`,
        script: 'Run it live and walk every panel deliberately. This slide removes fear more than any other in the week: they can always see exactly what their server is exposing. State the rule for Thursday explicitly — inspector-green between every checkpoint, no exceptions.',
      },
      {
        segment: 'micro-build', eyebrow: '▶️ Call it', title: 'Invoke your own tool and watch a complete MCP round trip',
        body: 'Open the Tools tab, select search_docs, type a query, and run it. You get back the structured result your function returned, wrapped in the protocol’s content envelope, alongside the exact JSON-RPC that crossed the wire in both directions. That round trip — the client calls tools/call, the server executes, structured content returns — is the atom of everything we build for the rest of this intensive. You have now seen a complete MCP interaction end to end, and you have not written a single line of client code.',
        bullets: [
          'Tools tab → search_docs → fill in the arguments → Run',
          'The response is your own return value inside the MCP content envelope',
          'Now try a query that matches nothing and read what comes back',
          'Then try an empty query and watch the boundary refuse it — that is the schema working',
        ],
        diagram: `flowchart LR
  U["🙋 You, in the<br/>inspector"] --> R["📨 tools/call<br/>search_docs"]
  R --> S["🗄️ Your server<br/>runs the function"]
  S --> C["📦 Structured content<br/>back, same id"]
  C --> U`,
        script: 'Do the call live and let them read real structured JSON coming back from code they directed into existence ten minutes ago. Then deliberately send an empty query so the room sees the schema refuse it — that thirty seconds sells Thursday’s hardening segment before you have to argue for it.',
      },
      {
        segment: 'micro-build', eyebrow: '🎯 Your own project', title: 'Now point it at your build plan — what does YOUR capstone actually need to reach?',
        body: 'The support knowledge base was a warm-up. Open your own build plan and find the place where your project needs something it cannot currently see: a lookup into your own data, a record it has to fetch, a document it keeps needing, an action it has to take in another system. That is what your server exposes on Thursday. Use the prompt below to have Claude Code draft the primitive map for it — and then argue with the draft, because deciding tool versus resource versus prompt is the judgment this whole week is teaching.',
        bullets: [
          'Open your build plan and find the reach it is missing',
          'One capability is enough — a second one is a Week 6 problem',
          'Draft the primitive map now, argue with it, and bring it Thursday',
          'Thursday you build exactly this, not a demo somebody else designed',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — map YOUR capability to the three primitives',
          code: 'Read my project build plan in this repository.\n\nIdentify the places where my project needs information or actions it cannot currently reach on its own. For the single most valuable one, propose an MCP surface as a table with one row per capability and these columns: name, primitive (tool / resource / prompt), who controls the invocation (model / application / user), and a one-sentence justification tied to that control model.\n\nRules for your proposal:\n- Anything read-only must be a resource with a URI and a MIME type, never a tool.\n- Anything that changes state or does work must be a tool, with its input constraints named explicitly.\n- Any repeatable workflow a human would trigger by name must be a prompt.\n- If you are unsure which primitive something is, say so and ask me rather than guessing.\n\nDo not write any code yet. I want to argue with the table first.',
          expectedResult: 'A short table naming YOUR capability, its primitive, and who controls it — with at least one row you disagree with.',
          stopCondition: 'You can say out loud, in one sentence, what your Thursday server will expose and why it is that primitive.',
        },
        diagram: `flowchart LR
  BP["📋 Your build plan"] --> GAP["🕳️ The reach<br/>it is missing"]
  GAP --> MAP["🗺️ Primitive map<br/>tool · resource · prompt"]
  MAP --> TH["🔨 Thursday:<br/>you build it"]`,
        script: 'Have every student produce the table before the class ends and call on three of them to read their one-sentence answer out loud. Close the open loop for Thursday: "you already know what you are building — Thursday is just the doing." Then trailer Week 6 in one line: this same server, on call, wired to a real system.',
      },
    ],

    storyBeats: {
      checkin: [
        {
          icon: '🖇️', tone: 'amber', eyebrow: 'Change of pace — a true story from Week 3',
          title: 'Marcus built a brilliant assistant, and then hired himself to feed it',
          body: 'Marcus finished Week 3 with a genuinely good triage assistant. It classified beautifully, drafted replies that sounded like him, and cost about four dollars a month to run. And every single morning at 7:40 he opened the ticketing system, exported a CSV, opened his terminal, and pasted it in. He did that for eleven working days before he said the quiet part out loud in office hours: the assistant was not automating his job. It was giving him a new one.',
          punch: 'He did not build an assistant. He built a job for himself, and then showed up to it every morning.',
        },
      ],
      'business-problem': [
        {
          icon: '🧵', tone: 'berry', eyebrow: 'Change of pace — the same work, four times',
          title: 'Four teams at one insurer each wrote a connector to the same claims system',
          body: 'The fraud team built one. The underwriting team built one, because the fraud team’s lived inside an application they could not import. Customer care built a third with slightly different retry logic. When the claims API changed a date format, three of the four broke and one did not, and it took nine days to find out why — because nobody had a list of who was calling the system. The fifth team, when they asked, were told to write their own.',
          punch: 'Nobody chose to do the work four times. They just had no way to do it once.',
        },
      ],
      architecture: [
        {
          icon: '🏗️', tone: 'violet', eyebrow: 'Change of pace — the day ownership moved',
          title: 'The security review that used to happen four times a year now happens once',
          body: 'A platform lead at a mid-size bank had spent two years saying no to AI projects, and she was right to. Every proposal came with a fresh copy of the credentials, a fresh error-handling story, and a fresh audit gap. Then her team shipped one MCP server in front of the core system — their auth, their rate limits, their audit log, their version. The next four AI projects did not ask her for credentials at all. They asked for a client connection.',
          punch: 'She did not become more permissive. She got a place to put the permission.',
        },
      ],
      deconstruct: [
        {
          icon: '💸', tone: 'cherry', eyebrow: 'The Tuesday nobody could explain',
          title: 'The assistant quoted the refund policy on Wednesday and ignored it on Tuesday',
          body: 'A support team shipped an assistant that knew the refund rules — usually. On Wednesday it cited the ninety-day window correctly. On Tuesday it had approved a refund on a fourteen-month-old order and nobody could say why. The engineer spent a day and a half suspecting the model, the prompt, and the temperature. The actual cause was that the policy was a tool, so it loaded only when the model happened to decide it was relevant, and on Tuesday it did not.',
          punch: 'It was never a model problem. It was a question about who is allowed to load the document, answered wrong.',
        },
      ],
      'micro-build': [
        {
          icon: '🔬', tone: 'leaf', eyebrow: 'Before you build — two hours you can skip',
          title: 'The tool that never fired, and the tab that would have said so in nine seconds',
          body: 'A student last cohort spent two hours convinced their server was broken. They rewrote the function twice, restarted everything four times, and started questioning whether they were suited to this. When a mentor finally sat down, the first thing she did was open the inspector, look at the Tools panel, and see that the server was advertising nothing at all — the file had changed after the server started. Nine seconds, one panel.',
          punch: 'You will not out-think a bug you cannot see. Open the window before you start guessing.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'cold-open', kind: 'poll',
        q: 'Right now, how does your AI actually get the data it needs?',
        options: [
          'I paste it in by hand',
          'A script I wrote feeds it',
          'It calls a tool I built in Week 3',
          'It genuinely cannot get it at all',
        ],
        eyebrow: '🚪 Cold open', title: 'Before we start — who is the integration?',
        presenterTip: 'Read the counts out loud without judgement. Most rooms are heavily "by hand," which is exactly the opening you want. Say: "so the answer, for most of us, is that YOU are the integration." Do not reveal anything — the whole class is the reveal.',
      },
      {
        segment: 'checkin', kind: 'poll',
        q: 'Toolchain check on the machine you are actually sitting at tonight.',
        options: [
          '✅ Python 3.10+, uv and Node all present',
          '🐍 Python is missing or too old',
          '📦 No uv yet',
          '❓ I do not know how to check',
        ],
        eyebrow: '🚦 Roll call', title: 'Can you build a server tonight, or not yet?',
        presenterTip: 'Purely operational. Read the non-green count out loud and send mentors to those students immediately, while the business-problem segment runs. Do not hold the room — the fix and the teaching can happen in parallel here.',
      },
      {
        segment: 'business-problem', kind: 'trivia',
        q: 'Six AI applications, five systems to connect, no shared protocol. How many bespoke connectors does that organisation end up maintaining?',
        options: ['11', '30', '6', '5'],
        answer: 1,
        reveal: 'M×N = 30, each drifting on its own schedule. With a shared protocol it is M+N = 11 — and each one is written, reviewed, and fixed exactly once.',
        eyebrow: '🧮 The arithmetic', title: 'Count it before we name the fix',
        presenterTip: 'Let them do the multiplication in their heads and take answers before revealing. The gap between 30 and 11 is the entire commercial argument for MCP, and it lands far harder as their own arithmetic than as your assertion.',
      },
      {
        segment: 'architecture', kind: 'poll',
        theater: true,
        q: 'You are exposing your CRM to Claude. Exactly ONE of these should be a tool. Which one?',
        options: [
          'The list of account records, read-only',
          'Create a follow-up task on an account',
          'The standard renewal-email template',
          'The written escalation policy document',
        ],
        answer: 1,
        reveal: 'Only "create a follow-up task" does work and changes something — that is a tool. The account list and the escalation policy are read-only context, so they are resources. The renewal-email template is a workflow a human triggers by name, so it is a prompt. One question, all three primitives.',
        eyebrow: '🏛️ Design decision', title: 'Three primitives, one question',
        presenterTip: 'This is the one full-theater moment of the night — stop the class, lock the votes, show the live count before revealing. Then walk all four options and name the primitive for each; the three wrong answers teach more than the right one does.',
      },
      {
        segment: 'architecture', kind: 'trivia',
        q: 'Your server advertises a tool correctly, the inspector lists it, but the model never chooses to call it. What do you fix FIRST?',
        options: [
          'The transport',
          'The tool description',
          'The model you are using',
          'The return type of the function',
        ],
        answer: 1,
        reveal: 'The description is the routing logic — it is the model’s only guide to when this tool applies. A tool that never fires almost always has a description that says what it does instead of when to use it.',
        eyebrow: '🩺 Diagnostic', title: 'The tool that never fires',
        presenterTip: 'Take answers before the reveal; "the model" is a popular wrong answer and it is worth naming why. Same lesson as Week 2 Skill descriptions, so call that callback out loud — repeated principles are what make the weeks feel like one story.',
      },
      {
        segment: 'deconstruct', kind: 'poll',
        q: 'Be honest — before tonight, how would you have exposed a read-only policy document to an assistant?',
        options: [
          'As a tool that returns it',
          'As a resource',
          'Pasted into the system prompt',
          'I had never thought about it',
        ],
        eyebrow: '🪞 Honest self-check', title: 'No right answer — where were you an hour ago?',
        presenterTip: 'No reveal. The point is for the room to see that most of them would have picked option 1 or 3, which normalises the anti-pattern as a reasonable mistake rather than a stupid one. Say out loud that this is the single most common MCP bug in production, made by competent engineers.',
      },
      {
        segment: 'micro-build', kind: 'trivia',
        q: 'The inspector says connected, but the Tools tab is completely empty. Most likely cause?',
        options: [
          'You edited server.py after the server started',
          'Node is out of date',
          'The transport is wrong',
          'Your API key is not set',
        ],
        answer: 0,
        reveal: 'A running server advertises the file as it was when it booted. Edit, stop, relaunch, look again — that loop will resolve most of what goes wrong this week.',
        eyebrow: '🩺 Diagnostic', title: 'Connected, but empty',
        presenterTip: 'This is the single most common inspector complaint you will hear on Thursday, so plant it here. Note that option 4 is a deliberate trap — an MCP server does not need an Anthropic API key at all, and if that confusion is in the room it is better surfaced now than mid-build.',
      },
      {
        segment: 'trailer', kind: 'poll',
        q: 'Which capability from YOUR build plan will your server expose on Thursday?',
        options: [
          'A lookup into my own data',
          'An action that writes or changes something',
          'A document my assistant keeps needing',
          'I still need help choosing',
        ],
        eyebrow: '🎯 Commit to it', title: 'Name it now, build it Thursday',
        presenterTip: 'Read the "need help choosing" count and get those students a mentor before they leave the room tonight — arriving Thursday without a chosen capability costs them the first thirty minutes. Ask two students who picked options 1 or 2 to say theirs out loud; specific answers give the undecided ones a template.',
      },
    ],
  },

  /* ====================================================================== */
  /*  THURSDAY — Build Day                                                  */
  /* ====================================================================== */
  thursday: {
    beforeAfter: {
      label: 'Monday → Thursday',
      before: [
        'Claude only sees what you paste in',
        'A tool schema buried inside one application',
        'Read-only data faked as an action',
        'Debugging by print statement and hope',
        'A capability only you can run',
      ],
      after: [
        'Claude reaches a real system on its own',
        'Tools, resources and prompts on a server',
        'The right primitive, with a declared MIME type',
        'Every JSON-RPC message visible in the inspector',
        'A capability any MCP client can use, unchanged',
      ],
    },

    teach: [
      /* ============================ build map ============================= */
      {
        segment: 'build-map', eyebrow: '🗺️ Tonight', title: 'You ship an MCP server exposing one real capability from YOUR project',
        body: 'Monday you learned the architecture and scaffolded a warm-up server. Tonight you build the real one, and it does not expose a demo knowledge base — it exposes the capability you named out loud on Monday, from your own build plan. Four checkpoints, each one proven in the inspector before we advance. By the end you will have all three primitives live, a client of your own calling them, and the server registered with a real host so a human can use it in conversation.',
        bullets: [
          'CP0 a server that starts → CP1 a validated tool → CP2 a resource + a prompt → CP3 a client calls it',
          'It exposes YOUR capability, not a sample one',
          'Inspector-green between every checkpoint — that is the gate, not a suggestion',
          'Then we break it on purpose and harden it, exactly like Week 3',
        ],
        diagram: `flowchart LR
  CP0["0️⃣ It starts"] --> CP1["1️⃣ A validated tool"]
  CP1 --> CP2["2️⃣ Resource<br/>+ prompt"]
  CP2 --> CP3["3️⃣ A client<br/>calls it"]
  CP3 --> BH["💥 Break,<br/>then harden"]`,
        script: 'Show a finished server in the inspector first — the cold open — with all three primitive tabs populated. Then say the sentence that sets the night: "the difference between tonight and a tutorial is that this one connects to something you actually care about." Have two students name their capability out loud before you move.',
      },
      {
        segment: 'build-map', eyebrow: '🧰 Readiness', title: 'Four green lights before anybody types',
        body: 'Four things have to be true or you will lose the first half hour to setup instead of building. Your toolchain from Monday, the folder you scaffolded in, Claude Code open in it, and — the one people forget — the capability you chose, written down in one sentence. That sentence is the specification for everything that follows tonight, and a vague version of it produces a vague server. If any light is red, fix it in the next three minutes with a mentor.',
        bullets: [
          '1️⃣ python, uv and node all print a version in THIS terminal',
          '2️⃣ Monday’s project folder, with server.py in it',
          '3️⃣ Claude Code open in that folder',
          '4️⃣ Your capability, written down as one sentence — not just in your head',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — the thirty-second readiness check',
          code: '# run these from inside your project folder\npython --version\nuv --version\nnode --version\n\n# and confirm Monday is still there\nls server.py\n\n# quick smoke test: does the server still start and the inspector still open?\nuv run mcp dev server.py',
          expectedResult: 'Three versions, server.py listed, and the inspector opening with your Monday tool still visible.',
          stopCondition: 'The inspector shows your server connected. That is the only green light that matters.',
          rescue: 'Lost Monday’s folder? Do not rebuild it by hand — re-run Monday’s scaffold prompt in Claude Code and you will be back in two minutes.',
        },
        diagram: `flowchart LR
  TC["🧰 Toolchain green"] --> GO["✅ Ready to build"]
  FD["📁 Monday's folder"] --> GO
  CC["💻 Claude Code open"] --> GO
  CAP["✍️ Your capability,<br/>one sentence"] --> GO`,
        script: 'Run it as a literal four-point roll call on the pulse rail and read the numbers out loud. Push hardest on point four — ask someone who claims they are green to read their sentence, and if it is vague, fix it in front of the room. That is a thirty-second intervention that saves their whole build.',
      },
      {
        segment: 'build-map', eyebrow: '📐 Decide before you type', title: 'Every capability gets classified on paper first — tool, resource, or prompt',
        body: 'The single biggest predictor of whether tonight goes well is whether you decided the primitives before you started writing. Monday you drafted a primitive map for your capability. Now finalise it, because once a thing has been built as a tool, rebuilding it as a resource feels like wasted work and people ship the wrong shape rather than redo it. Ask the control question for every row: who should decide to invoke this — the model, the application, or the person? The answer picks the primitive for you.',
        bullets: [
          'Every row gets the control question: model, app, or human?',
          'Model decides → tool. App decides → resource. Human decides → prompt.',
          'Aim for one tool, one resource, one prompt — enough to prove all three',
          'Write it down. A map you argued with beats a map you accepted.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — finalise your primitive map',
          code: 'Here is the capability my MCP server will expose tonight, in one sentence: [WRITE YOURS HERE].\n\nIn Plan Mode, produce a final surface design as a table with one row per thing my server will expose, and these columns: name, primitive (tool / resource / prompt), who initiates the invocation (model / application / user), and the one-sentence justification tied to that control model.\n\nConstraints:\n- Exactly one tool, one resource, and one prompt. If my capability genuinely needs more, say so and explain why rather than padding the table.\n- Anything read-only must be a resource with a URI and a MIME type, never a tool.\n- The tool must name its input constraints explicitly in the table.\n- Flag anything you had to guess about my capability and ask me rather than inventing it.\n\nDo not write any code yet.',
          expectedResult: 'A three-row table you can defend, with the control model stated for each row.',
          stopCondition: 'You can point at any row and say who initiates it without looking at the table.',
          rescue: 'If Claude Code proposes four tools and no resource, that is the anti-pattern from Monday. Say so directly: "which of these is read-only? Make it a resource."',
        },
        diagram: `flowchart TD
  Q{"🤔 Who decides<br/>to invoke it?"} -->|"the model"| T["🔧 Tool"]
  Q -->|"the app"| R["📚 Resource"]
  Q -->|"the person"| P["💬 Prompt"]`,
        script: 'Put the decision diamond on screen and make the room answer it out loud for one student’s capability before anyone touches Claude Code. Ninety seconds of classification here prevents the most expensive rework of the night, which is discovering at CP2 that your tool should have been a resource.',
      },

      /* ============================ guided build ========================== */
      {
        segment: 'guided-build', eyebrow: '0️⃣ CP0 · Scaffold', title: 'A server that starts, named for what it actually does',
        body: 'Checkpoint zero is a server that boots cleanly and does nothing else. That sounds trivial and it is not — a server that will not start hides every later bug behind an import error, and half the "my tool is broken" reports this week are actually "my server never came up." Name it for the capability, not for the class: every client will show that name to a human, and support-kb tells somebody more than mcp-server-1 ever will.',
        bullets: [
          'The server name is user-facing — name it for the capability',
          'STDIO transport: the host launches your file as a subprocess',
          'It should start, sit quietly, and exit cleanly on Ctrl+C',
          'Do not add capabilities until a bare server boots without error',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          ccMode: 'Plan Mode',
          label: 'Claude Code prompt — CP0, the scaffold',
          code: 'Set up the MCP server for the capability I described, in this project.\n\n1. Use uv to manage the project and add the official MCP Python SDK with its CLI extra, so the inspector helper command is available.\n2. Create server.py with a FastMCP server instance named for my capability (use a short, human-readable name — clients display it to people).\n3. Run over the STDIO transport when the file is executed directly.\n4. Nothing else. No tools, no resources, no prompts yet. I want a bare server that starts.\n5. Add a two-line comment at the top of server.py saying what this server exposes and who owns it.\n\nShow me the file, then tell me the exact command to start it.',
          expectedResult: 'A short server.py and a start command. Running it produces no output and no error — it is waiting on STDIO.',
          stopCondition: 'The server starts with no traceback. That is CP0, and nothing advances until you have it.',
          rescue: 'ModuleNotFoundError on the mcp import? You are almost certainly running system Python instead of the uv environment — prefix the command with "uv run".',
        },
        diagram: `flowchart LR
  UV["📦 uv project<br/>+ MCP SDK"] --> SRV["📄 server.py"]
  SRV --> N["🏷️ Named for<br/>your capability"]
  SRV --> ST["🔌 STDIO transport"]
  ST --> BOOT["✅ It starts,<br/>quietly"]`,
        script: 'Do it live and let the room watch a server start and produce absolutely nothing. Say out loud that silence is success here — it is waiting on stdin. Several people will think it hung; naming that in advance saves five hands going up.',
      },
      {
        segment: 'guided-build', eyebrow: '👀 Read it together', title: 'Six lines — and the two that decide how every client sees your server',
        body: 'Before we add anything, look at what came back. There is very little here, which is the point: FastMCP is doing the protocol work so you can spend your attention on design instead of plumbing. Two lines matter. The server name is what every client displays to a human. The transport line is the decision about who can reach this server — STDIO means a local subprocess, one host, one machine, which is exactly right tonight and exactly wrong in Week 6.',
        bullets: [
          'The name is user-facing — it shows up in Claude Code and Claude Desktop',
          'The transport line is a reach decision, and it is the only line Week 6 changes',
          'Everything else this week is decorating functions onto this object',
          'Yours will differ in wording. Those two properties must be there.',
        ],
        code: {
          kind: 'review',
          label: 'server.py — read it, do not paste it',
          code: '# Exposes the support knowledge base over MCP. Owned by: support-ops.\nfrom mcp.server.fastmcp import FastMCP\n\n# This name is what every client shows to a human. Choose it deliberately.\nmcp = FastMCP("support-kb")\n\nif __name__ == "__main__":\n    # STDIO: the host launches this file as a subprocess and talks over\n    # stdin/stdout. Local, single-user. Week 6 swaps this line for HTTP.\n    mcp.run(transport="stdio")',
          expectedResult: 'Put a finger on two lines: the server name, and the transport in mcp.run().',
        },
        diagram: `flowchart LR
  F["📄 server.py"] --> A["🏷️ FastMCP name<br/>what humans see"]
  F --> B["🔌 transport=stdio<br/>who can reach it"]
  F --> C["🧩 Everything else<br/>decorates this object"]`,
        script: 'Open the REAL file Claude Code just wrote on your screen, not this slide — the slide is your safety net if the generated file drifted. Two fingers, two lines, then move. Do not line-by-line the whole file or you will lose the segment.',
      },
      {
        segment: 'guided-build', eyebrow: '1️⃣ CP1 · The tool', title: 'One tool that reaches something real — with the boundary built in from the first line',
        body: 'Now the server stops being empty. Add the one tool from your primitive map, and implement it for real — reading your data file, querying your list, calling the function you already have. A stub teaches you nothing tonight. Two things carry all the weight: the docstring, which is the model’s entire guide to when this tool applies, and the input constraints, which reject malformed calls at the protocol boundary before your code ever runs. We put the constraints in now, not after the incident, for exactly the reason we capped the loop in Week 3.',
        bullets: [
          'Implement it against real data — a stub proves nothing',
          'The docstring says WHEN to use it, not just what it does',
          'Constrain the inputs: non-empty, bounded, typed — that is the boundary',
          'Return structured rows the model can cite, never a wall of prose',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — CP1, the tool',
          code: 'Add ONE tool to server.py, implementing the tool row from my primitive map.\n\nRequirements:\n1. Implement it for real against my actual data or an existing function in this project. If neither exists yet, create a small realistic data file alongside the server and read from that — but tell me you did so.\n2. Constrain every input: strings must have a minimum and maximum length, numbers must have a sensible range, and every argument must be typed so the SDK can generate a proper input schema.\n3. Write the docstring as an instruction to the model about WHEN this tool should be used, in the words a person would actually use. Show me the docstring on its own before you write the body.\n4. Return structured data the model can cite — a list or dict with named fields, never a formatted paragraph.\n5. If the tool finds nothing, return a structured empty result with a message. Do not raise an exception for a normal miss.\n\nThen tell me the exact command to relaunch the inspector.',
          expectedResult: 'A tool whose docstring names a trigger, whose arguments are constrained, and whose return value has named fields.',
          stopCondition: 'You can read the docstring aloud and it tells a model when to reach for this tool.',
          rescue: 'Claude Code wrote a tool with bare untyped arguments? Say exactly that: "add type annotations and length or range constraints to every argument, and show me the generated input schema."',
        },
        diagram: `flowchart LR
  MAP["🗺️ Your tool row"] --> TL["🔧 The tool"]
  DS["📝 Docstring<br/>= when to use it"] --> TL
  IC["📐 Input constraints<br/>= the boundary"] --> TL
  TL --> DATA[("🗄️ Your real data")]`,
        script: 'Stop on the docstring and compare a vague one to a precise one on screen — same lesson as Week 2 Skills, landing faster because they have met it twice. Then point at the constraints and say plainly: "this is the line we delete on purpose in forty minutes, so look at it now."',
      },
      {
        segment: 'guided-build', eyebrow: '🔬 CP1 gate', title: 'Prove it in the inspector before you build anything on top of it',
        body: 'This is the gate, and we hold it. Relaunch the inspector, open the Tools tab, and confirm three things: your tool is listed, its input schema shows the constraints you asked for, and calling it with a real argument returns your structured rows. Then deliberately call it with an empty string and watch the boundary refuse it. That refusal is not an error — it is the schema doing exactly what you built it to do, and seeing it now means you will recognise it later.',
        bullets: [
          'Tools tab: your tool is listed with the right name',
          'Its schema shows the constraints — not just a bare string type',
          'A real call returns structured rows you can read',
          'An empty call is REFUSED at the boundary. That is a pass, not a failure.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — relaunch and exercise the tool',
          code: '# stop the previous run first (Ctrl+C), then:\nuv run mcp dev server.py\n\n# in the browser:\n#   Tools tab  -> your tool is listed\n#   click it   -> the input schema shows your constraints\n#   run it     -> structured rows come back\n#   run it with an empty argument -> it is REFUSED. that is correct.',
          expectedResult: 'Structured rows for a good call, and a schema validation error for the empty one.',
          stopCondition: 'Both outcomes seen with your own eyes. Then tap "I finished" so we know who is through the gate.',
          rescue: 'Tool missing from the list? The server is running the file as it was when it booted — stop it, relaunch, look again.',
        },
        diagram: `flowchart LR
  I["🔬 Inspector"] --> L["📋 Tool is listed"]
  L --> SC["📐 Schema shows<br/>your constraints"]
  SC --> OK["✅ Good call →<br/>structured rows"]
  SC --> NO["🛑 Empty call →<br/>refused at the boundary"]`,
        script: 'Hold the gate honestly — read the pulse-rail count out loud and wait. The temptation is to keep moving for the people who are ahead; resist it, because a student who is behind at CP1 is lost for the rest of the night. Make the deliberate empty call yourself on screen so the refusal is normalised as a success.',
      },
      {
        segment: 'guided-build', eyebrow: '2️⃣ CP2a · The resource', title: 'Read-only context, at a URI, with a MIME type — the corrected pattern, in your own server',
        body: 'Now build the thing Monday’s deconstruct was about. Take the read-only row from your primitive map and expose it as a resource: a stable URI, a declared MIME type, and a handler that returns the bytes. If your data has many addressable items, use a resource template so one handler serves all of them by id in the URI. The MIME type is not decoration — it is the contract that tells the client whether to parse JSON, render markdown, or show an image, and a client that guesses wrong renders garbage.',
        bullets: [
          'A stable URI, chosen deliberately — clients and humans both read it',
          'A declared MIME type on every resource, no exceptions',
          'A resource template parameterises the URI so one handler serves many items',
          'Zero tool round trips spent: the application loads this deterministically',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — CP2a, the resource',
          code: 'Add the resource row from my primitive map to server.py.\n\n1. Expose it at a stable, readable URI using a scheme that describes the domain (for example docs://catalog or crm://accounts). Explain your URI choice in one line.\n2. Declare an explicit MIME type that matches what the handler actually returns — application/json for structured data, text/markdown for prose, and so on. Never leave it unset.\n3. If my data has many individually addressable items, ALSO add a resource template whose URI contains the item id, so one handler serves every item.\n4. The handlers must be read-only. If any of them mutates state, stop and tell me — that means it should have been a tool.\n5. Show me the URI and the MIME type for each resource before you write the bodies.\n\nThen tell me exactly what to click in the inspector to verify both.',
          expectedResult: 'One static resource and, where the data supports it, one templated resource — both with explicit MIME types.',
          stopCondition: 'You can read both resources in the inspector and the MIME types match what you declared.',
          rescue: 'If the resource handler ends up doing work or changing something, it is a tool wearing a resource costume. Tell Claude Code to move it and say why.',
        },
        diagram: `flowchart LR
  D[("📄 Your read-only<br/>data")] --> R["📚 Resource<br/>at a URI"]
  R --> MT["🏷️ MIME type<br/>= the contract"]
  D --> RT["🧩 Template URI<br/>one handler, many items"]
  RT --> MT`,
        script: 'Say the callback explicitly: "this is Monday’s refund-policy fix, except it is your data and you are the one deciding." Then open the Resources tab live and read one resource, pointing at the MIME type in the response. That is the moment the abstract contract becomes a visible field.',
      },
      {
        segment: 'guided-build', eyebrow: '3️⃣ CP2b · The prompt', title: 'Ship a workflow, not just a capability — and this is where Week 4 comes back',
        body: 'The third primitive is the one most tutorials skip and the one your organisation will value most. A prompt is a named, argument-taking template that a human invokes deliberately — it appears in the client as a slash command or a menu pick. That means a prompt is how you ship a repeatable workflow to people who will never read your code. And here is the payoff from last week: the tested, versioned prompts in the library you built in Week 4 do not have to live in a document anymore. The good ones can ship as server prompts that every client can invoke by name.',
        bullets: [
          'User-controlled: it surfaces as a slash command or menu action',
          'It takes arguments, so one template serves many situations',
          'It encapsulates a workflow — the same sequence, the same way, every time',
          'Week 4 callback: your best library prompt can ship here instead of in a doc',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — CP2b, the prompt primitive',
          code: 'Add the prompt row from my primitive map to server.py.\n\n1. It must take at least one argument so the same template serves multiple situations, and give every argument a clear name and a sensible default where one exists.\n2. The body should encode the workflow a person actually wants: which tool to call, which resource to read, what to produce, and what to do when nothing matches.\n3. If I have a tested prompt from my Week 4 prompt library that fits this workflow, use that wording as the basis rather than inventing new wording, and tell me which one you used.\n4. Return the expanded template as text. Add a comment noting that multi-turn workflows can return a list of typed messages instead, so I know the option exists.\n\nThen tell me how to render it in the inspector with arguments filled in.',
          expectedResult: 'A named prompt with arguments that expands into a workflow instruction referencing your own tool and resource.',
          stopCondition: 'You have rendered it in the inspector and read the expanded text — and it sounds like something you would actually want a colleague to run.',
        },
        diagram: `flowchart LR
  L["📚 Week 4<br/>prompt library"] --> PR["💬 Server prompt<br/>named + arguments"]
  PR --> SL["⌨️ Slash command<br/>in the client"]
  SL --> WF["🔁 Same workflow,<br/>every time, by anyone"]`,
        script: 'Frame prompts as shipping a workflow rather than a capability — that framing is what makes executives in the room sit up. Then land the Week 4 connection out loud: the library stops being a document people are supposed to consult and becomes something the tool offers them by name.',
      },
      {
        segment: 'guided-build', eyebrow: '🔬 CP2 gate', title: 'All three primitives lit, in three tabs, before a client exists',
        body: 'This is the confidence moment of the night. Relaunch and walk all three tabs deliberately. Tools: call it, get structured rows. Resources: read both URIs, confirm the MIME types match what you declared. Prompts: render it with arguments and read the expanded text. Green across all three is the CP2 gate. If a MIME type is wrong or a prompt will not expand, fix it here — while the surface area is small, while nothing depends on it, and while an instructor is standing in the room.',
        bullets: [
          'Tools tab: a real call returns structured rows',
          'Resources tab: both URIs read, MIME types match your declarations',
          'Prompts tab: it expands with the arguments you pass',
          'Three green tabs is the gate. A client before this is a client debugging a server bug.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — the three-tab walk',
          code: 'uv run mcp dev server.py\n\n# then, in the browser, in this order:\n#   Tools      -> call your tool with a real argument\n#   Resources  -> read both URIs, check the MIME type on each\n#   Prompts    -> render your prompt with its arguments filled in\n#\n# all three green? that is CP2. screenshot it — this is your assignment proof.',
          expectedResult: 'Three tabs, three working primitives, one screenshot worth keeping.',
          stopCondition: 'All three verified with your own eyes, and the screenshot saved for your submission.',
          rescue: 'A prompt that will not render is almost always an argument mismatch — check that every argument in the template is one the function actually declares.',
        },
        diagram: `flowchart TD
  I["🔬 Inspector"] --> T["🔧 Tools<br/>structured rows"]
  I --> R["📚 Resources<br/>MIME types match"]
  I --> P["💬 Prompts<br/>expands correctly"]
  T --> G["✅ CP2 gate"]
  R --> G
  P --> G`,
        script: 'Do the full walk live and then tell them to screenshot it, because that screenshot IS the assignment proof. This is the peak-competence moment of the week — the whole server, all three primitives, provable without one line of client code. Let the room feel it before you move to the client.',
      },
      {
        segment: 'guided-build', eyebrow: '4️⃣ CP3 · Your own client', title: 'Fifteen lines that do exactly what the inspector was doing for you',
        body: 'Now write the other half of the conversation. A minimal client launches your server as a subprocess, runs the initialize handshake, lists what is available, calls your tool, and reads your resource. Watch the shape, because it never changes: open the transport, open the session, initialize, then list and call and read. That is every MCP client that exists, from this small script all the way up to Claude Desktop. Once you have written one, no MCP client is a mystery to you again.',
        bullets: [
          'The lifecycle: open transport → open session → initialize → list / call / read',
          'initialize comes first, always — it negotiates capabilities and version',
          'The method names mirror the protocol you saw on the wire on Monday',
          'This same lifecycle scales to production clients unchanged',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — CP3, a client of your own',
          code: 'Create client.py in this project: a minimal MCP client that talks to my server over STDIO.\n\nIt should:\n1. Launch my server as a subprocess using the SDK stdio client and open a session over it.\n2. Run the initialize handshake FIRST, and print the server name and protocol version it negotiated.\n3. List the tools, resources and prompts the server advertises, and print the names of each.\n4. Call my tool with a realistic argument and print the structured result.\n5. Read my resource and print the first line of its content plus its MIME type.\n6. Wrap the whole run in a clear error handler that prints which step failed if something goes wrong, rather than a bare traceback.\n\nAdd one comment above the initialize call explaining why it must happen before anything else. Then run it.',
          expectedResult: 'Printed output showing the negotiated server name, the advertised primitives, your tool result, and your resource content.',
          stopCondition: 'Your client prints data that could only have come from your own server.',
          rescue: 'Client hangs with no output? It is usually the server path — the client has to be able to launch your server file from the directory it is running in.',
        },
        diagram: `flowchart LR
  CL["🐍 client.py"] --> TR["🔌 Open transport"]
  TR --> SE["🤝 initialize"]
  SE --> LS["📋 list tools /<br/>resources / prompts"]
  LS --> CA["▶️ call + read"]
  CA --> OUT["📦 Your own data,<br/>printed"]`,
        script: 'Run it live and read the printed output against the inspector on the other screen — same data, two clients, one server. Land it: "you have now authored both halves of an MCP conversation." That is a genuinely uncommon thing for a five-week student to be able to say.',
      },
      {
        segment: 'guided-build', eyebrow: '🔌 CP3 gate', title: 'Register it with a real host — and watch your prompt become a slash command',
        body: 'The last step is the one that makes it real for other people. Register your server with a host a human actually uses. In Claude Code that is one command. In Claude Desktop it is one entry in the configuration file plus a restart. Either way, the moment it registers, your tool becomes callable in ordinary conversation and your prompt appears as a slash command. Zero changes to your server. That is the M+N payoff from Monday, arriving on your own laptop about ninety minutes after you first heard the argument.',
        bullets: [
          'Claude Code: one command registers it, then /mcp shows it in-session',
          'Claude Desktop: add an entry under mcpServers in the config file, then restart',
          'Your tool is now callable in normal conversation — no code, no client script',
          'Your prompt shows up as a slash command. Same server, unchanged.',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'your TERMINAL (not Claude Code)',
          label: 'Terminal — register the server with Claude Code',
          code: '# register it (use the absolute path to YOUR project folder)\nclaude mcp add my-server -- uv run --directory /abs/path/to/my-server server.py\n\n# confirm it registered\nclaude mcp list\n\n# then start a Claude Code session and type /mcp to see it connected.\n# Claude Desktop instead? add the same command under "mcpServers" in\n# claude_desktop_config.json and restart the app.',
          expectedResult: 'Your server listed by claude mcp list, and visible under /mcp inside a Claude Code session.',
          stopCondition: 'You asked Claude something in ordinary conversation and watched it call YOUR tool to answer.',
          rescue: 'Registered but not connecting? It is nearly always a relative path — use the absolute path to the project directory in the add command.',
        },
        diagram: `flowchart LR
  S["🗄️ Your server"] --> REG["📝 claude mcp add"]
  REG --> H["💻 Claude Code<br/>host"]
  H --> TC["🔧 Tool callable<br/>in conversation"]
  H --> SL["⌨️ Prompt is now<br/>a slash command"]`,
        script: 'Demo this live if you do nothing else tonight. Ask Claude a plain-English question that requires the tool and let the room watch it reach into a server a student wrote ninety minutes ago. Seeing their own prompt appear as a slash command is the mic-drop of the week — pause and let them take a screenshot.',
      },

      /* ============================== failure ============================= */
      {
        segment: 'failure', eyebrow: '💥 Break it on purpose', title: 'Delete the boundary and feed it garbage — nothing here will crash politely',
        body: 'Your server works, which is precisely why this is the right moment to break it, while it is small and you are watching. We remove the input constraints and the type annotations from your tool, so the SDK can no longer generate a meaningful schema, and then we call it with the three inputs a real client will eventually send: nothing, far too much, and the wrong type entirely. Watch where the error surfaces. It will not be at the boundary — it will be somewhere deep inside your function, wrapped in a message no model can act on.',
        bullets: [
          '🕳️ No type annotations ⇒ no useful schema ⇒ anything gets through',
          '💣 Three inputs: an empty string, a 5,000-character string, and a number',
          '🌀 The error surfaces deep in your code, not at the door',
          'What the model receives is an internal failure, not guidance it can use',
        ],
        code: {
          kind: 'paste',
          pasteWhere: 'Claude Code',
          label: 'Claude Code prompt — break it, deliberately, on a copy',
          code: 'We are doing a deliberate failure exercise. Do NOT change my working server.\n\n1. Copy server.py to server_broken.py.\n2. In the copy ONLY, remove the type annotations and all input constraints from my tool, and remove the guard that returns a structured empty result when nothing is found — let it index or access directly instead, so a miss raises.\n3. Tell me the exact command to run the inspector against the broken copy.\n\nThen wait. I am going to call it by hand with three bad inputs before you fix anything:\n- an empty string\n- a string of about 5,000 characters\n- a number where a string belongs\n\nDo not fix anything yet, and do not touch my working server.',
          expectedResult: 'A broken copy whose input schema is now essentially "anything," and three calls that fail deep inside the function.',
          stopCondition: 'You have seen an ugly internal error come back from at least one bad input, and you have read what a model would receive.',
          rescue: 'If Claude Code starts fixing the copy on its own initiative, stop it: "leave it broken — I am demonstrating the failure first."',
        },
        diagram: `flowchart TD
  IN["💣 Bad input"] --> B["🚪 No boundary<br/>(constraints deleted)"]
  B --> F["🐍 Deep inside<br/>your function"]
  F --> E["💥 Internal error"]
  E --> M["🧠 The model gets<br/>noise, not guidance"]`,
        script: 'Run all three bad inputs live in the inspector and read the ugly traceback out loud in the voice of the model receiving it. Then ask the room the only question that matters: "whose job was it to stop this?" Answer: the boundary we deleted two minutes ago. Sit in that for a beat.',
      },
      {
        segment: 'failure', eyebrow: '🛡️ Harden it', title: 'Validate at the door, return structure on a miss, and save exceptions for the truly exceptional',
        body: 'Now repair it, and notice how unglamorous each fix is. The constraints come back, so malformed calls are refused at the protocol boundary with a schema error a client can actually read — before your code runs at all. The not-found case stops raising and starts returning a structured empty result with a message, because "no matches" is a valid answer, not a crash. Re-run the same three inputs: the malformed ones get refused legibly, and the valid-but-empty one returns clean data. The error moved from deep and opaque to shallow and legible, and that is the whole discipline.',
        bullets: [
          '🚪 Constraints at the boundary refuse bad input before your code runs',
          '📦 A miss returns a structured empty result — it never throws',
          '🗣️ Errors that do escape are named and say what to do differently',
          'Rule: validate at the edge, return structure, reserve exceptions for the exceptional',
        ],
        code: {
          kind: 'review',
          label: 'The hardened tool — read it against your own',
          code: 'from typing import Annotated\nfrom pydantic import Field\n\n@mcp.tool()\ndef search_docs(\n    query: Annotated[str, Field(min_length=1, max_length=200, description="What to search for")],\n    limit: Annotated[int, Field(ge=1, le=25)] = 5,\n) -> dict:\n    """Search the support knowledge base when a customer question may already be\n    answered by an existing article. Returns matching articles as id + title."""\n    q = query.strip().lower()\n    hits = [a for a in KB if q in a["title"].lower() or q in a["body"].lower()]\n    if not hits:\n        # A miss is a valid answer, not a crash.\n        return {"results": [], "message": "No articles matched that query."}\n    return {"results": [{"id": a["id"], "title": a["title"]} for a in hits[:limit]]}',
          expectedResult: 'Three things to find in your own tool: the length bounds, the range bound, and the structured empty return.',
        },
        diagram: `flowchart LR
  IN["💣 Bad input"] --> B["🚪 Boundary<br/>refuses it"]
  B --> CLR["🗣️ Clear schema error<br/>the client can read"]
  OK["🙂 Valid but empty"] --> ST["📦 Structured<br/>empty result"]`,
        script: 'Re-run the exact same three inputs from the previous slide and let the room see the difference themselves. Then ask which of the two fixes they would have thought of unprompted — usually the constraints, rarely the structured miss. Name that gap: it is exactly what the Build-Break-Harden habit exists to close.',
      },
      {
        segment: 'failure', eyebrow: '🧯 The one you cannot see', title: 'Hidden state: the server that works for you and shatters for the second person',
        body: 'One last trap, and it is invisible tonight by construction. If your tool caches results in a module-level variable, or remembers something between calls, it works perfectly in your single inspector session and breaks the moment a second client connects or the server restarts mid-conversation. Keep tools stateless: same inputs, same outputs, no dependence on what happened before. That property is not a nicety — it is the precondition for Week 6, when this exact server goes behind HTTP and runs as more than one instance. Where you are on the trust ladder tonight: your AI reaches real systems, read-mostly, and it earned that by being predictable.',
        bullets: [
          'Module-level mutable state looks fine in one session and corrupts under two',
          'Stateless: same input ⇒ same output, no memory of previous calls',
          'This is exactly what makes the Week 6 scale-out safe rather than exciting',
          'Assignment: the server repo with a tool, a resource and a prompt — proof is the inspector screenshot',
        ],
        diagram: `flowchart TD
  S["🗄️ Server with<br/>module-level state"] --> C1["🙂 Client 1<br/>works fine"]
  S --> C2["😱 Client 2<br/>sees client 1's data"]
  ST["✅ Stateless tool"] --> SAFE["🚀 Week 6:<br/>safe to scale"]`,
        script: 'Close the loop on the whole week in three sentences: primitives chosen by control model, boundaries validated at the door, tools kept stateless. Recap the assignment and its proof. Then the Week 6 trailer, said as a promise rather than a topic list: "this same server goes on call — sampling, notifications, file roots, a real transport, and a real business system behind it."',
      },
    ],

    storyBeats: {
      'result-preview': [
        {
          icon: '🤝', tone: 'violet', eyebrow: 'Before you build — what actually changes tonight',
          title: 'The first time somebody else uses something you built, it stops being homework',
          body: 'A student last cohort built a small server over a Thursday evening that exposed her team’s shipment-status lookup. She registered it, showed a colleague on Friday, and by the following Wednesday two other people on her team had it installed and were asking Claude about shipments in plain English. She did not write documentation, run a training session, or ship an application. She wrote one connector and it spread by itself.',
          punch: 'Everything before tonight, you built for yourself. This one, other people can pick up and use.',
        },
      ],
      'build-map': [
        {
          icon: '🚧', tone: 'amber', eyebrow: 'Why we hold the gate',
          title: 'The build that skipped the inspector and lost ninety minutes to a client bug that was not a client bug',
          body: 'Two students last cohort raced ahead and wrote their client before verifying the server. The client threw a strange error, so they rewrote the client. Then they rewrote the connection handling. Then they questioned their Python. When a mentor opened the inspector, the server was advertising no tools at all — it had never registered one. They had spent ninety minutes debugging a perfectly correct client against a server that had nothing to say.',
          punch: 'Every checkpoint tonight is green in the inspector before we move. That rule costs you two minutes and saves you ninety.',
        },
      ],
      failure: [
        {
          icon: '🧨', tone: 'cherry', eyebrow: 'A true story about a missing boundary',
          title: 'The tool that accepted a 200,000-character query and took the server down with it',
          body: 'An internal search tool went live on a Monday with no length constraint on its query argument, because in testing nobody had ever typed more than a sentence. On Thursday an automated client passed in the full text of a document by mistake. The tool did not reject it, did not truncate it, and did not fail fast — it tried, held the process, and every other client connected to that server waited behind it. The fix, afterwards, was eleven characters long.',
          punch: 'The boundary you did not add is never missing quietly. It is missing until the day it is expensive.',
        },
        {
          icon: '👥', tone: 'leaf', eyebrow: 'The bug that only appears when it succeeds',
          title: 'It worked perfectly until the second person tried it',
          body: 'A team shipped a server with a small cache in a module-level dictionary — an obvious optimisation, and it made the demo noticeably snappier. It ran flawlessly for the one engineer who built it. The week it was rolled out to six people, two of them started seeing results from each other’s queries, intermittently, in a way nobody could reproduce on demand. The server was not broken. It was remembering, which is the same thing when more than one person is talking to it.',
          punch: 'A system that only works when one person uses it has not been tested. It has been used once.',
        },
      ],
    },

    extraInteractions: [
      {
        segment: 'readiness', kind: 'poll',
        q: 'Four-point check — where are you right now?',
        options: [
          '✅ All four green',
          '🧰 Toolchain is red',
          '📁 Cannot find Monday’s folder',
          '✍️ No capability chosen yet',
        ],
        eyebrow: '🚦 Roll call', title: 'Before anybody writes a line',
        presenterTip: 'Operational. Read the counts out loud and send mentors to the non-green students immediately. Pay particular attention to the last option — a student with no chosen capability will drift all night, and a two-minute conversation now fixes it.',
      },
      {
        segment: 'result-preview', kind: 'poll',
        q: 'Honestly, how confident do you feel that you can ship a working MCP server in the next two hours?',
        options: [
          '😬 Not at all',
          '🙂 If I follow along carefully',
          '😎 I have a clear picture',
          '🔥 I already started on Tuesday',
        ],
        eyebrow: '🌡️ Room check', title: 'Where the room actually is',
        presenterTip: 'Temperature check, no reveal. If the first two options dominate, slow the CP0 pacing and say out loud that you are doing it. If the last two dominate, tell the confident ones they are on demo duty at the end — it gives them something to aim at.',
      },
      {
        segment: 'build-map', kind: 'poll',
        theater: true,
        q: 'The one thing your server exposes tonight — which primitive is it, and who decides to invoke it?',
        options: [
          '🔧 A tool — the model decides',
          '📚 A resource — the app decides',
          '💬 A prompt — the person decides',
          '🤔 I genuinely cannot tell yet',
        ],
        eyebrow: '📐 Design decision', title: 'Commit before you type',
        presenterTip: 'The one full-theater moment of the night. Lock the votes, show the count, then call on two people from different options to justify theirs in one sentence. Anyone who picked the last option gets a mentor immediately — this is the decision the whole build hangs on.',
      },
      {
        segment: 'guided-build', kind: 'trivia',
        q: 'You call your tool in the inspector with an empty query and get back a schema validation error. Is that good or bad?',
        options: [
          'Bad — the tool should handle any input',
          'Good — the boundary refused it before your code ran',
          'Bad — it means the schema is broken',
          'Neutral — it does not matter either way',
        ],
        answer: 1,
        reveal: 'That refusal is the boundary doing its job. Rejecting malformed input at the protocol edge, with a message the client can read, is exactly the behaviour we deliberately delete and restore later tonight.',
        eyebrow: '🩺 Diagnostic', title: 'A refusal is not a failure',
        presenterTip: 'Fire this right after the CP1 gate while the error message is still on their screens. Roughly a third of the room reads any red text as a bug — reframing it now is what makes the hardening segment land as a principle rather than a chore.',
      },
      {
        segment: 'guided-build', kind: 'poll',
        q: 'Checkpoint roll call — how far have you got?',
        options: [
          '0️⃣ Server starts',
          '1️⃣ Tool works in the inspector',
          '2️⃣ Resource and prompt both live',
          '3️⃣ My client is calling it',
        ],
        eyebrow: '🚦 Progress', title: 'Where the room is, before we go further',
        presenterTip: 'Operational, fired between CP2 and CP3. Read the spread out loud and pair the CP3 students with the CP1 students for five minutes — peer rescue is faster than mentor rescue at this point in the night and it is better for both of them.',
      },
      {
        segment: 'failure', kind: 'trivia',
        q: 'Your tool caches its results in a dictionary at module level. It runs perfectly for you. What breaks first in production?',
        options: [
          'Nothing — caching is always safe',
          'A second client sees results cached for someone else',
          'The transport stops working',
          'The inspector will not connect',
        ],
        answer: 1,
        reveal: 'Module-level state is invisible in a single session and corrupting the moment two people connect. Stateless tools — same input, same output, no memory — are the precondition for the Week 6 scale-out.',
        eyebrow: '🩺 Diagnostic', title: 'The bug that only shows up when it succeeds',
        presenterTip: 'Ask for a show of hands on who has added exactly this kind of cache before, in any language. Most experienced hands go up, which is the point: this is not a beginner mistake, it is a single-user assumption that survives until the day it does not.',
      },
      {
        segment: 'demos', kind: 'poll',
        q: 'Who is willing to screen-share their inspector session for ninety seconds?',
        options: [
          '🙋 Yes, mine works',
          '🙋 Yes, and mine is half broken (that is useful too)',
          '👀 I would rather watch tonight',
          '📸 I will submit the screenshot instead',
        ],
        eyebrow: '📣 Demos', title: 'Show it while it is still warm',
        presenterTip: 'Take one from the first option and one from the second, in that order. A half-broken server demoed honestly teaches the room more than a perfect one, and going second means the volunteer is not the cautionary tale — they are the debugging clinic.',
      },
      {
        segment: 'cta', kind: 'poll',
        q: 'Week 6 takes this exact server to production. What real system do you want it wired to?',
        options: [
          'A database we already run',
          'An internal API or service',
          'A SaaS tool my team lives in',
          'I need help identifying one',
        ],
        eyebrow: '🔮 Next week', title: 'Name the system you actually want to reach',
        presenterTip: 'This is the open loop that brings them back Monday. Read three answers out loud by name and say plainly that Week 6 is sampling, notifications, file roots, transports, and wiring this server to that system. Anyone who picks the last option needs a five-minute conversation before they leave.',
      },
    ],
  },
};
