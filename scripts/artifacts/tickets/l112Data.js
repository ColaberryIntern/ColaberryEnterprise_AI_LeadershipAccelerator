/**
 * l112Data — DOC 12's ten architecture diagrams.
 *
 * TICKET: L11.2, "Architecture diagrams, ten of them, Mermaid source plus rendered artifacts".
 *
 * THE DESIGN DECISION THAT MATTERS: A DIAGRAM MUST NOT DRAW AN UNBUILT PATH THE SAME WAY IT
 * DRAWS A WORKING ONE. Four of these ten depict requirements that are substantially not built —
 * the timeline orchestration diagram most of all, because there is no timeline runtime at all.
 * A clean box-and-arrow picture of a capability nobody has is the most persuasive wrong thing
 * this repository could produce, and it would be read as a description of the system by exactly
 * the people least able to check it.
 *
 * So every diagram carries `notBuilt`: the nodes that do not exist yet. Each is styled with the
 * `nb` class in its Mermaid source, and the self-check asserts that every node named in
 * `notBuilt` actually carries that class. A diagram cannot quietly promote an unbuilt path by
 * dropping the styling.
 *
 * `required` is transcribed from bootstrap §3.1's DOC 12 bullet list — the document that DEFINES
 * each diagram's contents — and the check looks for each element in the Mermaid source. As
 * everywhere else in this program, the check runs requirement -> artifact, never the reverse: a
 * contract read back off the diagrams would pass by construction.
 *
 * `learn` is required by the bootstrap too: "Every diagram must have a short explanation under
 * it: what the viewer should learn from this diagram."
 */

const META = {
  ticket: 'L11.2',
  doc: 'DOC 12',
  title: 'Colaberry Live — Architecture Diagrams',
  owner: 'Ali Muwwakkil',
  file: 'docs/colaberry-live/DOC_12_ARCHITECTURE_DIAGRAMS.md',
  built: '2026-11-03',
  /** Mermaid class applied to anything that does not exist yet. */
  nbClass: 'nb',
};

/** Styling appended to every diagram so "not built" looks different from "works". */
const NB_DEF = 'classDef nb fill:#fdecea,stroke:#b3261e,stroke-dasharray:4 3,color:#7a1b12';

const DIAGRAMS = [
  // ── 1 ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 1,
    title: 'System Context Diagram',
    required: ['Ali / presenter', 'Zoom', 'OBS', 'Cloudflare Stream Live', 'Colaberry backend',
      'persistent player', 'phone companion', 'YouTube', 'community', 'replay'],
    notBuilt: ['YT'],
    needs: [],
    learn: 'Who and what takes part, and where the boundary of our system actually is. Zoom and '
      + 'Cloudflare are outside it — we own the decision about who may watch, not the bytes. '
      + 'YouTube is drawn as not built because nothing publishes to it yet.',
    mermaid: `graph TB
  ALI["Ali / presenter"] --> OBS["OBS: scenes + local recording"]
  OBS --> ZOOM["Zoom: the interactive room"]
  ALI --> ZOOM
  STU["Students in the room"] --> ZOOM
  ZOOM -- "custom RTMP" --> CF["Cloudflare Stream Live"]
  ZOOM -. "simulcast, not built" .-> YT["YouTube"]
  CF -- "HLS, signed" --> PLAYER["Persistent player in the portal"]
  BE["Colaberry backend"] -- "mints playback grant" --> PLAYER
  BE --> PHONE["Phone companion"]
  BE --> COMM["Community / Builder Room"]
  BE --> REPLAY["Replay + media production"]
  PLAYER --> VIEWER["Viewer"]
  PHONE --> VIEWER
  ${NB_DEF}
  class YT nb`,
  },

  // ── 2 ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 2,
    title: 'Live Video Data Flow',
    required: ['Zoom RTMP', 'Cloudflare ingest', 'HLS', 'playback grant', 'client playback',
      'token renewal'],
    notBuilt: [],
    needs: [],
    learn: 'The 120-second pass is the whole security model. Nothing durable ever reaches the '
      + 'client: the player asks for a new grant before the old one expires, and a viewer who '
      + 'is not entitled simply never gets one, so there is nothing to share.',
    mermaid: `graph LR
  Z["Zoom RTMP out"] --> ING["Cloudflare ingest"]
  ING --> HLS["HLS packaged at the edge"]
  HLS --> CP["Client playback"]
  CP -- "asks" --> G["Playback grant: HMAC-SHA256, 120s"]
  G -- "min(now+ttl, contentStarted+preview)" --> CP
  CP -- "token renewal before expiry" --> G
  ENT["Entitlement: fail-closed"] --> G
  ${NB_DEF}`,
  },

  // ── 3 ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 3,
    title: 'Session-to-Live Sequence Diagram',
    required: ['create session', 'prepare timeline', 'create occurrence', 'backstage', 'go live',
      'timeline interaction', 'end', 'processing', 'replay ready'],
    notBuilt: [],
    needs: [],
    learn: 'The order operations must happen in, and the two refusals that protect an airing: '
      + 'go_live is refused without provider health, and refused again without a content-start '
      + 'anchor — because going live without the anchor would leave every viewer\'s free preview '
      + 'unbounded. Note that timeline interaction is a KEYPRESS, not the system advancing.',
    mermaid: `sequenceDiagram
  participant A as Ali
  participant BE as Colaberry backend
  participant CF as Cloudflare
  participant V as Viewer
  A->>BE: create session
  A->>BE: prepare timeline (run of show)
  BE->>BE: create occurrence (UNIQUE source ref)
  A->>BE: enter backstage
  BE->>CF: check provider health
  CF-->>BE: ready
  A->>BE: mark content started
  A->>BE: go live
  BE-->>A: refused if provider not ready or content not started
  V->>BE: discovery poll
  BE-->>V: playback grant
  A->>BE: timeline interaction (presenter keypress)
  BE-->>V: prompt / poll / pulse
  A->>BE: end
  BE->>BE: processing
  BE->>BE: replay ready
  BE-->>BE: or back to ended = aired, no replay`,
  },

  // ── 4 ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 4,
    title: 'Broadcast Occurrence Lifecycle Diagram',
    required: ['scheduled', 'backstage', 'live', 'reconnecting', 'ended', 'processing',
      'replay_ready', 'cancelled', 'processing failure'], // spelling-exempt: shipped state names
    notBuilt: [],
    needs: ['L11.3'],
    learn: 'Two things nothing else shows as clearly. Reconnect is NOT a restart — the occurrence '
      + 'keeps its identity. And canceling is a one-way door: it is terminal, the session cannot '
      + 'be given another occurrence, and re-scheduling the class writes nothing and reports '
      + 'nothing to whoever did it.',
    // spelling-exempt-begin — every state name below is the spelling the code and the database
    // use, and a per-line marker is impossible here: anything added inside this template
    // literal is rendered into the diagram.
    mermaid: `stateDiagram-v2
  [*] --> scheduled
  scheduled --> backstage
  scheduled --> live
  backstage --> live
  backstage --> scheduled
  live --> reconnecting
  reconnecting --> live
  live --> ended
  reconnecting --> ended
  ended --> processing
  processing --> replay_ready
  processing --> ended : processing failure = aired, no replay
  scheduled --> cancelled
  backstage --> cancelled
  live --> cancelled
  reconnecting --> cancelled
  replay_ready --> [*]
  cancelled --> [*]
  note right of cancelled
    Terminal. One confirmed click
    retires the class permanently.
  end note
  note right of reconnecting
    Reconnect preserves identity.
    Never reached in production.
  end note`,
    // spelling-exempt-end
  },

  // ── 5 ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 5,
    title: 'Access and Entitlement Diagram',
    required: ['free', 'paid', 'preview', 'private', 'fail-closed'],
    notBuilt: ['AM'],
    needs: [],
    learn: 'The rule that is easiest to get wrong: paid status never unlocks a private cohort. '
      + 'Money buys the paid tier, not membership of someone else\'s room. Every unknown path '
      + 'ends in denied, by design — and note that nothing in the product reads access_mode yet, '
      + 'so the tier is decided by other means today.',
    mermaid: `graph TB
  V["Viewer asks to watch"] --> M{"Occurrence access mode"}
  M -- free --> OK["Grant: full"]
  M -- paid --> P{"Has paid?"}
  P -- yes --> OK
  P -- no --> DENY["Denied, fail-closed"]
  M -- preview --> PV{"Preview window open?"}
  PV -- "yes" --> TB["Grant: preview, bounded by the deadline"]
  PV -- "no / not started" --> DENY
  M -- private --> R{"Room member or admin?"}
  R -- yes --> OK
  R -- "no, even if paid" --> DENY
  AM["access_mode column: declared, nothing reads it"] -.-> M
  DISC["Private occurrences are OMITTED from ineligible discovery, not shown-and-refused"] --> DENY
  ${NB_DEF}
  class AM nb`,
  },

  // ── 6 ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 6,
    title: 'Viewer Experience Diagram',
    required: ['YouTube discovery path', 'Colaberry interactive path', 'desktop path',
      'phone companion path', 'account conversion path', 'Architect progression'],
    notBuilt: ['YTD', 'BUILD', 'ART'],
    needs: [],
    learn: 'Where the funnel actually breaks. Watching and participating work; the YouTube '
      + 'discovery path does not exist yet, and neither does build progress — so every measure '
      + 'from Build onward is unmeasurable regardless of audience size. That is a bigger hole '
      + 'than any single missing feature.',
    mermaid: `graph TB
  YTD["YouTube discovery path: not built"] -.-> LAND["Arrives at Colaberry"]
  DIRECT["Direct / email / community"] --> LAND
  LAND --> CIP["Colaberry interactive path"]
  CIP --> DESK["Desktop path: persistent video, prompt, poll, chat"]
  CIP --> PH["Phone companion path: sticky video, one-thumb pulse, poll, prompt"]
  DESK --> PROMPT["Copies the Prompt Drop"]
  PH --> PROMPT
  PROMPT --> BUILD["Build progress: not built"]
  BUILD -.-> SAVE["Saves the work"]
  SAVE -.-> ACC["$0 account conversion path"]
  ACC --> COMM["Community / Builder Room"]
  COMM --> ART["Completed artifact: not measured"]
  ART -.-> ARCH["Architect progression"]
  ${NB_DEF}
  class YTD,BUILD,ART nb`,
  },

  // ── 7 ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 7,
    title: 'Timeline Orchestration Diagram',
    required: ['presenter slide', 'broadcast cue', 'QR state', 'phone interaction', 'Prompt Drop',
      'poll', 'audience pulse', 'clip marker'],
    notBuilt: ['CUE', 'QR'],
    needs: [],
    learn: 'The single most important thing to understand about this system: THERE IS NO TIMELINE '
      + 'RUNTIME. Nothing advances on a clock and no producer command touches content — the whole '
      + 'row of consequences below fires because the presenter pressed a key. Read every '
      + '"the timeline drives X" requirement as "the keypress drives X, when the presenter '
      + 'reaches the slide X was authored onto."',
    mermaid: `graph TB
  K["Presenter presses a key"] --> SI["slide_index++ in session_broadcast (last write wins)"]
  CLOCK["A clock"] -. "drives nothing, by design" .-> SI
  SI --> SLIDE["presenter slide / scene mode class"]
  SI --> CUE["broadcast cue system: not built"]
  SI --> QR["per-moment QR state: rejected by design"]
  SI --> PD["Prompt Drop: fires on slide arrival, no ad hoc control"]
  SI --> POLL["poll opens / reveals"]
  SI --> CM["clip marker written (every advance, automatic)"]
  PD --> PHI["phone interaction"]
  POLL --> PHI
  PHI --> PULSE["audience pulse: aggregate is instructor-only"]
  ${NB_DEF}
  class CUE,QR nb`,
  },

  // ── 8 ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 8,
    title: 'Studio Signal and Audio Diagram',
    // The two DISABLED sources are named separately, not folded into the generic
    // "no-duplicate-audio" phrase. A mutation that deleted one of the two boundaries SURVIVED
    // the generic check, because the phrase still appeared on the other edge — and losing
    // either one is a real duplicate-audio defect. A contract satisfied generically is not a
    // contract.
    required: ['camera', 'microphone', 'Zoom', 'OBS', 'participant audio', 'local recording',
      'Cloudflare output', 'monitoring', 'no-duplicate-audio',
      'Desktop Audio: DISABLED', 'Mic/Aux: DISABLED'],
    notBuilt: ['ALL'],
    needs: ['L11.3'],
    learn: 'The no-duplicate-audio boundaries are the whole point: global Desktop Audio and '
      + 'global Mic/Aux are disabled so a voice is captured once, not twice. And the warning '
      + 'Piyush calls out explicitly — Zoom mute does NOT mute OBS, so a presenter who mutes to '
      + 'cough is still on the local master. None of this hardware is installed yet.',
    mermaid: `graph TB
  CAM["camera: Logitech MX Brio, eye level, 1080p30"] --> OBS["OBS teaching scene"]
  MIC["microphone: FIFINE K688 on BM88 boom, 4-6 in"] --> AIC["Audio Input Capture"]
  AIC --> OBS
  DISP["Display Capture: teaching monitor only"] --> OBS
  ZP["participant audio from Zoom"] --> AAC["Application Audio Capture: Zoom"]
  AAC --> OBS
  XDA["global Desktop Audio: DISABLED"] -. "no-duplicate-audio boundary" .-> OBS
  XMA["global Mic/Aux: DISABLED"] -. "no-duplicate-audio boundary" .-> OBS
  OBS --> VC["OBS Virtual Camera"]
  VC --> Zoom["Zoom"]
  MIC --> Zoom
  Zoom --> RTMP["custom RTMP"]
  RTMP --> CFO["Cloudflare output"]
  OBS --> REC["local recording: MKV on SSD, remux to MP4"]
  EAR["earbuds: Zoom speaker output only"] --> MON["monitoring: OBS monitoring OFF unless proven"]
  ALL["Zoom mute does NOT mute OBS"] -.-> REC
  ${NB_DEF}
  class ALL nb`,
  },

  // ── 9 ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 9,
    title: 'Replay and Media Pipeline Diagram',
    required: ['end live', 'replay', 'replay metadata', 'transcript', 'long-form edit', 'Shorts',
      'YouTube', 'replay workspace'],
    notBuilt: ['TR', 'LF', 'SH', 'SOC', 'CHAP'],
    needs: [],
    learn: 'Two of fifteen required outputs exist. The recording binds to its occurrence and clip '
      + 'markers export to CSV — that is the whole of R7 today. Everything dashed is unbuilt, '
      + 'and the seven-phase build plan does not cover any of it, so building P1-P7 to '
      + 'completion still leaves this diagram mostly dashed.',
    mermaid: `graph LR
  EL["end live"] --> PROC["processing"]
  PROC --> VOD["Cloudflare VOD / replay"]
  PROC -. "on failure" .-> AIRED["ended = aired, no replay"]
  VOD --> RM["replay metadata: lifecycle only"]
  RM --> RW["Colaberry replay workspace"]
  CM["clip markers: in-points, CSV export"] --> ED["Editor"]
  OBSREC["OBS local MKV master"] --> ED
  RM -.-> CHAP["chapters / description: not built"]
  VOD -.-> TR["transcript: not built"]
  TR -.-> LF["long-form edit: not built"]
  TR -.-> SH["5-7 Shorts: not built"]
  LF -.-> SOC["YouTube / social: not built"]
  SH -.-> SOC
  ${NB_DEF}
  class TR,LF,SH,SOC,CHAP nb`,
  },

  // ── 10 ─────────────────────────────────────────────────────────────────────────────────────
  {
    id: 10,
    title: 'Failure and Recovery Diagram',
    required: ['RTMP loss', 'reconnect', 'provider timeout', 'expired playback grant',
      'replay processing failure', 'user-facing state'],
    notBuilt: ['SEEN'],
    needs: ['L11.3'],
    learn: 'What survives what. Reconnect and grant renewal are real recoveries; a Cloudflare '
      + 'outage has none, and improvising an unsigned URL would give the paywall away '
      + 'permanently — so the correct response is to fail closed and keep teaching in Zoom. The '
      + 'dashed box is the gap: no test asserts what a viewer actually SEES during any of this.',
    mermaid: `graph TB
  RTMP["RTMP loss"] --> RC["reconnect: live to reconnecting to live"]
  RC --> OK["identity preserved, show continues"]
  RTMP -- "sustained, past hysteresis" --> AE["auto-end window closes the show"]
  PT["provider timeout"] --> CB["circuit breaker + ProviderNotReady"]
  CB --> HOLD["go_live refused; teach in Zoom, record locally"]
  EG["expired playback grant"] --> REN["renewal recomputes the deadline"]
  REN --> OK
  CFD["Cloudflare unavailable"] --> NOFB["NO fallback that serves media: fail closed"]
  NOFB --> HOLD
  RPF["replay processing failure"] --> AIRED["ended = aired, no replay; OBS master is recovery"]
  CANCEL["cancel pressed by mistake"] --> NONE["no recovery: terminal, make a new session"]
  SEEN["user-facing state during failure: untested"] -.-> OK
  SEEN -.-> HOLD
  ${NB_DEF}
  class SEEN nb`,
  },
];

const TOTALS = (() => {
  const nb = DIAGRAMS.reduce((n, d) => n + d.notBuilt.length, 0);
  return {
    diagrams: DIAGRAMS.length,
    required: DIAGRAMS.reduce((n, d) => n + d.required.length, 0),
    notBuiltNodes: nb,
    withNotBuilt: DIAGRAMS.filter((d) => d.notBuilt.length).length,
    // L0.3 proposed cutting this ticket from ten diagrams to the three L11.3 needs. That is
    // Ali's call, not Claude Code's, so all ten are built — and the three are marked so the cut
    // is one edit away rather than a re-derivation.
    neededByOperatorManual: DIAGRAMS.filter((d) => d.needs.includes('L11.3')).length,
  };
})();

module.exports = { META, NB_DEF, DIAGRAMS, TOTALS };
