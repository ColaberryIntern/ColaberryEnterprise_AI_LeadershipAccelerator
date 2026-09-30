// Ask Aleem to build per-brand design profiles for the five ecosystem segments.
//
// Context: the platform is being rebuilt as a multi-tenant, multi-brand ecosystem
// (one shared backend, several legally and commercially distinct public brands).
// The `brands` table stores a theme key per brand and the apps own their themes,
// so the design work has to land in a shape the platform can actually store.
// This email gives Aleem the exact token contract so his output drops straight in.
//
// Path A send (BC ticket attach) per the operating doctrine. Ticket 10031928327 is
// the Colaberry Training design-profile todo Ali referenced as the reference example,
// so this request extends that thread rather than starting an untracked one.

const { sendWithBcAttach } = require('./lib/sendWithBcAttach');

const TRAINING_TODO = 'https://app.basecamp.com/3945211/buckets/7463955/todos/10031928327';

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
<tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
<div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
<div style="margin-top: 14px;">
<a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
</div>
</td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai
Design Your AI Organization: https://advisor.colaberry.ai/advisory`;

const P = 'font-size:14px;color:#2d3748;line-height:1.6;margin:0 0 14px';
const H2 = 'font-size:16px;color:#1a365d;font-weight:700;margin:26px 0 10px';
const TD = 'padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2d3748;vertical-align:top';
const TH = 'padding:7px 10px;border-bottom:2px solid #cbd5e0;font-size:12px;color:#1a365d;text-align:left;text-transform:uppercase;letter-spacing:.04em';
const CODE = 'font-family:monospace;background:#f7fafc;padding:1px 4px;border-radius:3px;font-size:12px';

const SEGMENTS = [
  {
    brand: 'refactored',
    name: 'Refactored.ai',
    role: 'The platform itself. Parent of everything else.',
    audience: 'Technical buyers, platform partners, prospective white-label tenants.',
    feel: 'Neutral, infrastructural, credible to engineers. This one must NOT look like any of the four below, because it is the layer underneath them. If it reads as a Colaberry sub-brand, it is wrong.',
  },
  {
    brand: 'colaberry-enterprise',
    name: 'Colaberry Enterprise',
    role: 'Enterprise learning and capability programs.',
    audience: 'Enterprise executives, 35 to 60.',
    feel: 'Clean, calm, authoritative. Bloomberg meets Salesforce, not consumer SaaS. This is closest to what we already ship, so treat it as the baseline to differentiate the others against.',
  },
  {
    brand: 'colaberry-training',
    name: 'Colaberry Training',
    role: 'Open enrollment classes and the free class funnel.',
    audience: 'Career changers and self-directed learners.',
    feel: 'Warmer and more encouraging than Enterprise. Same family, different temperature. You already have this one in progress.',
  },
  {
    brand: 'cpn',
    name: 'Career Pathways Network',
    role: 'The nonprofit. Scholarships, community partners, donors, scholars.',
    audience: 'Three distinct groups: scholarship applicants, church and community partners, donors and champions.',
    feel: 'Dignity and access, not charity. Separate legal entity, so it must be visually independent of Colaberry, not a recolor of it. Needs to survive sitting next to a donor pitch and a scholarship application on the same day.',
  },
  {
    brand: 'ai-flotation',
    name: 'AI Flotation',
    role: 'The build shop. Workflow intake to delivered system.',
    audience: 'Operators and owners at small and mid-size businesses.',
    feel: 'Confident, spare, technical without being cold. Sells competence, not inspiration.',
  },
];

const TOKENS = [
  ['--bg', 'Page background', 'Yes'],
  ['--bg-elevated', 'Card, panel, modal surface sitting above the page', 'Yes'],
  ['--fg', 'Primary text', 'Yes'],
  ['--fg-muted', 'Secondary text, captions, helper copy', 'Yes'],
  ['--accent', 'Primary brand color. Buttons, links, focus rings, active states', 'Yes'],
  ['--accent-contrast', 'Text color placed ON --accent. Usually white or near black', 'Yes'],
  ['--accent-soft', 'Tinted accent background for banners and highlight blocks', 'Yes'],
  ['--line', 'Borders, dividers, input outlines', 'Yes'],
  ['--success', 'Positive state', 'Yes'],
  ['--warning', 'Caution state', 'Yes'],
  ['--danger', 'Error and destructive state', 'Yes'],
];

const STORED = [
  ['brands.slug', 'Fixed by me, not chosen by you. Listed in the table above.', 'I set this'],
  ['brands.name', 'Public display name.', 'I set this'],
  ['brands.default_theme_key', 'Kebab case key that selects your theme at runtime. Give me the exact string you want.', 'You give me'],
  ['brands.default_public_url', 'Canonical public URL.', 'I set this'],
  ['brands.support_email', 'Public support address shown in footers.', 'You confirm'],
  ['brands.metadata (JSONB)', 'Where your full token payload is stored. This is the main deliverable.', 'You give me'],
  ['apps/&lt;app&gt;/src/theme', 'Per-app theme files generated from your payload. Themes are app owned.', 'I generate'],
  ['packages/ui-core', 'Shared primitives (buttons, inputs, layout). Must stay brand neutral.', 'I own'],
  ['sender_profiles', 'Per-brand email identity. Needs your header, footer and button treatment.', 'You give me'],
];

function segmentRows() {
  return SEGMENTS.map(
    (s) => `<tr>
<td style="${TD}"><strong>${s.name}</strong><br><span style="${CODE}">${s.brand}</span></td>
<td style="${TD}">${s.role}<br><span style="color:#718096">${s.audience}</span></td>
<td style="${TD}">${s.feel}</td>
</tr>`,
  ).join('');
}

function tokenRows() {
  return TOKENS.map(
    (t) => `<tr>
<td style="${TD}"><span style="${CODE}">${t[0]}</span></td>
<td style="${TD}">${t[1]}</td>
<td style="${TD}">${t[2]}</td>
</tr>`,
  ).join('');
}

function storedRows() {
  return STORED.map(
    (s) => `<tr>
<td style="${TD}"><span style="${CODE}">${s[0]}</span></td>
<td style="${TD}">${s[1]}</td>
<td style="${TD}"><strong>${s[2]}</strong></td>
</tr>`,
  ).join('');
}

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff">
<div style="font-family:arial,sans-serif;max-width:680px;margin:0 auto;padding:24px">

<h1 style="margin:6px 0 16px;font-size:20px;font-weight:800;line-height:1.35;color:#1a365d">Aleem - I need design profiles for five brand segments, and they have to land in a specific shape</h1>

<p style="${P}">Aleem,</p>

<p style="${P}">We are rebuilding the platform as a multi-brand ecosystem. One shared backend and one shared data layer, but five public brands that are commercially and in one case legally distinct. Each brand gets its own domain, its own email sending identity, and its own look. The platform resolves which brand a visitor is on and applies that brand's theme automatically.</p>

<p style="${P}">That last part is why this is not a normal "make it look nice" request. The theme has to be <strong>stored as data</strong>, not baked into a page, because the same components render for every brand. So I need your output in a structure I can save. I have listed that structure below so nothing has to be redone.</p>

<h2 style="${H2}">1. The five segments</h2>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:8px">
<tr><th style="${TH}">Brand</th><th style="${TH}">Role and audience</th><th style="${TH}">Direction</th></tr>
${segmentRows()}
</table>

<p style="${P}">Colaberry Training is the one you already have in flight: <a href="${TRAINING_TODO}" style="color:#2b6cb0">${TRAINING_TODO}</a>. Treat that as the reference example for depth and format. The other four need the same treatment.</p>

<p style="${P}">The two that need the most independence are <strong>Refactored.ai</strong> and <strong>Career Pathways Network</strong>. Refactored is the parent platform, so it cannot read as a Colaberry sub-brand. CPN is a separate legal entity with its own donors and its own compliance posture, so it cannot look like a Colaberry recolor. If a scholar, a donor and an enterprise buyer saw all five side by side, only the two Colaberry brands should look related.</p>

<h2 style="${H2}">2. Color tokens I need per brand</h2>

<p style="${P}">Every token needs <strong>two values, one for light mode and one for dark mode</strong>. The apps render in whichever the visitor's device asks for, so a brand that only works in light mode is only half built.</p>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:8px">
<tr><th style="${TH}">Token</th><th style="${TH}">What it drives</th><th style="${TH}">Light + dark</th></tr>
${tokenRows()}
</table>

<p style="${P}">Plus, per brand: heading font stack, body font stack, base type scale, corner radius, and one elevation or shadow value. If a brand should use a specific licensed typeface, flag it and tell me what the license needs, because that becomes a cost decision.</p>

<h2 style="${H2}">3. Accessibility is a hard gate, not a preference</h2>

<p style="${P}">Our target audience for the enterprise brands skews 35 to 60, and CPN will be used on cheap phones in poor lighting. Every pairing below has to hit WCAG 2.1 AA in <strong>both</strong> light and dark:</p>

<ul style="${P};padding-left:20px">
<li><span style="${CODE}">--fg</span> on <span style="${CODE}">--bg</span> and on <span style="${CODE}">--bg-elevated</span>: 4.5:1 minimum</li>
<li><span style="${CODE}">--fg-muted</span> on <span style="${CODE}">--bg</span>: 4.5:1 minimum. This is the one that usually fails</li>
<li><span style="${CODE}">--accent-contrast</span> on <span style="${CODE}">--accent</span>: 4.5:1 minimum, since that is a button label</li>
<li><span style="${CODE}">--accent</span> on <span style="${CODE}">--bg</span>: 3:1 minimum, since that is a link and a focus ring</li>
</ul>

<p style="${P}">Please send the measured ratios with the palette. If a color you love fails, I would rather see it flagged with your recommended fix than discover it in an audit later.</p>

<h2 style="${H2}">4. Email identity, which is separate from web</h2>

<p style="${P}">Each brand sends its own email from its own domain. CPN mail leaves from cpn.org, AI Flotation from aiflotation.com, and so on. The platform blocks a send if the brand's sending identity is not fully configured, so this is not optional polish. For each brand I need a header treatment, a footer treatment, a button style, and a legal footer block with the mailing address and unsubscribe line. Email clients strip most modern CSS, so these need to survive as table based HTML with inline styles.</p>

<h2 style="${H2}">5. Exactly where your work gets stored</h2>

<p style="${P}">This is the part that makes your process sync with mine. These are the fields that exist in the system today and who fills each one:</p>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:8px">
<tr><th style="${TH}">Field</th><th style="${TH}">What it holds</th><th style="${TH}">Owner</th></tr>
${storedRows()}
</table>

<h2 style="${H2}">6. Format to deliver in</h2>

<p style="${P}">One JSON object per brand, in this shape. If you hand me this, I can load it with no interpretation and no back and forth:</p>

<pre style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;font-size:12px;line-height:1.5;color:#2d3748;overflow-x:auto;margin:0 0 14px">{
  "brandSlug": "cpn",
  "themeKey": "cpn",
  "supportEmail": "scholars@cpn.org",
  "typography": {
    "heading": "...", "body": "...", "scale": "...",
    "radius": "8px", "shadow": "..."
  },
  "light": {
    "bg": "#ffffff", "bgElevated": "#f7f8fa",
    "fg": "#16181d", "fgMuted": "#5b6270",
    "accent": "#1f5f4f", "accentContrast": "#ffffff", "accentSoft": "#e8f2ef",
    "line": "#e3e6ec",
    "success": "...", "warning": "...", "danger": "..."
  },
  "dark": { "...same keys..." },
  "contrastRatios": {
    "fgOnBg": 14.2, "fgMutedOnBg": 4.8,
    "accentContrastOnAccent": 5.1, "accentOnBg": 4.4
  },
  "email": { "headerNotes": "...", "footerNotes": "...", "buttonHex": "..." }
}</pre>

<p style="${P}">Whatever visual exploration you normally do to get there is yours to run. I only need the final answer in that shape, plus whatever boards or mockups you want reviewed alongside it.</p>

<h2 style="${H2}">7. Sequence</h2>

<p style="${P}">If it helps to stage it: <strong>Refactored.ai first</strong>, because it is the parent and the other brands need to be visually distinct from it. Then CPN, because the nonprofit has the most external stakeholders waiting. Then AI Flotation. Colaberry Enterprise and Colaberry Training last, since those two already have a working look and are the least blocked.</p>

<p style="${P}">Tell me what timeline is realistic on your side and whether any of it needs budget for typefaces or stock. I have not set a date because I would rather work to your estimate than hand you one that ignores what else is on your plate.</p>

<p style="${P}">If any of the token contract above does not match how you normally work, say so and I will adapt the storage format rather than make you change your process.</p>

${SIG_HTML}
</div></body></html>`;

const TEXT = `Aleem - I need design profiles for five brand segments, and they have to land in a specific shape

Aleem,

We are rebuilding the platform as a multi-brand ecosystem. One shared backend and one
shared data layer, but five public brands that are commercially and in one case legally
distinct. Each brand gets its own domain, its own email sending identity, and its own
look. The platform resolves which brand a visitor is on and applies that brand's theme
automatically.

That last part is why this is not a normal "make it look nice" request. The theme has to
be STORED AS DATA, not baked into a page, because the same components render for every
brand. So I need your output in a structure I can save. It is listed below so nothing has
to be redone.

1. THE FIVE SEGMENTS

${SEGMENTS.map((s) => `- ${s.name} (${s.brand})
  ${s.role}
  Audience: ${s.audience}
  Direction: ${s.feel}`).join('\n\n')}

Colaberry Training is the one you already have in flight:
${TRAINING_TODO}
Treat that as the reference example for depth and format. The other four need the same
treatment.

The two that need the most independence are Refactored.ai and Career Pathways Network.
Refactored is the parent platform, so it cannot read as a Colaberry sub-brand. CPN is a
separate legal entity with its own donors and its own compliance posture, so it cannot
look like a Colaberry recolor. If a scholar, a donor and an enterprise buyer saw all five
side by side, only the two Colaberry brands should look related.

2. COLOR TOKENS I NEED PER BRAND

Every token needs TWO values, one for light mode and one for dark mode. The apps render in
whichever the visitor's device asks for, so a brand that only works in light mode is only
half built.

${TOKENS.map((t) => `  ${t[0]}  - ${t[1]}`).join('\n')}

Plus, per brand: heading font stack, body font stack, base type scale, corner radius, and
one elevation or shadow value. If a brand should use a specific licensed typeface, flag it
and tell me what the license needs, because that becomes a cost decision.

3. ACCESSIBILITY IS A HARD GATE, NOT A PREFERENCE

Our target audience for the enterprise brands skews 35 to 60, and CPN will be used on
cheap phones in poor lighting. Every pairing below has to hit WCAG 2.1 AA in BOTH light
and dark:

  --fg on --bg and on --bg-elevated: 4.5:1 minimum
  --fg-muted on --bg: 4.5:1 minimum. This is the one that usually fails
  --accent-contrast on --accent: 4.5:1 minimum, since that is a button label
  --accent on --bg: 3:1 minimum, since that is a link and a focus ring

Please send the measured ratios with the palette. If a color you love fails, I would
rather see it flagged with your recommended fix than discover it in an audit later.

4. EMAIL IDENTITY, WHICH IS SEPARATE FROM WEB

Each brand sends its own email from its own domain. CPN mail leaves from cpn.org, AI
Flotation from aiflotation.com, and so on. The platform blocks a send if the brand's
sending identity is not fully configured, so this is not optional polish. For each brand I
need a header treatment, a footer treatment, a button style, and a legal footer block with
the mailing address and unsubscribe line. Email clients strip most modern CSS, so these
need to survive as table based HTML with inline styles.

5. EXACTLY WHERE YOUR WORK GETS STORED

${STORED.map((s) => `  ${s[0].replace(/&lt;/g, '<').replace(/&gt;/g, '>')}
    ${s[1]}
    Owner: ${s[2]}`).join('\n')}

6. FORMAT TO DELIVER IN

One JSON object per brand:

{
  "brandSlug": "cpn",
  "themeKey": "cpn",
  "supportEmail": "scholars@cpn.org",
  "typography": { "heading": "...", "body": "...", "scale": "...",
                  "radius": "8px", "shadow": "..." },
  "light": { "bg": "#ffffff", "bgElevated": "#f7f8fa",
             "fg": "#16181d", "fgMuted": "#5b6270",
             "accent": "#1f5f4f", "accentContrast": "#ffffff",
             "accentSoft": "#e8f2ef", "line": "#e3e6ec",
             "success": "...", "warning": "...", "danger": "..." },
  "dark": { "...same keys..." },
  "contrastRatios": { "fgOnBg": 14.2, "fgMutedOnBg": 4.8,
                      "accentContrastOnAccent": 5.1, "accentOnBg": 4.4 },
  "email": { "headerNotes": "...", "footerNotes": "...", "buttonHex": "..." }
}

Whatever visual exploration you normally do to get there is yours to run. I only need the
final answer in that shape, plus whatever boards or mockups you want reviewed alongside it.

7. SEQUENCE

If it helps to stage it: Refactored.ai first, because it is the parent and the other brands
need to be visually distinct from it. Then CPN, because the nonprofit has the most external
stakeholders waiting. Then AI Flotation. Colaberry Enterprise and Colaberry Training last,
since those two already have a working look and are the least blocked.

Tell me what timeline is realistic on your side and whether any of it needs budget for
typefaces or stock. I have not set a date because I would rather work to your estimate than
hand you one that ignores what else is on your plate.

If any of the token contract above does not match how you normally work, say so and I will
adapt the storage format rather than make you change your process.

${SIG_TEXT}`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 10031928327, // Colaberry Training design-profile todo (Ali Personal bucket)
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'aleem@colaberry.com',
    bcc: ['ali@colaberry.com'],
    replyTo: 'ali@colaberry.com',
    subject:
      'Aleem - design profiles needed for 5 brand segments (Refactored.ai, CPN, AI Flotation, Colaberry Enterprise, Colaberry Training)',
    html: HTML,
    text: TEXT,
    bcSummary:
      '<p>Asked Aleem (Creative Director, aleem@colaberry.com) to build per-brand design profiles for the five ecosystem segments now that the multi-tenant foundation is being built: Refactored.ai (parent platform), Colaberry Enterprise, Colaberry Training (this ticket, already in flight and cited as the reference example), Career Pathways Network (nonprofit, separate legal entity), and AI Flotation.</p>' +
      '<p>The brief gives him the exact storage contract so his output syncs with the platform build: the 11 color tokens each needing a light and a dark value, typography and radius/shadow, WCAG 2.1 AA ratios he must measure and report, per-brand email identity (each brand sends from its own domain and the platform fail-closes a send when the sending identity is incomplete), and the per-brand JSON payload shape that loads straight into <code>brands.metadata</code> + <code>brands.default_theme_key</code>. Also spells out which fields Ali owns versus which Aleem supplies.</p>' +
      '<p>Recommended sequence: Refactored.ai first (parent, others differentiate against it), then CPN, then AI Flotation, then the two Colaberry brands. No deadline imposed; Aleem was asked for his own estimate plus any typeface/stock budget needs. BCC Ali.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => {
  console.error('FAIL:', e.stack || e.message);
  process.exit(1);
});
