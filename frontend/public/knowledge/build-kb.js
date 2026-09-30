/* Regenerate kb.json from the three domain data files.
   Run from the hub root:  node build-kb.js
   Keeps the machine-readable export in sync with its sources so it
   never silently drifts. AI-friendly: schema + version + domain tags. */
const fs = require("fs");
global.window = {};
require("./sales/kb-data.js");          // window.KB_DATA
require("./marketing/hub-data.js");     // window.HUB_DATA
require("./data/design-kb.js");         // window.DESIGN_DATA
require("./data/curriculum-kb.js");     // window.CURRICULUM_DATA
require("./data/product-kb.js");        // window.PRODUCT_DATA
require("./data/compliance-kb.js");     // window.COMPLIANCE_DATA

const SOURCES = [
  ["sales", "Sales", window.KB_DATA],
  ["marketing", "Marketing", window.HUB_DATA],
  ["design", "Design", window.DESIGN_DATA],
  ["curriculum", "Curriculum & Training", window.CURRICULUM_DATA],
  ["product", "Product & Platform", window.PRODUCT_DATA],
  ["compliance", "Compliance & Trust", window.COMPLIANCE_DATA]
];

const entries = [];
const catsByDomain = {};
for (const [domain, label, data] of SOURCES) {
  if (!data || !data.qa) continue;
  const cat = {};
  (data.categories || []).forEach(c => { cat[c.key] = c.title; });
  catsByDomain[domain] = (data.categories || []).map(c => ({ key: c.key, title: c.title }));
  data.qa.forEach((x, i) => {
    let reference = x.ref || (x.doc ? ("marketing/docs/" + x.doc) : "") || (domain === "sales" ? ("sales/index.html#cat-" + x.category) : "");
    entries.push({
      id: domain + "-" + (i + 1),
      domain: domain,
      category: cat[x.category] || x.category,
      category_key: x.category,
      question: x.q,
      answer: x.a,
      detail: x.detail || "",
      tags: x.tags || [],
      reference: reference,
      reference_label: x.refLabel || (x.doc ? x.doc.replace(/\.html$/, "").replace(/-/g, " ") : "") || (domain === "sales" ? (cat[x.category] || "Sales hub") : ""),
      needs_verification: (x.confidence === "drafted-verify") || false
    });
  });
}

const out = {
  schema: "colaberry.kb/v1",
  version: "1.0",
  name: "Colaberry Knowledge Base",
  description: "Company source of truth: Sales, Marketing, Design, Curriculum, Product, and Compliance. Machine-readable export for AI ingestion, built on the Colaberry design system. Refund and cancellation terms are drafted, not final. The AI Systems Architect Accelerator's own TWC status is not asserted here; only the Colaberry School of Data Analytics holds COA U5306. Do not invent facts beyond these entries.",
  generated_from: ["sales/kb-data.js", "marketing/hub-data.js", "data/design-kb.js", "data/curriculum-kb.js", "data/product-kb.js", "data/compliance-kb.js"],
  core_facts: (window.HUB_DATA && window.HUB_DATA.core) ? window.HUB_DATA.core : "",
  categories_by_domain: catsByDomain,
  domains: [
    { key: "sales", label: "Sales", status: "active" },
    { key: "marketing", label: "Marketing", status: "active" },
    { key: "design", label: "Design", status: "active" },
    { key: "curriculum", label: "Curriculum & Training", status: "active" },
    { key: "product", label: "Product & Platform", status: "active" },
    { key: "compliance", label: "Compliance & Trust", status: "active" }
  ],
  generated_at: new Date().toISOString(),
  count: entries.length,
  entries: entries
};

fs.writeFileSync("kb.json", JSON.stringify(out, null, 2));
console.log("kb.json regenerated: " + entries.length + " entries (" + ((JSON.stringify(out).length / 1024) | 0) + " KB)");
