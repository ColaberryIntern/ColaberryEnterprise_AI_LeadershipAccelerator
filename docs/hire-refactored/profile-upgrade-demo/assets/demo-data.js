/*
 * Demo data, shaped like GET /api/public/portfolios/:slug?surface=hire so the render code
 * can move into portfolio.js with the fetch swapped in. Fields marked NEW do not exist in
 * the payload yet; see PROMPT.md, "Backend".
 */
window.DEMO = {
  slug: 'kesetebirhan-delele',
  identity: {
    full_name: 'Kesetebirhan Delele',
    headline: 'AI Leadership Accelerator — QA',
    location: null,
    cohort_name: null,
    linkedin_url: 'https://www.linkedin.com/',
  },
  availability: { kind: 'open', label: 'Open to interviews' },
  signatureSlug: 'the-interview-was-in-the-inbox',
  caseStudies: [
    { slug: 'the-interview-was-in-the-inbox', title: 'The interview was in the inbox, the student still had to be told',
      summary: 'Thirty students job-hunting at once, their mail mixing interview invites with digests, receipts and rejections. The build reads the inbox and puts only the decisions in front of a person.',
      industry: 'Education', heroMetric: { value: '268 of 26,773', label: 'messages needed a human decision' },
      look: { coverImageUrl: 'assets/covers/c1-rest-can-wait.jpg', capability: 'Inbox triage', verified: true, workflowDiagram: true, decisions: 3, repositories: 1 } },
    { slug: 'every-lead-has-a-history', project: true, title: 'Every lead has a history. Make it possible to follow.',
      summary: 'Can an operator explain a lead’s current state and name its next scheduled action? A console for an admissions team’s calling system that answers both in one view.',
      industry: 'Education', heroMetric: null,
      look: { coverImageUrl: 'assets/covers/c9-every-lead.jpg', capability: 'Lead journey and traceability', verified: true, workflowDiagram: true, decisions: 3, repositories: 1 } },
    { slug: 'recovering-the-calls-the-workflow-lost', title: 'Recovering the calls the workflow lost',
      summary: 'Tracing where call-completion events went missing, and building the check that brings them back.',
      industry: 'Education', heroMetric: { value: '97%', label: 'of lost completion events resolved' },
      look: { coverImageUrl: 'assets/covers/c2-lost-calls.jpg', capability: 'Event recovery', verified: true, workflowDiagram: true, decisions: 3, repositories: 1 } },
    { slug: 'find-the-action-before-it-reaches-a-customer', title: 'Find the action before it reaches a customer',
      summary: 'A shadow-then-live gate that checks what an automated step is about to do before a customer sees it.',
      industry: 'Education', heroMetric: null,
      look: { coverImageUrl: 'assets/covers/c3-act.jpg', capability: 'Action gating', verified: true, workflowDiagram: true, decisions: 3, repositories: 1 } },
    { slug: 'the-call-was-already-over', title: 'The call was already over. The review had to be fair.',
      summary: 'A post-call review that holds every conversation to the same standard.',
      industry: 'Education', heroMetric: null,
      look: { coverImageUrl: 'assets/covers/c4-nobody-logged.jpg', capability: 'Call review', verified: true, workflowDiagram: true, decisions: 3, repositories: 1 } },
    { slug: 'the-conversation-happened', title: 'The conversation happened. The CRM needs the right record.',
      summary: 'Making sure what was said on the call is what lands in the CRM.',
      industry: 'Education', heroMetric: null,
      look: { coverImageUrl: 'assets/covers/c5-nothing-written.jpg', capability: 'CRM accuracy', verified: true, workflowDiagram: true, decisions: 3, repositories: 1 } },
    { slug: 'the-next-call-needs-a-time', title: 'The next call needs a time. And a place in the queue.',
      summary: 'Turning a promised callback into a scheduled, queued, owned task.',
      industry: 'Education', heroMetric: null,
      look: { coverImageUrl: 'assets/covers/c6-not-yet.jpg', capability: 'Scheduling', verified: true, workflowDiagram: true, decisions: 3, repositories: 1 } },
    { slug: 'the-workflow-grew', title: 'The workflow grew. So did the responsibility.',
      summary: 'As steps multiplied, every hand-off needed a clear owner.',
      industry: 'Education', heroMetric: null,
      look: { coverImageUrl: 'assets/covers/c7-who-owns.jpg', capability: 'Ownership', verified: true, workflowDiagram: true, decisions: 3, repositories: 1 } },
    { slug: 'the-call-ended', title: 'The call ended. The next step didn’t have to.',
      summary: 'When an AI voice agent finishes a call with a prospect, someone has to decide what happens next. This build routes each call by intent so the next step is decided, not guessed.',
      industry: 'Education', heroMetric: { value: '0 retries', label: 'after inconclusive calls since the cap, down from 551 before retry jobs' },
      look: { coverImageUrl: 'assets/covers/c8-next-step.jpg', capability: 'Call intent routing', verified: true, workflowDiagram: true, decisions: 3, repositories: 1 } },
  ],
  about: ['Kesetebirhan Delele has worked in AI Leadership Accelerator — QA at Colaberry Inc since April 2023.'],
  experience: [
    { title: 'Data Engineer', company: 'Colaberry Inc', when: 'Apr 2023 to Present' },
    { title: 'Power BI Developer', company: 'USAID, Family Focused HIV Prevention Project', when: 'Nov 2020 to Mar 2023' },
    { title: 'Data Analyst / Tableau Developer', company: 'FHI360', when: 'Jun 2018 to Nov 2020' },
  ],
  // NEW: the candidate's own words (studio → "About you" + "Intro video").
  intro: {
    videoSeconds: 90,
    answers: [
      { q: 'What problem do you most want to be handed?', a: '[Their answer from the candidate studio]' },
      { q: 'A time you caught something before it shipped', a: '[Their answer from the candidate studio]' },
    ],
    roles: ['[Target role]'], setups: ['[Remote / hybrid]'], start: '[date]',
  },
  // NEW: interview formats + open slots, already converted to the viewer's time zone.
  interviewFormats: [
    { id: 'intro', name: 'Intro call', minutes: 20, desc: 'Meet them, hear how they work, decide if there is a fit.' },
    { id: 'walkthrough', name: 'Case study walkthrough', minutes: 45, desc: 'They present one of their published case studies live and take your questions.' },
    { id: 'working', name: 'Working session', minutes: 60, desc: 'Bring a real problem from your team and work through it together.' },
  ],
  weeks: [
    { label: 'Nov 16 – 20', days: [
      { dow: 'Mon', date: 'Nov 16', slots: ['10:00 AM', '11:30 AM', '2:00 PM'] },
      { dow: 'Tue', date: 'Nov 17', slots: ['9:00 AM', '1:30 PM'] },
      { dow: 'Wed', date: 'Nov 18', slots: ['11:00 AM', '3:00 PM', '4:00 PM'] },
      { dow: 'Thu', date: 'Nov 19', slots: [] },
      { dow: 'Fri', date: 'Nov 20', slots: ['10:00 AM', '1:00 PM'] } ] },
    { label: 'Nov 23 – 27', days: [
      { dow: 'Mon', date: 'Nov 23', slots: ['10:00 AM', '2:00 PM'] },
      { dow: 'Tue', date: 'Nov 24', slots: ['9:30 AM', '11:00 AM', '3:30 PM'] },
      { dow: 'Wed', date: 'Nov 25', slots: ['10:00 AM'] },
      { dow: 'Thu', date: 'Nov 26', slots: [], note: 'Holiday' },
      { dow: 'Fri', date: 'Nov 27', slots: [], note: 'Holiday' } ] },
  ],
};

/* Shared helpers: escape, theme toggle (same three-state model as tokens.css). */
window.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
document.addEventListener('DOMContentLoaded', function () {
  var b = document.getElementById('themeBtn');
  if (!b) return;
  b.addEventListener('click', function () {
    var r = document.documentElement;
    r.setAttribute('data-theme', r.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
});
