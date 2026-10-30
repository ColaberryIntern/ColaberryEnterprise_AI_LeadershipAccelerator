/**
 * guestJoinPage.ts — the self-contained phone page an Open House guest lands
 * on from the deck's QR: name + email, then the live question that is on the
 * projected deck, with one tap to vote. No login link, no app.
 *
 * The pass is kept in localStorage per session (a convenience: a reload keeps
 * the guest signed in; losing it just means typing the email again, which
 * maps back to the same guest server-side). All rendering escapes text.
 */
function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function renderGuestJoinPage(sessionId: string, title: string): string {
  const sid = JSON.stringify(sessionId);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Join · ${escHtml(title)}</title>
<style>
:root{--cherry:#FB2832;--ink:#1a202c;--muted:#64748b;--line:#e8e2de;--leaf:#5BA63C}
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#0B1220;color:#fff;min-height:100vh}
.wrap{max-width:520px;margin:0 auto;padding:24px 18px 40px}
.brand{font-weight:800;letter-spacing:3px;font-size:12px;color:#ff6a71;text-transform:uppercase}
h1{font-size:26px;line-height:1.2;margin:10px 0 6px}
.sub{color:#9fb3c8;font-size:15px;line-height:1.5;margin:0 0 18px}
label{display:block;font-weight:700;font-size:14px;margin:14px 0 6px;color:#dbe6f0}
input{width:100%;font-size:17px;padding:14px;border-radius:12px;border:2px solid #27405f;background:#16233a;color:#fff}
input:focus{outline:none;border-color:var(--cherry)}
button{font:inherit}
.go{width:100%;margin-top:18px;background:var(--cherry);color:#fff;border:none;border-radius:999px;padding:16px;font-size:18px;font-weight:800}
.go:disabled{opacity:.5}
.err{color:#ffb4b4;font-weight:700;margin-top:12px;min-height:1.2em}
.card{background:#101c2e;border:1.5px solid #233650;border-radius:18px;padding:18px;margin-top:16px}
.hello{color:#9fb3c8;font-size:14px}.hello b{color:#fff}
.q{font-size:21px;font-weight:800;line-height:1.3;margin:6px 0 14px}
.opt{display:block;width:100%;text-align:left;margin:10px 0;padding:16px;border-radius:14px;border:2px solid #27405f;background:#16233a;color:#fff;font-size:17px;font-weight:700}
.opt.mine{border-color:var(--cherry);background:#3a1418}
.opt.right{border-color:#8fd16b;background:#1e4a2a}
.opt:disabled{opacity:.85}
.state{font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#ffd38a;margin-top:6px}
.wait{text-align:center;color:#9fb3c8;padding:26px 6px;font-size:16px;line-height:1.5}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--leaf);margin-right:8px;animation:p 1.4s infinite}
@keyframes p{50%{opacity:.3}}
</style></head><body><div class="wrap">
<div class="brand">Colaberry · Live</div>
<h1>${escHtml(title)}</h1>
<div id="join">
  <p class="sub">Enter your name and email to vote in tonight's live polls and enter the giveaways. No password, no link to wait for.</p>
  <form id="f" autocomplete="on">
    <label for="n">Your name</label><input id="n" name="name" autocomplete="name" required maxlength="100" placeholder="First and last name">
    <label for="e">Email</label><input id="e" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com">
    <button class="go" id="b" type="submit">Join the live session</button>
    <div class="err" id="err"></div>
  </form>
</div>
<div id="live" style="display:none">
  <div class="hello">You're in, <b id="who"></b>. Keep this page open.</div>
  <div class="card" id="panel"><div class="wait"><span class="dot"></span>Waiting for the next question…</div></div>
</div>
</div>
<script>
(function(){
  var SID = ${sid};
  var BASE = '/api/portal/sessions/' + SID;
  var KEY = 'oh-guest-' + SID;
  var saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  var pass = saved && saved.pass, name = saved && saved.name, last = '';
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function showLive(){ document.getElementById('join').style.display = 'none'; document.getElementById('live').style.display = 'block'; document.getElementById('who').textContent = name; tick(); }
  document.getElementById('f').addEventListener('submit', function(ev){
    ev.preventDefault();
    var b = document.getElementById('b'), err = document.getElementById('err');
    b.disabled = true; err.textContent = '';
    fetch(BASE + '/guest-join', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: document.getElementById('n').value, email: document.getElementById('e').value }) })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
      .then(function(x){
        b.disabled = false;
        if (!x.ok) { err.textContent = (x.d && x.d.error) || 'Could not join. Try again.'; return; }
        pass = x.d.pass; name = x.d.name;
        try { localStorage.setItem(KEY, JSON.stringify({ pass: pass, name: name })); } catch (e) {}
        showLive();
      })
      .catch(function(){ b.disabled = false; err.textContent = 'No connection. Try again.'; });
  });
  function render(s){
    var panel = document.getElementById('panel');
    var q = s.question;
    var sig = JSON.stringify(q);
    if (sig === last) return; last = sig;
    if (!q) { panel.innerHTML = '<div class="wait"><span class="dot"></span>Waiting for the next question…<br><small>' + esc(s.title || '') + '</small></div>'; return; }
    var state = q.revealed ? 'Results are on the big screen' : q.locked ? 'Voting is locked' : (q.my_choice != null ? 'Vote counted. You can change it until it locks.' : 'Tap your answer');
    panel.innerHTML = '<div class="q">' + esc(q.q) + '</div>' + q.options.map(function(o, k){
      var cls = 'opt' + (q.my_choice === k ? ' mine' : '') + (q.revealed && q.answer === k ? ' right' : '');
      return '<button class="' + cls + '" data-k="' + k + '"' + (q.locked ? ' disabled' : '') + '>' + String.fromCharCode(65 + k) + '. ' + esc(o) + '</button>';
    }).join('') + '<div class="state">' + esc(state) + '</div>';
    panel.querySelectorAll('.opt').forEach(function(btn){
      btn.addEventListener('click', function(){
        var k = Number(btn.getAttribute('data-k'));
        fetch(BASE + '/guest-vote', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Guest-Pass': pass },
          body: JSON.stringify({ poll_key: q.key, choice: k }) }).then(function(){ last = ''; tick(); }).catch(function(){});
      });
    });
  }
  function tick(){
    if (!pass) return;
    fetch(BASE + '/guest-state', { headers: { 'X-Guest-Pass': pass } })
      .then(function(r){
        if (r.status === 401) { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); return null; }
        return r.ok ? r.json() : null;
      })
      .then(function(d){ if (d) render(d); }).catch(function(){});
  }
  setInterval(tick, 2000);
  if (pass && name) showLive();
})();
</script></body></html>`;
}
