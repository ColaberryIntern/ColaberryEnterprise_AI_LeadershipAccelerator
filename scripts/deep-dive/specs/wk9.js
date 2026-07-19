// Deep Dive Field Guide — content spec, Week 9: Data Architect.
// Content only. The deterministic generator supplies chrome, CSS, nav, read-tracker, upload gate.
module.exports = {
  week: 9,
  role: "Data Architect",
  tag: "DATA · Wk 9",
  sections: [

    {
      id: "dashboard",
      navLabel: "Dashboard",
      eyebrow: "Data Architect · Week 9",
      title: "Design data that stays true as it moves",
      body: `
        <p class="lead">The Data Architect decides <strong>how data is modeled, moved, stored, governed, and trusted</strong> — before a table is built or a report is run. Your job is to <strong>direct, evaluate, and approve</strong> the models, pipelines, and policies an AI drafts, so every team builds on data that is correct, traceable, and safe.</p>
        <div class="kpis">
          <div class="kpi"><div class="v">9</div><div class="l">Docs you'll build</div></div>
          <div class="kpi c1"><div class="v">3</div><div class="l">Model layers</div></div>
          <div class="kpi c2"><div class="v">6</div><div class="l">Quality dimensions</div></div>
          <div class="kpi c3"><div class="v">1</div><div class="l">Golden record</div></div>
        </div>
        <div class="callout"><strong>Running example.</strong> We use one case — a regional <em>auto-insurance carrier</em> unifying policies, claims, and payments into a governed warehouse. In your build, pick Restaurant, Insurance, Healthcare, Retail, or Manufacturing.</div>
      `
    },

    {
      id: "overview",
      navLabel: "Overview & Mission",
      eyebrow: "Overview · Mission",
      title: "Why the Data Architect exists",
      body: `
        <p>Every application quietly creates data, and every decision depends on it. Without a Data Architect, each team invents its own "customer," a policy number means two things in two systems, and no one can trace a number on the CFO's report. This discipline makes data a <strong>shared, trustworthy asset</strong> instead of accidental byproducts.</p>
        <div class="card"><div class="sub">Business value</div><ul class="clean">
          <li>One agreed definition of core entities — a customer is a customer everywhere.</li>
          <li>Data traceable from a report back to the row that produced it.</li>
          <li>Fast transactions and fast analytics, neither starving the other; PII retained lawfully.</li>
        </ul></div>
        <div class="card"><div class="sub">What breaks without it</div><ul class="clean">
          <li>The same policy counted twice — revenue and loss ratios drift.</li>
          <li>Reports disagree, each pulling from a different un-reconciled source.</li>
          <li>A schema change breaks feeds; PII sprawls into exports no one can delete.</li>
        </ul></div>
        <div class="callout warn"><strong>How AI changes it.</strong> AI drafts ER diagrams, DDL, pipelines, and quality rules in seconds. It cannot decide which entities are truly the same, which fields are PII, or how long data must be kept. You supply judgment; AI supplies the first draft.</div>
      `
    },

    {
      id: "twenty",
      navLabel: "The 20% You Need",
      eyebrow: "The 20% You Need to Know",
      title: "Enough data architecture to direct and judge it",
      body: `
        <p>You do not need to become a Data Architect — only these building blocks well enough to spot when an AI's model is redundant, its pipeline untraceable, or its governance missing.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Concept</th><th>What it is</th><th>Tell of good work</th></tr></thead>
          <tbody>
            <tr><td>Conceptual / logical / physical</td><td>Business map, then normalized attributes+keys, then real tables</td><td>Each layer distinct, consistent</td></tr>
            <tr><td>ERD &amp; cardinality</td><td>Entities plus 1:1, 1:many, many:many relationships</td><td>Every relationship states cardinality</td></tr>
            <tr><td>Normalize / denorm.</td><td>One fact in one place vs redundancy for reads</td><td>Denorm on purpose, reads only</td></tr>
            <tr><td>OLTP vs OLAP</td><td>Transactional writes vs analytical reads; warehouse vs lake</td><td>The two are separated</td></tr>
            <tr><td>ETL vs ELT</td><td>Transform before load vs load then transform</td><td>Each stage is idempotent</td></tr>
            <tr><td>Lineage</td><td>Where a field came from and its transforms</td><td>Any column traces to a source</td></tr>
            <tr><td>Master data</td><td>The single golden record for an entity</td><td>One customer, de-duplicated</td></tr>
          </tbody>
        </table></div>
        <div class="callout"><strong>Example.</strong> Keep <em>Customer</em> as the master entity, referenced by <code>customer_id</code> from <em>Policy</em> and <em>Claim</em>; denormalize the name only into the analytics table, kept in sync by a rebuild. Versioned, additive schema evolution protects consumers.</div>
      `
    },

    {
      id: "role",
      navLabel: "Role in the SDLC",
      eyebrow: "Where it fits",
      title: "Role in the SDLC",
      body: `
        <p>The Data Architect owns the <strong>data design</strong> layer — after the solution's shape is known, before engineers build tables or analysts build reports. It takes the domain and system architecture in, and hands off a governed schema, pipeline design, and data policy every builder must honor.</p>
        <div class="flow">
          <div class="step"><div class="k">Before</div><div class="t">Solution / System Architecture</div></div>
          <div class="step"><div class="k">You are here</div><div class="t">Data Architect</div></div>
          <div class="step"><div class="k">After</div><div class="t">Data &amp; Backend Engineering</div></div>
        </div>
        <div class="stack" style="margin-top:.4rem">
          <div class="tier"><div class="lab">Gives it input</div><div class="row"><span class="chip">Solution Architect</span><span class="chip">Business Analyst</span><span class="chip">Compliance</span></div></div>
          <div class="tier"><div class="lab">The role (you direct it)</div><div class="row"><span class="chip pri">Data Architect</span></div></div>
          <div class="tier"><div class="lab">Consumes its output</div><div class="row"><span class="chip">Data Engineers</span><span class="chip">Backend / API</span><span class="chip">BI &amp; Analytics</span><span class="chip">ML Engineers</span></div></div>
        </div>
        <div class="callout"><strong>Approval gate you own:</strong> data-model &amp; governance sign-off. Before engineering builds, you confirm it is normalized where it should be, PII is classified, retention is set, and every field traces to a source.</div>
      `
    },

    {
      id: "io",
      navLabel: "Inputs & Outputs",
      eyebrow: "Section · Inputs &amp; Outputs",
      title: "What comes in, what hands off",
      body: `
        <div class="grid g2">
          <div class="card"><h4>Inputs</h4><ul class="clean">
            <li>Domain entities &amp; requirements from the BA</li>
            <li>Solution architecture &amp; system boundaries</li>
            <li>Source systems: policy admin, claims, payments</li>
            <li>Regulatory &amp; retention constraints (PII, audit)</li>
          </ul></div>
          <div class="card"><h4>Outputs</h4><ul class="clean">
            <li>Conceptual, logical &amp; physical models (ERD)</li>
            <li>Schema / DDL and a published data dictionary</li>
            <li>ETL/ELT pipeline design and lineage map</li>
            <li>Quality rules, governance + retention, storage strategy</li>
          </ul></div>
        </div>
        <div class="sub">Information flow</div>
        <div class="flow">
          <div class="step"><div class="k">In</div><div class="t">Sources &amp; needs</div></div>
          <div class="step"><div class="k">Model</div><div class="t">Entities → ERD</div></div>
          <div class="step"><div class="k">Move &amp; govern</div><div class="t">Pipeline, quality, policy</div></div>
          <div class="step"><div class="k">Out</div><div class="t">Trusted schema</div></div>
        </div>
      `
    },

    {
      id: "responsibilities",
      navLabel: "Responsibilities",
      eyebrow: "Ownership",
      title: "What a Data Architect actually owns",
      body: `
        <div class="card"><ul class="clean">
          <li><strong>Model the domain</strong> — conceptual, logical, then physical models the business agrees with.</li>
          <li><strong>Define entities &amp; keys</strong> — one identity per real thing; primary and foreign keys that enforce it.</li>
          <li><strong>Choose the storage shape</strong> — normalized OLTP for writes, a warehouse or lake for analytics.</li>
          <li><strong>Design pipelines</strong> — ETL/ELT that lands, transforms, and reconciles source data idempotently.</li>
          <li><strong>Publish the dictionary &amp; set quality rules</strong> — every field defined; checks that reject or flag bad rows.</li>
          <li><strong>Govern, classify &amp; version</strong> — mark PII, set access and retention, evolve schema without breaking consumers or lineage.</li>
        </ul></div>
        <div class="card"><div class="sub">You own vs you don't</div>
          <div class="kv"><span class="k">Own</span><span class="val">The model · Keys &amp; quality · Governance &amp; sign-off</span></div>
          <div class="kv"><span class="k">Don't own</span><span class="val">The app code · Infra tuning · Report visuals</span></div>
        </div>
      `
    },

    {
      id: "artifacts",
      navLabel: "Documents You'll Generate",
      eyebrow: "Section · Documents",
      title: "The 9 documents your Field Guide builds",
      body: `
        <p>These are exactly what your Field Guide generates for your chosen example — each viewable, searchable, and downloadable.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Document</th><th>What it proves</th></tr></thead>
          <tbody>
            <tr><td>Data Model &amp; ERD (conceptual → physical)</td><td>Entities, relationships, and keys agreed before any table exists</td></tr>
            <tr><td>Data Dictionary</td><td>Every field named, typed, defined, sourced, PII-flagged</td></tr>
            <tr><td>Physical Schema / DDL</td><td>The real tables, types, constraints, and indexes</td></tr>
            <tr><td>Pipeline (ETL/ELT) Design</td><td>How source data lands, transforms, and reaches the warehouse — re-runnable</td></tr>
            <tr><td>Data Quality Rules</td><td>Checks that keep bad rows out and make trust measurable</td></tr>
            <tr><td>Data Governance &amp; Retention Policy</td><td>Access, PII classification, and lawful retention</td></tr>
            <tr><td>Storage &amp; Retention Strategy</td><td>The OLTP/OLAP split and hot / warm / cold lifecycle</td></tr>
            <tr><td>Data Lineage Map</td><td>Every field traces from report back to its source</td></tr>
            <tr><td>Master &amp; Reference Data Definition</td><td>The golden record and shared code sets</td></tr>
          </tbody>
        </table></div>
      `
    },

    {
      id: "goodbad",
      navLabel: "Good vs Bad Data Design",
      eyebrow: "Section · Good vs Bad",
      title: "Good vs bad data architecture",
      body: `
        <div class="gb">
          <div class="col good"><h4>Good data architecture</h4><ul>
            <li>One entity per real thing, with a stable primary key.</li>
            <li>Normalized where written; denormalized only where reads demand it.</li>
            <li>OLTP and OLAP separated; every field defined and traceable to a source.</li>
            <li>PII classified, access scoped, retention set; schema changes versioned.</li>
          </ul></div>
          <div class="col bad"><h4>Bad data architecture</h4><ul>
            <li>The same fact stored in five places, updated in one.</li>
            <li>Reporting run against the live transactional database.</li>
            <li>Pipelines that double-count rows when re-run; columns named <code>flag1</code>, <code>misc</code>.</li>
            <li>PII copied into logs; a column dropped in place, breaking feeds.</li>
          </ul></div>
        </div>
        <div class="callout warn"><strong>Red flags in AI-drafted models:</strong> one wide table for everything, no cardinality, missing surrogate keys, no PII column, unstated retention, pipelines that assume one clean run.</div>
      `
    },

    {
      id: "metrics",
      navLabel: "KPIs & Success",
      eyebrow: "Section · Measurement",
      title: "KPIs &amp; success metrics",
      body: `
        <div class="card"><div class="sub">Quality &amp; health signals</div>
          <div class="kv"><span class="k">Completeness</span><span class="val">% of required fields populated</span></div>
          <div class="kv"><span class="k">Validity</span><span class="val">% of rows passing type/range rules</span></div>
          <div class="kv"><span class="k">Uniqueness</span><span class="val">Duplicate rate on the golden record</span></div>
          <div class="kv"><span class="k">Consistency</span><span class="val">Cross-system reconciliation match rate</span></div>
          <div class="kv"><span class="k">Freshness / coverage</span><span class="val">Data age vs SLA; % of fields with lineage + dictionary</span></div>
        </div>
        <div class="callout"><strong>Leading vs lagging.</strong> Dictionary coverage and lineage are <em>leading</em> — they predict trouble. Reconciliation breaks and duplicate golden records are <em>lagging</em> — they confirm where it already failed.</div>
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
            <tr><td>erwin / dbdiagram</td><td>ER modeling &amp; diagrams</td><td>Draft the logical model</td></tr>
            <tr><td>PostgreSQL / SQL Server</td><td>OLTP transactional store</td><td>Generate DDL, keys, indexes</td></tr>
            <tr><td>Snowflake / BigQuery</td><td>Analytical warehouse (OLAP)</td><td>Draft star-schema marts</td></tr>
            <tr><td>dbt / Airflow</td><td>ELT transforms &amp; orchestration</td><td>Scaffold models and the DAG</td></tr>
            <tr><td>Great Expectations</td><td>Data quality rules</td><td>Propose validity &amp; uniqueness checks</td></tr>
            <tr><td>Collibra / DataHub</td><td>Catalog, dictionary, lineage</td><td>Draft definitions &amp; PII tags</td></tr>
          </tbody>
        </table></div>
        <p class="muted small">You are not learning these tools — only what each is for, to spot when an AI picked the wrong one.</p>
      `
    },

    {
      id: "ai",
      navLabel: "AI Collaboration",
      eyebrow: "Section · AI Collaboration",
      title: "Working with AI on data architecture",
      body: `
        <div class="grid g2">
          <div class="card"><h4>AI does well</h4><ul class="clean">
            <li>Draft an ERD and normalized logical model</li>
            <li>Generate DDL, keys, indexes, constraints</li>
            <li>Scaffold ETL/ELT stages and quality tests</li>
          </ul></div>
          <div class="card"><h4>You still own</h4><ul class="clean">
            <li>Which records are truly the same entity</li>
            <li>What the business means by each field</li>
            <li>Which fields are PII; normalize or denormalize</li>
          </ul></div>
        </div>
        <div class="sub">Where AI gets it wrong</div>
        <ul class="clean">
          <li>Invents field names that do not match the source system.</li>
          <li>Over-normalizes analytics, or over-denormalizes the transactional core.</li>
          <li>Omits surrogate keys, cardinality, PII flags, or idempotency — a re-run double-loads.</li>
        </ul>
        <div class="sub">The loop</div>
        <div class="flow">
          <div class="step"><div class="k">1</div><div class="t">Describe domain</div></div>
          <div class="step"><div class="k">2</div><div class="t">AI drafts</div></div>
          <div class="step"><div class="k">3</div><div class="t">You evaluate</div></div>
          <div class="step"><div class="k">4</div><div class="t">Refine</div></div>
          <div class="step"><div class="k">5</div><div class="t">Approve</div></div>
        </div>
      `
    },

    {
      id: "review",
      navLabel: "Architect Review Lens",
      eyebrow: "Architect Review",
      title: "Before you approve a data design",
      body: `
        <p>Run every AI-generated model, pipeline, and policy through this lens.</p>
        <div class="grid g2">
          <div class="card"><h4>Model &amp; movement</h4><ul class="clean">
            <li>Each entity one real thing with a stable key?</li>
            <li>Every relationship states its cardinality?</li>
            <li>Normalized where written, denorm. only for reads?</li>
            <li>Each pipeline stage idempotent and traceable?</li>
          </ul></div>
          <div class="card"><h4>Trust &amp; governance</h4><ul class="clean">
            <li>Quality rules for the critical fields?</li>
            <li>One golden record; every field in the dictionary?</li>
            <li>PII classified, access scoped, retention set?</li>
            <li>Schema change versioned and non-breaking?</li>
          </ul></div>
        </div>
        <div class="callout"><strong>Approve only when:</strong> every entity has one key, every relationship a cardinality, every field is defined and traceable to a source, pipelines are idempotent, PII is classified with retention set, and schema changes are versioned and additive.</div>
      `
    },

    {
      id: "inspect",
      navLabel: "How to Inspect It",
      eyebrow: "Inspect Your Build",
      title: "What to check in your Field Guide",
      body: `
        <p>After Claude Code builds your Field Guide, open it and check these — the architect's review in practice:</p>
        <ul class="clean">
          <li><strong>ERD</strong> — every relationship shows a cardinality, and each entity has a primary key.</li>
          <li><strong>Data dictionary</strong> — pick a column; it has a type, a plain-English meaning, a source, and a PII flag.</li>
          <li><strong>Schema / DDL</strong> — foreign keys present, and indexes on the columns you would filter on.</li>
          <li><strong>Pipeline design</strong> — it says what happens on a re-run: a merge/idempotency key, not a blind insert.</li>
          <li><strong>Governance &amp; Ask</strong> — retention per PII field with a deletion path; ask the assistant "which fields are PII?" and see if it answers from your docs.</li>
        </ul>
        <div class="callout">Found a gap? That is the point — refine your prompt, rebuild, and re-upload. The newest version replaces the old; points are awarded once.</div>
      `
    },

    {
      id: "kb",
      navLabel: "Knowledge Base",
      eyebrow: "Knowledge Base",
      title: "Glossary &amp; FAQ",
      body: `
        <div class="card">
          <div class="kv"><span class="k">Conceptual / logical / physical</span><span class="val">Business map → normalized attributes+keys → real tables</span></div>
          <div class="kv"><span class="k">ERD &amp; cardinality</span><span class="val">Entities and their 1:1 / 1:many / many:many relationships</span></div>
          <div class="kv"><span class="k">Normalization / denorm.</span><span class="val">One fact in one place vs redundancy to speed reads</span></div>
          <div class="kv"><span class="k">OLTP / OLAP</span><span class="val">Transactional writes vs analytical reads</span></div>
          <div class="kv"><span class="k">Warehouse / lake</span><span class="val">Curated structured vs raw multi-format store</span></div>
          <div class="kv"><span class="k">ETL / ELT</span><span class="val">Transform before vs after load</span></div>
          <div class="kv"><span class="k">Lineage</span><span class="val">Where a field came from and its transforms</span></div>
          <div class="kv"><span class="k">Master data (MDM)</span><span class="val">The single golden record for a core entity</span></div>
          <div class="kv"><span class="k">Schema evolution</span><span class="val">Changing structure without breaking consumers</span></div>
        </div>
        <div class="q"><div class="qt">1. When should I denormalize?</div><button class="revealbtn">Reveal</button><div class="ans">Only in read-heavy analytical stores where join cost hurts, and only when a rebuild keeps the copies in sync. Keep the transactional core normalized.</div></div>
        <div class="q"><div class="qt">2. What makes a pipeline idempotent?</div><button class="revealbtn">Reveal</button><div class="ans">Re-running with the same input yields the same end state — no duplicate rows. Merge/upsert on a stable key or a load watermark, never a blind insert.</div></div>
      `
    },

    {
      id: "build",
      navLabel: "Build & Submit",
      eyebrow: "Build &amp; Submit",
      title: "Build your Data Architect Field Guide",
      body: `
        <p class="lead">You'll build your Field Guide in <strong>your own Claude Code</strong>: a searchable, Colaberry-branded guide with real documents for a chosen example, an Ask assistant, and downloads. Then upload it here.</p>
        <p>It generates these documents for one example industry, each searchable and downloadable:</p>
        <ul class="clean">
          <li><strong>Data Model &amp; ERD</strong> — conceptual, logical, physical.</li>
          <li><strong>Data Dictionary</strong> — every field typed, defined, sourced, PII-flagged.</li>
          <li><strong>Physical Schema / DDL</strong> and <strong>Pipeline (ETL/ELT) Design</strong>.</li>
          <li><strong>Data Quality Rules</strong> and a <strong>Governance &amp; Retention Policy</strong>.</li>
          <li><strong>Storage &amp; Retention Strategy</strong> — the OLTP/OLAP split and tiers.</li>
          <li><strong>Data Lineage Map</strong> and a <strong>Master &amp; Reference Data Definition</strong>.</li>
        </ul>
        <button class="buildcta" id="copyPromptBtn2" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy the build prompt</button>
        <p class="muted small">The prompt is long on purpose — just copy it and paste it into Claude Code. You don't need to read it.</p>
      `
    }

  ],

  buildPrompt: `Build a rich, self-contained Data Architect FIELD GUIDE as a single HTML file named DataArchitect_FieldGuide.html. Take your time and make it genuinely substantial — a 5 to 10 minute build that produces a polished, knowledge-base-style guide, not a quick page.

WHO IT'S FOR: I'm a learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect. I need the ~20% of data architecture required to DIRECT, EVALUATE, and APPROVE AI-generated models, pipelines, and governance. No project yet — pick ONE example industry (Restaurant, Insurance, Healthcare, Retail, or Manufacturing), invent a believable initiative (e.g. an auto-insurance carrier unifying policies, claims, and payments into a governed warehouse), and make every document concrete to it.

MAKE IT A KNOWLEDGE BASE, not a brochure: a left topic nav, a prominent SEARCH box, and an "Ask" assistant that answers FROM THE GUIDE'S OWN CONTENT (a small embedded offline Q&A matching each question to the most relevant section; no external API).

BRANDING & QUALITY: Colaberry logo in the header and on print/PDF export; executive, calm, authoritative voice; light/dark aware; fully self-contained inline CSS + JS, NO external libraries or CDNs, works offline as one file.

TEACH THE DISCIPLINE (concise): conceptual vs logical vs physical models; entities & relationships and ERD cardinality; normalization vs denormalization; OLTP vs OLAP and warehouse vs lake; ETL vs ELT and pipelines; data quality and lineage; master data and the data dictionary; governance, PII, and retention; schema evolution. Then good vs bad design, KPIs, and the review lens.

THEN GENERATE THE DOCUMENTS — the heart of it. For the chosen example, produce REAL, substantial documents (not placeholders), each in its own searchable section, each individually DOWNLOADABLE. PRIMARY format = a fully-styled, self-contained HTML deliverable that looks like a genuine professional document: a branded cover with the Colaberry logo, a document-control strip (version, owner, status, date), styled headers and navy tables, callouts, a sign-off block (Prepared / Reviewed / Approved), and a footer. Make each EXTENSIVE, not a summary. ALSO a Save-as-PDF that prints the same designed document, and an Excel-friendly .csv for the tabular ones (data dictionary, quality rules, lineage map). Do NOT default to plain .md:
  1. Data Model & ERD — conceptual, logical, physical, with entities, keys, cardinalities
  2. Data Dictionary — every field: name, type, meaning, source, nullable, PII flag
  3. Physical Schema / DDL — CREATE TABLE with keys, constraints, indexes
  4. Pipeline (ETL/ELT) Design — idempotent, re-runnable stages source to warehouse
  5. Data Quality Rules — validity, completeness, uniqueness, consistency checks
  6. Data Governance & Retention Policy — access, PII classification, retention, deletion
  7. Storage & Retention Strategy — OLTP/OLAP split and hot / warm / cold tiers
  8. Data Lineage Map — every reported field traced back to its source
  9. Master & Reference Data Definition — the golden record and shared code sets

USE RICH VISUALS as INLINE SVG (self-contained, offline): Mermaid-style diagrams (an ERD with crow's-foot cardinality, a pipeline data-flow, a star-schema) AND Power BI-style charts (KPI tiles, bar / line / donut) for quantitative content. QUALITY BAR: one entity per real thing with a stable key; every relationship states its cardinality; normalized where written, denormalized only for reads; every field defined and traceable; pipelines idempotent; PII classified with retention set. No orphan columns; no one-wide-table; every document findable via search and answerable by the Ask assistant.

EMBED metadata as a JSON script tag id="deepdive-metadata": { guide_type:"Data Architect Field Guide", curriculum_type:"deep_dive", week:9, discipline:"Data Architect", student_id, project_id, repository, generated_by:"Claude Code", generated_date, version, build_number }.

When finished, open the file in the browser.`
};
