/* Colaberry DS landing — Three.js hero + GSAP choreography.
   Motion tiers:
   - FULL  (motion OK, rAF alive): masked headline, parallax, scrubs, counters, pin.
   - LITE  (reduced motion, rAF alive): opacity-only fades — reduce, don't remove.
   - STATIC (rAF unavailable, e.g. hidden iframe): final states, zero tweens. */
(function () {
  'use strict';
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Toast ---------- */
  var toastEl = document.getElementById('ltoast');
  var toastT;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 1500);
  }

  /* ---------- Nav scrolled state ---------- */
  var nav = document.querySelector('.lnav');
  function onScroll() { if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 10); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Color ramps (generated) ---------- */
  var RAMPS = [
    { name: 'Cherry Red', base: '#FB2832', hex: ['#FFF0F1','#FFDBDD','#FFB8BC','#FE8A90','#FD5760','#FB2832','#E5121D','#C20E1E','#9B0E18','#7A1016'] },
    { name: 'Leaf Green', base: '#77BB4A', hex: ['#F1F9EA','#DEF0CC','#C2E3A1','#A2D375','#8AC759','#77BB4A','#5BA63C','#468A2E','#356A24','#2A521E'] },
    { name: 'Berry Blue', base: '#367895', hex: ['#EAF2F6','#CFE0E9','#A6C5D5','#6F9DB6','#4A86A2','#367895','#2E6A86','#265A72','#20485C','#1A3947'] }
  ];
  var rampsRoot = document.getElementById('ramps');
  if (rampsRoot) {
    RAMPS.forEach(function (r) {
      var block = document.createElement('div');
      block.className = 'lr-block';
      var name = document.createElement('div');
      name.className = 'lr-name';
      name.innerHTML = '<b>' + r.name + '</b><code>' + r.base + '</code>';
      var ramp = document.createElement('div');
      ramp.className = 'lr-ramp';
      r.hex.forEach(function (h) {
        var b = document.createElement('button');
        b.className = 'lr-sw';
        b.style.background = h;
        b.setAttribute('aria-label', 'Copy ' + h);
        b.dataset.hex = h;
        ramp.appendChild(b);
      });
      block.appendChild(name);
      block.appendChild(ramp);
      rampsRoot.appendChild(block);
    });
    rampsRoot.addEventListener('click', function (e) {
      var sw = e.target.closest('.lr-sw');
      if (!sw) return;
      if (navigator.clipboard) navigator.clipboard.writeText(sw.dataset.hex);
      toast('Copied ' + sw.dataset.hex);
    });
  }

  /* ---------- Copy snippets ---------- */
  var SNIPS = {
    prompt: 'Using the Colaberry design system, create a [social post / flyer / email header / slide] at [size] for [topic]. Headline: [your headline]. Add a [call-to-action] button and the logo. Keep it warm and on-brand, no emoji — and give me 3 options.',
    install: '<link rel="stylesheet" href="colaberry/styles.css">\n<scr' + 'ipt src="colaberry/_ds_bundle.js"></scr' + 'ipt>\n/* var(--brand-accent) · window.ColaberryDesignSystem_098454 */'
  };
  document.querySelectorAll('[data-snip]').forEach(function (el) {
    el.addEventListener('click', function () {
      var t = SNIPS[el.dataset.snip] || '';
      if (navigator.clipboard) navigator.clipboard.writeText(t);
      toast('Copied to clipboard');
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
  });

  /* ---------- Switch demo ---------- */
  document.querySelectorAll('.r-switch').forEach(function (s) {
    s.addEventListener('click', function () {
      s.setAttribute('aria-checked', s.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    });
  });

  /* ---------- Card tilt (fine pointers, motion OK) ---------- */
  if (!RM && window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.cmp-card').forEach(function (c) {
      c.addEventListener('pointermove', function (e) {
        var r = c.getBoundingClientRect();
        var rx = ((e.clientY - r.top) / r.height - 0.5) * -5;
        var ry = ((e.clientX - r.left) / r.width - 0.5) * 5;
        c.style.transform = 'perspective(900px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateY(-3px)';
      });
      c.addEventListener('pointerleave', function () { c.style.transform = ''; });
    });
  }

  /* ---------- Interactive data constellation (canvas 2D) ---------- */
  function initHeroFx() {
    var canvas = document.getElementById('hero-fx');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var hero = document.querySelector('.hero');

    // Brand palette (cherry / leaf / berry + tints), weighted toward cherry
    var PAL = ['#FB2832', '#FB2832', '#77BB4A', '#367895', '#FD5760', '#8AC759', '#4A86A2'];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var nodes = [];
    var ripples = [];
    var pointer = { x: -9999, y: -9999, active: false };

    function rgba(hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    function build() {
      var r = canvas.getBoundingClientRect();
      W = r.width || canvas.clientWidth || (hero ? hero.clientWidth : 0) || window.innerWidth;
      H = r.height || canvas.clientHeight || (hero ? hero.clientHeight : 0) || window.innerHeight;
      if (!W || !H) return false;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // density scales with area, capped for performance
      var count = Math.max(28, Math.min(110, Math.round((W * H) / 15000)));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: 1.6 + Math.random() * 2.6,
          c: PAL[(Math.random() * PAL.length) | 0],
          tw: Math.random() * Math.PI * 2 // twinkle phase
        });
      }
      return true;
    }

    var LINK = 132;      // node-to-node link distance
    var MOUSE = 188;     // cursor influence radius

    function draw(t) {
      if (!W || !H || !nodes.length) return;
      ctx.clearRect(0, 0, W, H);

      // update + integrate ripple forces
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.x += n.vx; n.y += n.vy;
        // gentle wrap
        if (n.x < -20) n.x = W + 20; else if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20; else if (n.y > H + 20) n.y = -20;

        // cursor: soft attraction so the web gathers toward the pointer
        if (pointer.active) {
          var dx = pointer.x - n.x, dy = pointer.y - n.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < MOUSE * MOUSE) {
            var d = Math.sqrt(d2) || 1;
            var f = (1 - d / MOUSE) * 0.45;
            n.vx += (dx / d) * f * 0.06;
            n.vy += (dy / d) * f * 0.06;
          }
        }
        // ripple push
        for (var k = 0; k < ripples.length; k++) {
          var rp = ripples[k];
          var rdx = n.x - rp.x, rdy = n.y - rp.y;
          var rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
          var band = Math.abs(rd - rp.rad);
          if (band < 46) {
            var push = (1 - band / 46) * rp.power;
            n.vx += (rdx / rd) * push;
            n.vy += (rdy / rd) * push;
          }
        }
        // friction + speed clamp
        n.vx *= 0.985; n.vy *= 0.985;
        var sp = Math.hypot(n.vx, n.vy);
        if (sp > 1.7) { n.vx = (n.vx / sp) * 1.7; n.vy = (n.vy / sp) * 1.7; }
      }

      // links between nearby nodes
      for (var a = 0; a < nodes.length; a++) {
        var na = nodes[a];
        for (var b = a + 1; b < nodes.length; b++) {
          var nb = nodes[b];
          var lx = na.x - nb.x, ly = na.y - nb.y;
          var ld = Math.sqrt(lx * lx + ly * ly);
          if (ld < LINK) {
            var al = (1 - ld / LINK) * 0.20;
            ctx.strokeStyle = rgba('#367895', al);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); ctx.stroke();
          }
        }
      }

      // cursor "lens": bright cherry links from pointer to nearby nodes
      if (pointer.active) {
        for (var c = 0; c < nodes.length; c++) {
          var nc = nodes[c];
          var mdx = pointer.x - nc.x, mdy = pointer.y - nc.y;
          var md = Math.sqrt(mdx * mdx + mdy * mdy);
          if (md < MOUSE) {
            var ma = (1 - md / MOUSE) * 0.55;
            ctx.strokeStyle = rgba('#FB2832', ma);
            ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.moveTo(pointer.x, pointer.y); ctx.lineTo(nc.x, nc.y); ctx.stroke();
          }
        }
      }

      // nodes (with subtle twinkle + glow near cursor)
      for (var p = 0; p < nodes.length; p++) {
        var nn = nodes[p];
        var tw = 0.7 + Math.sin(t * 0.002 + nn.tw) * 0.3;
        var near = 0;
        if (pointer.active) {
          var ex = pointer.x - nn.x, ey = pointer.y - nn.y;
          var ed = Math.sqrt(ex * ex + ey * ey);
          if (ed < MOUSE) near = 1 - ed / MOUSE;
        }
        var rad = nn.r * (1 + near * 0.9);
        if (near > 0.15) {
          ctx.fillStyle = rgba(nn.c, 0.16 * near);
          ctx.beginPath(); ctx.arc(nn.x, nn.y, rad * 3.4, 0, 6.2832); ctx.fill();
        }
        ctx.fillStyle = rgba(nn.c, (0.5 + near * 0.5) * tw);
        ctx.beginPath(); ctx.arc(nn.x, nn.y, rad, 0, 6.2832); ctx.fill();
      }

      // ripple rings
      for (var q = ripples.length - 1; q >= 0; q--) {
        var r2 = ripples[q];
        r2.rad += 7; r2.power *= 0.94; r2.alpha *= 0.95;
        ctx.strokeStyle = rgba('#FB2832', r2.alpha);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(r2.x, r2.y, r2.rad, 0, 6.2832); ctx.stroke();
        if (r2.rad > Math.max(W, H) || r2.alpha < 0.02) ripples.splice(q, 1);
      }
    }

    // Build once layout exists; retry across frames until the canvas has real size.
    var built = build();
    if (built) draw(0); // static first frame (visible under reduced motion / no rAF)

    function ensureBuilt() {
      if (built) return;
      if (build()) { built = true; draw(0); }
    }
    // Repair paths: rAF (next frame), window load, and a ResizeObserver — covers
    // first-paint-before-layout AND the reduced-motion path that has no render loop.
    if (!built) {
      requestAnimationFrame(ensureBuilt);
      window.addEventListener('load', ensureBuilt);
      setTimeout(ensureBuilt, 120);
      setTimeout(ensureBuilt, 400);
    }
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (build()) { built = true; draw(0); }
      });
      ro.observe(canvas);
    }
    window.addEventListener('resize', function () { dpr = Math.min(window.devicePixelRatio || 1, 2); if (build()) { built = true; draw(0); } });

    // Pointer interaction (always on — user-initiated)
    function toLocal(e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.active = true;
    }
    window.addEventListener('pointermove', toLocal, { passive: true });
    window.addEventListener('pointerleave', function () { pointer.active = false; pointer.x = -9999; pointer.y = -9999; });
    if (hero) hero.addEventListener('pointerdown', function (e) {
      toLocal(e);
      ripples.push({ x: pointer.x, y: pointer.y, rad: 6, power: 0.9, alpha: 0.5 });
    });

    // Continuous ambient animation — runs for everyone so the field is always alive.
    var visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(canvas);
    }
    heroFxLoop = function tick(ts) {
      requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      if (!built) ensureBuilt();
      draw(ts || 0);
    };
    heroFxLoop(0);
    window.__heroFx = { nodes: function () { return nodes.length; }, sized: function () { return W + 'x' + H + ' buf ' + canvas.width + 'x' + canvas.height; } };
  }
  var heroFxLoop = null;
  initHeroFx();

  /* ---------- Final-state fallback (no animation possible) ---------- */
  function staticFinalize() {
    document.querySelectorAll('.r-prog i').forEach(function (bar) {
      bar.style.width = (bar.dataset.val || 70) + '%';
    });
    document.querySelectorAll('[data-count]').forEach(function (el) {
      el.textContent = Math.round(parseFloat(el.dataset.count)) + (el.dataset.suffix || '');
    });
  }

  /* ---------- FULL motion choreography ---------- */
  function startFull() {
    gsap.registerPlugin(ScrollTrigger);

    // Hero entrance: masked line reveal — uses the brand "emphasized" curve.
    var EMPH = '0.16,1,0.3,1';
    var tl = gsap.timeline({ defaults: { ease: 'cubic-bezier(' + EMPH + ')' } });
    tl.from('.hero__pill', { y: 22, opacity: 0, duration: 0.6 }, 0.05)
      .from('.hl__i', { yPercent: 115, duration: 1.1, stagger: 0.1, ease: 'cubic-bezier(' + EMPH + ')' }, 0.18)
      .from('.hero__sub', { y: 22, opacity: 0, duration: 0.7 }, '-=0.55')
      .from('.hero__cta', { y: 22, opacity: 0, duration: 0.7 }, '-=0.5')
      .from('.hero__meta', { y: 18, opacity: 0, duration: 0.7 }, '-=0.5')
      .from('.hero__fxhint', { opacity: 0, duration: 0.6 }, '-=0.4');

    // Cursor glow follows pointer in the hero (fine pointers)
    if (window.matchMedia('(pointer: fine)').matches) {
      var glow = document.getElementById('heroGlow');
      var hero = document.querySelector('.hero');
      if (glow && hero) {
        var qx = gsap.quickTo(glow, 'left', { duration: 0.7, ease: 'power3' });
        var qy = gsap.quickTo(glow, 'top', { duration: 0.7, ease: 'power3' });
        hero.addEventListener('pointermove', function (e) { qx(e.clientX); qy(e.clientY); }, { passive: true });
      }
    }

    // Hero constellation fades + drifts as you scroll away
    gsap.to('#hero-fx', {
      yPercent: 12, opacity: 0.32, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'bottom 92%', end: 'bottom 30%', scrub: true }
    });

    // Generic reveals
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      gsap.from(el, { y: 48, opacity: 0, duration: 0.95, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 86%' } });
    });
    document.querySelectorAll('[data-reveal-group]').forEach(function (g) {
      gsap.from(g.children, { y: 48, opacity: 0, scale: 0.97, duration: 0.85, ease: 'power3.out', stagger: 0.09, scrollTrigger: { trigger: g, start: 'top 85%' } });
    });

    // Ramps grow in
    document.querySelectorAll('.lr-ramp').forEach(function (r) {
      gsap.from(r.children, { scaleY: 0, transformOrigin: 'bottom', duration: 0.55, ease: 'power2.out', stagger: 0.045, scrollTrigger: { trigger: r, start: 'top 88%' } });
    });

    // Big type drifts sideways on scrub
    gsap.fromTo('.type-aa', { xPercent: -5 }, { xPercent: 3, ease: 'none', scrollTrigger: { trigger: '.bt--type', start: 'top bottom', end: 'bottom top', scrub: 1 } });

    // Counters
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var end = parseFloat(el.dataset.count);
      var suffix = el.dataset.suffix || '';
      var obj = { v: 0 };
      gsap.to(obj, {
        v: end, duration: 1.6, ease: 'power1.out',
        scrollTrigger: { trigger: el, start: 'top 92%' },
        onUpdate: function () { el.textContent = Math.round(obj.v) + suffix; }
      });
    });

    // Progress bars
    document.querySelectorAll('.r-prog i').forEach(function (bar) {
      gsap.to(bar, { width: (bar.dataset.val || 70) + '%', duration: 1.2, ease: 'power2.out', scrollTrigger: { trigger: bar, start: 'top 92%' } });
    });

    // Example groups reveal as you scroll (decks / social / web)
    gsap.utils.toArray('.ex-group').forEach(function (g) {
      gsap.from(g.querySelectorAll('.ex-gh, .ex-row > *'), {
        y: 28, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out',
        scrollTrigger: { trigger: g, start: 'top 80%' }
      });
    });

    // CTA band scales in
    gsap.from('.cta__in', { scale: 0.94, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.cta', start: 'top 82%' } });
  }

  /* ---------- LITE motion (reduced motion: opacity-only) ---------- */
  function startLite() {
    gsap.registerPlugin(ScrollTrigger);
    gsap.from('.hero__in > *', { opacity: 0, duration: 0.7, stagger: 0.08 });
    document.querySelectorAll('[data-reveal], [data-reveal-group]').forEach(function (el) {
      gsap.from(el, { opacity: 0, duration: 0.6, scrollTrigger: { trigger: el, start: 'top 88%' } });
    });
    staticFinalize();
  }

  /* ---------- Boot: probe rAF, then pick a tier ---------- */
  var rafOk = false;
  requestAnimationFrame(function () { rafOk = true; });
  setTimeout(function () {
    if (window.gsap && rafOk) {
      if (RM) startLite(); else startFull();
    } else {
      staticFinalize();
    }
  }, 300);

  /* ---------- Footer year ---------- */
  var y = document.getElementById('yr');
  if (y) y.textContent = String(new Date().getFullYear());
})();
