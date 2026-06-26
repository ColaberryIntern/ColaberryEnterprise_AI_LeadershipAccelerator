/* ============================================================
   Colaberry Knowledge Base - Design domain data
   Sourced from the Colaberry Design System repo
   (github.com/aleemcolaberry/colaberry-design-system), mirrored
   into design/. Grounded in BRAND.md, readme.md, SKILL.md.
   Schema: { categories:[{key,title}], qa:[{category,q,a,detail?,tags,ref?,refLabel?}] }
   Voice: warm, sentence case, no emoji, no em-dash.
   ============================================================ */
window.DESIGN_DATA = {
  categories: [
    { key: "overview",   title: "Overview & architecture" },
    { key: "color",      title: "Color" },
    { key: "typography", title: "Typography" },
    { key: "logo",       title: "Logo" },
    { key: "icons",      title: "Iconography" },
    { key: "components", title: "Components" },
    { key: "templates",  title: "Templates & UI kits" },
    { key: "motion",     title: "Motion" },
    { key: "a11y",       title: "Accessibility" },
    { key: "voice",      title: "Voice" },
    { key: "usage",      title: "Using & prompting it" },
    { key: "roadmap",    title: "Roadmap & governance" }
  ],
  qa: [
    // overview
    { category:"overview", tags:["what","overview","executable","design system"], ref:"design/readme.md", refLabel:"Repo readme",
      q:"What is the Colaberry Design System?",
      a:"It is the brand turned into an executable UI language. The same tokens, colors, and components shown in the docs are the code that ships to production, so humans, developers, and AI agents all read from one source. Change a token and every surface updates.",
      detail:"It is a running, branded system, not a static style guide. Live docs are in design-system.html." },
    { category:"overview", tags:["who","owner","aleem","claude","built"], ref:"design/readme.md", refLabel:"Repo readme",
      q:"Who owns it and how was it built?",
      a:"Brand, design direction, and review are owned and directed by the designer, Mohammad Abdul Aleem (AI/UX Designer and Analyst). Claude ran as the executing agent for each step, from tracing the logo to building the tokens, components, and living docs." },
    { category:"overview", tags:["source of truth","where","github","repo"], ref:"design/design-system.html", refLabel:"Design system guide",
      q:"Where does the design system live and what is the source of truth?",
      a:"The repo is github.com/aleemcolaberry/colaberry-design-system, mirrored here under the design section. BRAND.md plus the assets folder are the designer source of truth; the living guide is design-system.html; the agent entry point is the colaberry-design skill (SKILL.md)." },
    { category:"overview", tags:["architecture","layers","design","code","agent"], ref:"design/readme.md", refLabel:"Repo readme",
      q:"What is the three-layer architecture?",
      a:"Design layer: BRAND.md plus assets (logo, fonts), where the designer edits. Code layer: styles.css, the tokens files, and the components bundle a developer imports. Agent layer: SKILL.md, the living docs, and IMPLEMENTATION.md, which an AI agent reads to generate on-brand UI." },
    { category:"overview", tags:["tokens","count","tokens.json"], ref:"design/design-system.html", refLabel:"Design system guide",
      q:"How many design tokens are there?",
      a:"245 design tokens, light and dark, each a semantic CSS variable. They are exported as tokens.json for Style Dictionary, Figma Tokens, or Tailwind." },
    { category:"overview", tags:["license","mit","fonts"], ref:"design/readme.md", refLabel:"Repo readme",
      q:"What license is it under?",
      a:"Source code is MIT. Roboto and Roboto Mono use Apache License 2.0; Quicksand uses the SIL Open Font License 1.1. The Colaberry logo and brand assets are owned by Colaberry; use outside Colaberry needs permission." },

    // color
    { category:"color", tags:["colors","palette","cherry","leaf","berry","hex"], ref:"design/design-system.html#colors", refLabel:"Color tokens",
      q:"What are the brand colors?",
      a:"Cherry red #FB2832 is the primary action color and the constant accent. Leaf green #77BB4A is growth and the secondary. Berry blue #367895 is trust, links, and the wordmark.",
      detail:"Each has a 10-step ramp plus semantic aliases. The cherry accent never changes across light and dark." },
    { category:"color", tags:["semantic tokens","how to use","no hex"], ref:"design/design-system.html#colors", refLabel:"Color tokens",
      q:"How do I use color correctly?",
      a:"Always reference semantic tokens like --brand-accent, --surface-page, --text-strong, and --border-default, never raw hex ramp values. The semantic layer is what adapts across themes." },
    { category:"color", tags:["dark mode","theme"], ref:"design/design-system.html#colors", refLabel:"Color tokens",
      q:"Is there a dark mode?",
      a:"Yes. Set data-theme=\"dark\" on the html element. The foreground inverts with the background and the cherry accent stays constant; green and blue are nudged lighter for contrast." },
    { category:"color", tags:["charts","data viz","palette","color-blind"], ref:"design/design-system.html#colors", refLabel:"Color tokens",
      q:"What palette should charts use?",
      a:"Use the dedicated data-visualization palette, never raw brand ramps for series. Categorical: --chart-1 through --chart-8 in order, tuned for adjacent separation and color-blind safety. Sequential: --seq-1 to --seq-6. Diverging: --div-neg-2 through --div-pos-2. All adapt in dark mode." },

    // typography
    { category:"typography", tags:["fonts","roboto","quicksand","mono"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"What fonts does the brand use?",
      a:"Roboto for display (Bold) and body (Regular). Roboto Mono for code, metrics, and tabular data. Quicksand for the logotype only, never for UI." },
    { category:"typography", tags:["type scale","sizes","h1","body"], ref:"design/design-system.html", refLabel:"Design system guide",
      q:"What is the type scale?",
      a:"H1 48, H2 36, H3 28, H4 22, body 18, caption 14." },
    { category:"typography", tags:["dont","substitutes","inter","arial"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"Are there any type don'ts?",
      a:"Do not substitute Inter or Arial for Roboto in final work, and do not set the wordmark in any font other than Quicksand." },

    // logo
    { category:"logo", tags:["logo","mark","wordmark","cherries"], ref:"design/design-system.html", refLabel:"Design system guide",
      q:"What is the logo?",
      a:"The mark is two cherries on a shared stem forming the C of Colaberry, signaling growth, pairs, and collaboration. The wordmark sets olaberry in Quicksand with a green to blue gradient. Files live in assets/logo, including color, mono-white, and mono-black marks plus a full favicon, app-icon, and OG export set." },
    { category:"logo", tags:["inversion","white mark","background"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"What is the logo inversion rule?",
      a:"Foreground inverts with the background; the cherry red stays constant. Light background: full-color or black mark. Dark, photo, or cherry background: the white mark." },
    { category:"logo", tags:["clear space","minimum size"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"What are the clear space and minimum size rules?",
      a:"Keep clear space equal to the cherry-mark height on all sides. Minimum size is 120px wide for the horizontal lockup and 24px for the mark alone." },
    { category:"logo", tags:["dont","recolor","gradient"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"What are the logo don'ts?",
      a:"Never recolor the cherries, never add gradients or shadows to the mark, and never re-set the wordmark in another font." },

    // icons
    { category:"icons", tags:["icons","remixicon","lucide","cb-i","emoji"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"What icon set do we use?",
      a:"RemixIcon is the standard set, loaded automatically via styles.css. Prefer the -line style to match the soft 2px brand look, and use -fill for emphasis. Lucide SVG icons are also supported inside the same wrapper. Never use emoji.",
      detail:"The colaberry-design skill notes Lucide as an option; BRAND.md sets RemixIcon as the default." },
    { category:"icons", tags:["cb-i","tile","alignment","how to"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"How do I place an icon correctly?",
      a:"Wrap every icon in the .cb-i primitive, which guarantees a centered 1em box with no baseline gap; size it with font-size and color via currentColor. For a colored container, use .cb-icon-tile and resize with --tile." },

    // components
    { category:"components", tags:["components","list","primitives","20"], ref:"design/design-system.html#components", refLabel:"Live components",
      q:"What components are available?",
      a:"Twenty accessible primitives: Accordion, Avatar, Badge, Breadcrumb, Button, Card, Carousel, Checkbox, Dialog, Drawer, Input, Pagination, Popover, Progress, Skeleton, Switch, Table, Textarea, Toast, and Tooltip. All are live and interactive in the docs." },
    { category:"components", tags:["use","code","bundle","window"], ref:"design/IMPLEMENTATION.md", refLabel:"Implementation guide",
      q:"How do I use the components in code?",
      a:"Link styles.css for tokens and fonts, then load _ds_bundle.js. The components are exposed on window.ColaberryDesignSystem_098454. Reference semantic tokens, support dark mode with data-theme, and follow IMPLEMENTATION.md for plain HTML, React, Vite, or Next." },
    { category:"components", tags:["component files","types","prompt","docs"], ref:"design/design-system.html#components", refLabel:"Live components",
      q:"What does each component ship with?",
      a:"Each primitive ships as a .jsx component plus a .d.ts type file, a .prompt.md usage prompt, and a live card in the docs. Props are documented in the type file; usage is in the prompt file." },

    // templates
    { category:"templates", tags:["templates","starting points","brochure","one-pager","slide"], ref:"design/readme.md", refLabel:"Repo readme",
      q:"What ready-made templates exist?",
      a:"Fork-ready templates grouped by use case: Web (web page), Social (social post), Deck (deck slide), Print (brochure, one-pager, comparison sheet, certificate), Sales (case study, proposal or quote, business card), Email (email newsletter), and Event (event poster, standee). A WhatsApp kit and program-page template are also included." },
    { category:"templates", tags:["ui kit","marketing website","home","program","enroll"], ref:"design/ui_kits/marketing-website/index.html", refLabel:"Marketing website kit",
      q:"Is there a UI kit?",
      a:"Yes, a marketing-website UI kit with Home, Program, and Enroll screens, composed only from the components. It doubles as a worked example of the system in use." },

    // motion
    { category:"motion", tags:["motion","principles","functional"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"What are the motion principles?",
      a:"Motion is functional, not decorative: it confirms an action, guides the eye, or softens a change. It is purposeful, quick (140 to 360ms), gentle (ease-out), and accessible. Never use linear easing or hard bounces, and wrap non-essential motion so it collapses under prefers-reduced-motion." },
    { category:"motion", tags:["tokens","easing","duration"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"What motion tokens exist?",
      a:"Easing: --ease-out (default), --ease-emphasized (big moments), --ease-spring (confirmations), --ease-in (exits), --ease-in-out, and --ease-standard. Duration: --dur-instant 90ms, --dur-fast 140ms, --dur-base 220ms, --dur-slow 360ms, --dur-slower 560ms. Recipes include fade-and-rise enter, staggered sequences, overlay scale, spring confirm, shimmer loading, and fade-and-fall exit." },

    // a11y
    { category:"a11y", tags:["accessibility","wcag","contrast","focus"], ref:"design/design-system.html#a11y", refLabel:"WCAG audit",
      q:"What are the accessibility rules?",
      a:"Built to WCAG 2.2. Body text on white uses neutral-800 (13.6:1) or text-muted (5.3:1). Links use blue-600 (6.0:1). Green text uses green-700 or darker. Cherry and leaf are accent and large-text colors only, never small body text. Every interactive element shows a visible 3px berry-blue focus ring." },
    { category:"a11y", tags:["audit","where","keyboard","touch"], ref:"design/design-system.html#a11y", refLabel:"WCAG audit",
      q:"Where is the contrast audit?",
      a:"In the living docs at design-system.html under the accessibility section. It covers the WCAG 2.2 contrast audit plus guidance beyond contrast: keyboard, focus, touch targets, and semantics." },

    // voice
    { category:"voice", tags:["voice","tone","sentence case","no emoji","proof"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"What is the brand voice?",
      a:"Warm and credible. Sentence case. Speak to you. Lead with proof, such as 5,000+ careers since 2012. Use friendly action CTAs like Apply now and Enroll today. No emoji in product or web. Reinforce inclusivity: no degree or tests required, scholarships, and veterans support." },

    // usage
    { category:"usage", tags:["install","link","styles.css","bundle"], ref:"design/IMPLEMENTATION.md", refLabel:"Implementation guide",
      q:"How do I install it in a project?",
      a:"Add the stylesheet and component bundle: link styles.css for tokens and fonts, then load _ds_bundle.js for the components. Reference semantic tokens like var(--brand-accent), and set data-theme=\"dark\" for dark mode. Full steps for plain HTML, React, Vite, and Next are in IMPLEMENTATION.md." },
    { category:"usage", tags:["run","local","no build","serve"], ref:"design/readme.md", refLabel:"Repo readme",
      q:"How do I run it locally?",
      a:"There is no build step; any static server works. Clone the repo and run npm start, which serves the folder. Open index.html for the landing page or design-system.html for the full living system." },
    { category:"usage", tags:["prompt","marketing","non-technical","claude"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"How should a marketer prompt Claude to use the system?",
      a:"Start with: Using the Colaberry design system, then answer four things: what you want (post, flyer, email header, slide), the size if it matters, the words (headline, subtext, CTA), and the vibe or program. Ask for 3 options. Claude returns a downloadable HTML file; you never touch code." },
    { category:"usage", tags:["prompt","developer","components","tokens"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"How should a developer prompt Claude to use the system?",
      a:"Tell Claude to link styles.css, use the design-system components from window.ColaberryDesignSystem_098454, reference semantic tokens rather than raw hex, support dark mode, and honor the accessibility rules. Start the prompt with: Using the Colaberry design system." },
    { category:"usage", tags:["non-technical","marketer","plain english"], ref:"design/BRAND.md", refLabel:"Brand guide",
      q:"Can a non-technical marketer use it?",
      a:"Yes. Ask in plain English and Claude hands back a finished HTML file you can preview and download, such as a social post, flyer, email header, one-pager, slide, or ad. Name the lead brand color (cherry for energy, leaf for growth, berry for trust), keep the voice warm and emoji-free, and ask for options to choose from." },

    // roadmap
    { category:"roadmap", tags:["roadmap","next","npm","manifest","mcp"], ref:"design/readme.md", refLabel:"Repo readme",
      q:"What is coming next for the design system?",
      a:"The 30-day foundation shipped. Next at 60 days: a Storybook, a publishable @colaberry/design-system npm package, a machine-readable LLM component manifest, self-hosted fonts, and a second UI kit. At 90 days: an MCP server exposing the manifest so any Claude session can pull the system in-IDE, quality gates, a contribution workflow, and a first product integration." },
    { category:"roadmap", tags:["quality gates","lint","a11y","review"], ref:"design/readme.md", refLabel:"Repo readme",
      q:"What are the quality gates?",
      a:"Five gates: token lint (catches hardcoded hex or spacing), accessibility with axe (contrast, focus, labels), visual regression (UI drift), security (unsafe inputs, vulnerable deps), and designer signoff in PR review (pattern fit and UX intent)." }
  ]
};
