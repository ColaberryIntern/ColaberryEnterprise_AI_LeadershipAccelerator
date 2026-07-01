/* Open House Marketing Hub · shared behavior
   Linked by index.html and every docs/*.html. Safe to load on any page. */
(function () {
  "use strict";

  // ---- Mermaid: brand theme, render on load ----
  function initMermaid() {
    if (!window.mermaid) return;
    var css = getComputedStyle(document.documentElement);
    var v = function (n, f) { return (css.getPropertyValue(n) || f).trim(); };
    try {
      window.mermaid.initialize({
        startOnLoad: true,
        securityLevel: "loose",
        theme: "base",
        fontFamily: v("--font-body", "Roboto, sans-serif"),
        themeVariables: {
          primaryColor: v("--blue-50", "#EAF2F6"),
          primaryBorderColor: v("--blue-500", "#367895"),
          primaryTextColor: v("--text-strong", "#1A1A1A"),
          lineColor: v("--neutral-400", "#B4B4B4"),
          secondaryColor: v("--green-50", "#F1F9EA"),
          tertiaryColor: v("--red-50", "#FFF0F1"),
          fontSize: "14px"
        }
      });
    } catch (e) { /* no-op */ }
  }

  // ---- Copy-to-clipboard for .copy-btn (copies sibling .copytext) ----
  function wireCopy() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".copy-btn");
      if (!btn) return;
      var block = btn.closest(".copyblock");
      var txt = block && block.querySelector(".copytext");
      if (!txt) return;
      var content = txt.innerText;
      var done = function () {
        var old = btn.textContent; btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = old; }, 1400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(content).then(done, done);
      } else {
        var ta = document.createElement("textarea");
        ta.value = content; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (err) {}
        document.body.removeChild(ta); done();
      }
    });
  }

  // ---- Active nav highlight via IntersectionObserver on .section[id] ----
  function wireActiveNav() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".rail a.nav[href^='#']"));
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          links.forEach(function (a) { a.classList.remove("active"); });
          map[en.target.id].classList.add("active");
        }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) obs.observe(el);
    });
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () { initMermaid(); wireCopy(); wireActiveNav(); });
})();
