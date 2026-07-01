/* ============================================================
   Colaberry Knowledge Base - Compliance & Trust domain data
   PUBLIC-SAFE, institution-trust facts ONLY. This file is
   deliberately conservative because the hub deploys to a public
   URL.
   INCLUDED: Colaberry's established track record, the TWC
   Certificate of Approval that the Colaberry School of Data
   Analytics holds (code U5306), student protections, and honest
   disclosure values.
   EXCLUDED ON PURPOSE (internal / in-flux, do NOT publish):
   any claim about the AI Systems Architect Accelerator's own TWC
   status, the exemption-determination request, the membership-as-
   tuition legal argument, counsel/ownership, and internal dates or
   document references. The AI Accelerator is NOT stated to be
   TWC-approved here, because that is being determined.
   Grounded in twc-compliance-status memory + brand voice.
   Schema: { categories:[{key,title}], qa:[{category,q,a,detail?,tags}] }
   Voice: warm, sentence case, no emoji, no em-dash.
   ============================================================ */
window.COMPLIANCE_DATA = {
  categories: [
    { key: "credentials",  title: "Credentials & regulation" },
    { key: "track-record", title: "Track record" },
    { key: "students",     title: "Student protections & support" },
    { key: "transparency", title: "How we communicate" }
  ],
  qa: [
    // credentials
    { category:"credentials", tags:["accredited","regulated","twc","coa","u5306"],
      q:"Is Colaberry a regulated school?",
      a:"Yes. Colaberry operates as a regulated Texas career school. The Colaberry School of Data Analytics holds a Texas Workforce Commission Certificate of Approval, school code U5306, first approved in 2018 and renewed since. Colaberry is an established institution, not a pop-up bootcamp.",
      detail:"The Certificate of Approval covers the data analytics school and its programs; it is the foundation of credibility the AI Systems Architect Accelerator is built on." },
    { category:"credentials", tags:["who regulates","texas workforce commission","oversight"],
      q:"Who regulates career schools like Colaberry in Texas?",
      a:"The Texas Workforce Commission, through its Career Schools and Colleges program, oversees licensed career schools in Texas, including reporting and student-protection requirements. Colaberry's data analytics school is approved under that framework." },

    // track-record
    { category:"track-record", tags:["track record","5000","careers","2012","proof"],
      q:"What is Colaberry's track record?",
      a:"Colaberry has helped launch more than 5,000 careers since 2012. That track record, built over more than a decade, is the foundation the AI Systems Architect Accelerator stands on, not a single new course." },
    { category:"track-record", tags:["how long","since 2012","established"],
      q:"How long has Colaberry been operating?",
      a:"Since 2012. Over more than a decade Colaberry has built and run career programs and the regulated data analytics school behind them." },

    // students
    { category:"students", tags:["barriers","no degree","scholarships","veterans","access"],
      q:"Who can join, and are there barriers to entry?",
      a:"No degree and no tests are required to begin. Colaberry is built around access, with scholarships and support for veterans, so motivated people can start regardless of background." },
    { category:"students", tags:["protections","disclosure","costs up front"],
      q:"How are students protected?",
      a:"As a regulated Texas career school, Colaberry operates under student-protection and reporting requirements. We also disclose costs up front, including the third-party tool costs you pay directly to providers, so there are no surprises after you enroll." },

    // transparency
    { category:"transparency", tags:["claims","honesty","proof","no invented facts"],
      q:"How does Colaberry decide what it claims publicly?",
      a:"We lead with proof and we do not invent facts, metrics, or outcomes. Where a detail is still being finalized, we say so plainly rather than state it as final." },
    { category:"transparency", tags:["refund","cancellation","terms","drafted","not final"],
      q:"Are the refund and cancellation terms final?",
      a:"Not yet. The specific refund and cancellation terms are drafted and pending final approval, so we do not quote them as final. Ask at the Open House for the current terms before you enroll." }
  ]
};
