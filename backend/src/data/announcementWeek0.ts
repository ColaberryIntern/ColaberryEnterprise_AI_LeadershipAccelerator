/**
 * announcementWeek0 — the hand-authored, LOCKED Week 0 announcement content
 * ("Welcome to Your Free AI Preview"). Week 0 is the free lead-magnet tier; its
 * copy is fixed marketing (approved by Ali 2026-07-19) and deliberately has NO
 * time budget, so it is stored here and LOCKED on the card (metadata.locked) so
 * it never auto-regenerates or drifts. Weeks 1+ instead generate live from
 * ANNOUNCEMENT_GENERATION_PROMPT. Applied by scripts/setupAnnouncementCards.ts.
 */
export const ANNOUNCEMENT_WEEK0 = {
  title: 'Welcome to Your Free AI Preview',
  summary: "Your free week of AI is here. See everything you'll explore, meet your AI Mentor, and say hello to the community.",
  questions: [] as string[],
  reflection: '',
  body_html: `
<style>
  :root{ --ink:#1A1A1A; --muted:#5b6772; --line:#e7e3da; --teal:#2a7d8c; --teal-soft:#e8f3f5; --indigo:#4c5bd4; --band:#f7f5f0; }
  body{background:#fbfaf7}
  .hero{background:linear-gradient(135deg,#2a7d8c 0%,#4c5bd4 100%);color:#fff;border-radius:16px;padding:22px 20px;margin:2px 0 18px}
  .hero .wave{font-size:30px;line-height:1;margin-bottom:6px}
  .hero h1{color:#fff;font-size:20px;margin:0 0 8px;line-height:1.25}
  .hero p{margin:0;color:#eaf6f8;font-size:14px;line-height:1.55}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 22px}
  .chip{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:7px 12px;font-size:12.5px;font-weight:600;color:#37424c}
  .chip .n{color:var(--teal)}
  .eyebrow{font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--teal);margin:0 0 8px}
  .band{background:var(--band);border-radius:14px;padding:16px;margin:0 0 18px}
  .band p{margin:0 0 8px} .band p:last-child{margin-bottom:0}
  .explore{display:flex;flex-direction:column;gap:10px;margin:2px 0 20px}
  .item{display:flex;gap:12px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 13px}
  .item .ic{font-size:22px;line-height:1.1;flex:none;width:30px;text-align:center}
  .item h3{margin:0 0 3px;font-size:14px} .item p{margin:0;font-size:12.8px;color:var(--muted);line-height:1.5}
  .mentor{background:var(--teal-soft);border:1px solid #cfe6ea;border-radius:14px;padding:16px;margin:0 0 18px}
  .mentor h3{margin:0 0 6px;font-size:15px;color:#155e6b} .mentor p{margin:0 0 4px;font-size:13px;color:#2c5560;line-height:1.55}
  .mentor ul{list-style:none;padding:0;margin:10px 0 0;display:flex;flex-direction:column;gap:7px} .mentor li{display:flex;gap:9px;align-items:flex-start;font-size:12.8px;color:#2c5560;line-height:1.45} .mentor li .ic{flex:none}
  .res{margin:0 0 20px} .res ul{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-direction:column;gap:8px}
  .res li{display:flex;gap:9px;align-items:flex-start;font-size:13px} .res li .ic{flex:none}
  .next{background:linear-gradient(135deg,#f4ecda 0%,#e9eefc 100%);border-radius:14px;padding:18px 16px;margin:0 0 18px;text-align:center}
  .next h3{margin:0 0 8px;font-size:16px;color:#3a3320} .next p{margin:0 auto;font-size:13.5px;color:#4a4636;line-height:1.6;max-width:36ch}
  .next .eco{font-weight:700;color:var(--indigo)}
  .talk{background:#fff;border:1px dashed var(--teal);border-radius:14px;padding:16px;text-align:center}
  .talk h3{margin:0 0 6px;font-size:15px;color:var(--teal)} .talk p{margin:0;font-size:13px;color:var(--muted);line-height:1.55}
</style>
<div class="hero"><div class="wave">👋</div><h1>Welcome to Your Free AI Preview</h1><p>You just stepped into the world of AI, and this week is on us. Explore, get curious, and see what AI can really do for your work. 🎉</p></div>
<div class="chips"><span class="chip">🆓 <span class="n">100% Free</span></span><span class="chip">♾️ <span class="n">Always fresh</span></span><span class="chip">🧭 <span class="n">Start here</span></span><span class="chip">🤖 <span class="n">AI Mentor included</span></span></div>
<div class="band"><p class="eyebrow">🤝 Our promise</p><p>At Colaberry, we are <strong>dedicated to teaching and leading in AI</strong>. Every one of the basics, what AI is, how to talk to it, and where it helps, can be learned right here in this free preview.</p><p>No jargon. No pressure. Just a friendly, hands-on taste of the journey. 🌱</p></div>
<p class="eyebrow">✨ What you'll explore</p>
<div class="explore">
  <div class="item"><div class="ic">🎬</div><div><h3>Real stories</h3><p>Short testimonials from people who changed their careers with AI.</p></div></div>
  <div class="item"><div class="ic">🎧</div><div><h3>A quick podcast</h3><p>Big AI ideas made simple. Listen on your commute.</p></div></div>
  <div class="item"><div class="ic">📰</div><div><h3>Blog explainers</h3><p>Plain-English reads that demystify how AI actually works.</p></div></div>
  <div class="item"><div class="ic">▶️</div><div><h3>Micro-videos</h3><p>Bite-size lessons you can finish in a few minutes.</p></div></div>
  <div class="item"><div class="ic">💡</div><div><h3>Small learnings</h3><p>Quick "aha" moments that build real AI confidence.</p></div></div>
  <div class="item"><div class="ic">✅</div><div><h3>Quick quizzes</h3><p>Painless checks that make the ideas stick.</p></div></div>
  <div class="item"><div class="ic">♾️</div><div><h3>Always more</h3><p>New stories, reads, and lessons keep landing in your feed, so there's always something fresh to explore.</p></div></div>
</div>
<div class="band"><p class="eyebrow">🌍 You're in the AI world now</p><p>Beyond the lessons, fresh <strong>articles, blogs, podcasts, and real opportunities</strong> keep landing in your feed. There's always something new to scroll, so you keep learning even when you're just exploring. ♾️</p></div>
<div class="mentor"><h3>🖥️ Meet your Workspace</h3><p>Open any lesson and it becomes your <strong>Workspace</strong>, your own space to learn, think, and build. It's where you go to <strong>meet your AI Mentor Agent</strong> 🤖, a personal guide who coaches you (never just hands you the answer), helps you get unstuck, and goes as deep as you want on any topic.</p><p>Everything sits together in one place:</p><ul>
  <li><span class="ic">🤖</span><span><strong>AI Mentor Agent</strong>, your always-on coach</span></li>
  <li><span class="ic">💬</span><span><strong>Community</strong>, comment and learn alongside others</span></li>
  <li><span class="ic">📊</span><span><strong>Your progress</strong>, see how far you've come</span></li>
</ul></div>
<div class="res"><p class="eyebrow">🧰 Everything at your fingertips</p><ul>
  <li><span class="ic">📚</span><span>A growing library of articles, blogs &amp; podcasts</span></li>
  <li><span class="ic">♾️</span><span>A never-ending feed of fresh AI content to explore</span></li>
  <li><span class="ic">🧭</span><span>A clear path toward becoming an AI Systems Architect</span></li>
</ul></div>
<div class="next"><h3>🚀 Where this can take you</h3><p>Like what you see? We can take you all the way down the AI journey. An affordable monthly membership unlocks our <span class="eco">entire AI ecosystem</span>: training, projects, certifications, internships, and more.</p></div>
<div class="talk"><h3>💬 Join the conversation</h3><p>Say hi and tell us what you're hoping to learn! Your comment is visible to the whole community, and it's the best way to meet fellow explorers. 👇</p></div>
`,
};
