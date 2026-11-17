/*
 * Spark Hour - Game of the Day. Our own small arcade games in classic styles (no copied art, names
 * or levels). Each game is `start(stage, done)`: it draws into `stage`, calls `done(score)` exactly
 * once when the try ends, and returns a cleanup function. Touch first, keyboard also works.
 */
(function () {
  'use strict';
  var G = {};
  var W = 300, H = 400;

  function canvas(stage, w, h, show) {
    var c = document.createElement('canvas'); c.width = w || W; c.height = h || H;
    c.style.cssText = 'display:block;width:100%;max-width:' + (show || w || W) + 'px;margin:0 auto;border-radius:12px;background:#10121f;touch-action:none';
    stage.appendChild(c);
    return c;
  }
  function hud(stage) { var d = document.createElement('div'); d.className = 'ghud'; stage.appendChild(d); return d; }
  function pads(stage, keys) {
    var row = document.createElement('div'); row.className = 'gpad';
    keys.forEach(function (k) {
      var b = document.createElement('button'); b.textContent = k[0];
      var fire = function (e) { e.preventDefault(); k[1](); };
      b.addEventListener('touchstart', fire, { passive: false }); b.addEventListener('mousedown', fire);
      row.appendChild(b);
    });
    stage.appendChild(row);
    return row;
  }
  function once(done) { var called = false; return function (s) { if (!called) { called = true; done(Math.max(0, Math.round(s))); } }; }
  function swipe(el, cb) {
    var sx, sy;
    el.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
      cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'));
    }, { passive: true });
  }

  // ------------------------------------------------------------------ Block Drop (falling blocks)
  G.blockdrop = function (stage, done) {
    done = once(done);
    var COLS = 10, ROWS = 18, S = 20;
    var c = canvas(stage, COLS * S, ROWS * S, 270), x = c.getContext('2d'), h = hud(stage);
    var SHAPES = [[[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[0, 1, 1], [1, 1, 0]], [[1, 1, 0], [0, 1, 1]]];
    var COLORS = ['#e0446a', '#f2a516', '#0f8b8d', '#5b2a86', '#2a9d55', '#3a86ff', '#ff7b54'];
    var grid = []; for (var r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(0));
    var piece, score = 0, lines = 0, over = false, t = 0, last = 0, raf;
    function spawn() {
      var i = Math.floor(Math.random() * SHAPES.length);
      piece = { m: SHAPES[i].map(function (r) { return r.slice(); }), c: i + 1, x: 3, y: 0 };
      if (hit(piece.m, piece.x, piece.y)) { over = true; finish(); }
    }
    function hit(m, px, py) {
      for (var r = 0; r < m.length; r++) for (var q = 0; q < m[r].length; q++) {
        if (!m[r][q]) continue;
        var gx = px + q, gy = py + r;
        if (gx < 0 || gx >= COLS || gy >= ROWS || (gy >= 0 && grid[gy][gx])) return true;
      }
      return false;
    }
    function rotate() {
      var m = piece.m, n = m[0].map(function (_, i) { return m.map(function (r) { return r[i]; }).reverse(); });
      for (var k = 0; k < 3; k++) { var off = [0, -1, 1][k]; if (!hit(n, piece.x + off, piece.y)) { piece.m = n; piece.x += off; return; } }
    }
    function move(d) { if (!over && !hit(piece.m, piece.x + d, piece.y)) piece.x += d; }
    function land() {
      piece.m.forEach(function (r, ry) { r.forEach(function (v, rx) { if (v && piece.y + ry >= 0) grid[piece.y + ry][piece.x + rx] = piece.c; }); });
      var cleared = 0;
      for (var r = ROWS - 1; r >= 0; r--) if (grid[r].every(Boolean)) { grid.splice(r, 1); grid.unshift(new Array(COLS).fill(0)); cleared++; r++; }
      lines += cleared; score += [0, 100, 300, 500, 800][cleared] * (1 + Math.floor(lines / 10));
      spawn();
    }
    function drop() { if (over) return; if (!hit(piece.m, piece.x, piece.y + 1)) piece.y++; else land(); }
    function hard() { if (over) return; while (!hit(piece.m, piece.x, piece.y + 1)) { piece.y++; score += 2; } land(); }
    function draw() {
      x.fillStyle = '#10121f'; x.fillRect(0, 0, c.width, c.height);
      for (var r = 0; r < ROWS; r++) for (var q = 0; q < COLS; q++) if (grid[r][q]) cell(q, r, COLORS[grid[r][q] - 1]);
      if (piece && !over) piece.m.forEach(function (row, ry) { row.forEach(function (v, rx) { if (v) cell(piece.x + rx, piece.y + ry, COLORS[piece.c - 1]); }); });
      h.textContent = 'Score ' + score + ' · Rows ' + lines;
    }
    function cell(q, r, col) { x.fillStyle = col; x.fillRect(q * S + 1, r * S + 1, S - 2, S - 2); }
    function loop(ts) {
      if (over) return;
      var speed = Math.max(120, 600 - lines * 30);
      if (ts - last > speed) { drop(); last = ts; }
      draw(); raf = requestAnimationFrame(loop);
    }
    function finish() { cancelAnimationFrame(raf); draw(); done(score); }
    function key(e) { var m = { ArrowLeft: function () { move(-1); }, ArrowRight: function () { move(1); }, ArrowUp: rotate, ArrowDown: hard }; if (m[e.key]) { e.preventDefault(); m[e.key](); } }
    pads(stage, [['◀', function () { move(-1); }], ['⟳', rotate], ['▶', function () { move(1); }], ['▼', hard]]);
    document.addEventListener('keydown', key);
    spawn(); raf = requestAnimationFrame(loop);
    return function () { over = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', key); };
  };

  // ------------------------------------------------------------------ Bullseye Stop (timing)
  G.bullseye = function (stage, done) {
    done = once(done);
    var c = canvas(stage, W, 160), x = c.getContext('2d'), h = hud(stage);
    var round = 0, total = 0, pos = 0, dir = 1, moving = true, raf, last = [];
    function speed() { return 1.3 + round * 0.55; }
    function draw() {
      x.fillStyle = '#10121f'; x.fillRect(0, 0, W, 160);
      x.fillStyle = '#2a2e4a'; x.fillRect(10, 60, W - 20, 40);
      x.fillStyle = '#2a9d55'; x.fillRect(W / 2 - 22, 60, 44, 40);
      x.fillStyle = '#f2a516'; x.fillRect(W / 2 - 5, 60, 10, 40);
      x.fillStyle = '#fff'; x.fillRect(10 + pos / 100 * (W - 26), 52, 6, 56);
      x.font = 'bold 16px sans-serif'; x.fillText('Round ' + Math.min(round + 1, 5) + ' of 5', 10, 30);
      x.fillText('Total ' + total, W - 100, 30);
      x.font = '13px sans-serif'; x.fillText(last.join('  '), 10, 140);
    }
    function loop() { if (moving) { pos += dir * speed(); if (pos >= 100 || pos <= 0) { dir *= -1; pos = Math.max(0, Math.min(100, pos)); } } draw(); raf = requestAnimationFrame(loop); }
    function tap(e) {
      if (e) e.preventDefault();
      if (!moving) return;
      var pts = Math.max(0, Math.round(100 - Math.abs(pos - 50) * 4)); total += pts; last.push(pts); round++;
      if (round >= 5) { moving = false; draw(); cancelAnimationFrame(raf); h.textContent = 'Final ' + total; done(total); return; }
      moving = false; setTimeout(function () { moving = true; pos = Math.random() < 0.5 ? 0 : 100; dir = pos ? -1 : 1; }, 500);
    }
    h.textContent = 'Tap STOP when the light is on the gold';
    pads(stage, [['STOP', tap]]);
    var key = function (e) { if (e.key === ' ' || e.key === 'Enter') tap(e); };
    document.addEventListener('keydown', key);
    raf = requestAnimationFrame(loop);
    return function () { cancelAnimationFrame(raf); document.removeEventListener('keydown', key); };
  };

  // ------------------------------------------------------------------ Snake Trail
  G.snake = function (stage, done) {
    done = once(done);
    var S = 20, CW = 15, CH = 20, c = canvas(stage), x = c.getContext('2d'), h = hud(stage);
    var body = [{ x: 7, y: 10 }, { x: 6, y: 10 }, { x: 5, y: 10 }], dir = { x: 1, y: 0 }, next = dir, food, score = 0, timer, alive = true;
    function place() { do { food = { x: Math.floor(Math.random() * CW), y: Math.floor(Math.random() * CH) }; } while (body.some(function (b) { return b.x === food.x && b.y === food.y; })); }
    function turn(d) { var m = { L: { x: -1, y: 0 }, R: { x: 1, y: 0 }, U: { x: 0, y: -1 }, D: { x: 0, y: 1 } }[d]; if (m.x !== -dir.x || m.y !== -dir.y) next = m; }
    function step() {
      dir = next;
      var head = { x: body[0].x + dir.x, y: body[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= CW || head.y >= CH || body.some(function (b) { return b.x === head.x && b.y === head.y; })) { alive = false; draw(); done(score); return; }
      body.unshift(head);
      if (head.x === food.x && head.y === food.y) { score += 10; place(); } else body.pop();
      draw();
      timer = setTimeout(step, Math.max(70, 150 - score / 2));
    }
    function draw() {
      x.fillStyle = '#10121f'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#e0446a'; x.beginPath(); x.arc(food.x * S + 10, food.y * S + 10, 7, 0, 7); x.fill();
      body.forEach(function (b, i) { x.fillStyle = i ? '#2a9d55' : '#7ee2a8'; x.fillRect(b.x * S + 1, b.y * S + 1, S - 2, S - 2); });
      h.textContent = 'Score ' + score + (alive ? '' : ' · ouch!');
    }
    swipe(c, turn);
    var key = function (e) { var m = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' }[e.key]; if (m) { e.preventDefault(); turn(m); } };
    document.addEventListener('keydown', key);
    pads(stage, [['◀', function () { turn('L'); }], ['▲', function () { turn('U'); }], ['▼', function () { turn('D'); }], ['▶', function () { turn('R'); }]]);
    place(); draw(); timer = setTimeout(step, 400);
    return function () { clearTimeout(timer); document.removeEventListener('keydown', key); };
  };

  // ------------------------------------------------------------------ Brick Breaker
  G.bricks = function (stage, done) {
    done = once(done);
    var c = canvas(stage), x = c.getContext('2d'), h = hud(stage);
    var px = W / 2, PW = 64, ball, bricks, score = 0, wave = 0, raf, live = true;
    var COLORS = ['#e0446a', '#f2a516', '#2a9d55', '#0f8b8d', '#5b2a86'];
    function newWave() {
      wave++; bricks = [];
      for (var r = 0; r < 5; r++) for (var q = 0; q < 6; q++) bricks.push({ x: 8 + q * 48, y: 50 + r * 20, on: true, c: COLORS[r] });
      ball = { x: W / 2, y: 300, vx: 2.2 + wave * 0.3, vy: -(3 + wave * 0.4) };
    }
    function loop() {
      ball.x += ball.vx; ball.y += ball.vy;
      if (ball.x < 6 || ball.x > W - 6) ball.vx *= -1;
      if (ball.y < 6) ball.vy = Math.abs(ball.vy);
      if (ball.y > 370 && ball.y < 382 && Math.abs(ball.x - px) < PW / 2 + 6 && ball.vy > 0) { ball.vy = -Math.abs(ball.vy); ball.vx = (ball.x - px) / (PW / 2) * 4; }
      if (ball.y > H) { live = false; draw(); done(score); return; }
      bricks.forEach(function (b) { if (b.on && ball.x > b.x && ball.x < b.x + 44 && ball.y > b.y && ball.y < b.y + 16) { b.on = false; ball.vy *= -1; score += 10; } });
      if (bricks.every(function (b) { return !b.on; })) { score += 100; newWave(); }
      draw(); raf = requestAnimationFrame(loop);
    }
    function draw() {
      x.fillStyle = '#10121f'; x.fillRect(0, 0, W, H);
      bricks.forEach(function (b) { if (b.on) { x.fillStyle = b.c; x.fillRect(b.x, b.y, 44, 16); } });
      x.fillStyle = '#fff'; x.fillRect(px - PW / 2, 376, PW, 8);
      x.beginPath(); x.arc(ball.x, ball.y, 6, 0, 7); x.fill();
      h.textContent = 'Score ' + score + ' · Wave ' + wave + (live ? '' : ' · missed!');
    }
    function aim(clientX) { var r = c.getBoundingClientRect(); px = Math.max(PW / 2, Math.min(W - PW / 2, (clientX - r.left) / r.width * W)); }
    c.addEventListener('touchmove', function (e) { e.preventDefault(); aim(e.touches[0].clientX); }, { passive: false });
    c.addEventListener('touchstart', function (e) { aim(e.touches[0].clientX); }, { passive: true });
    c.addEventListener('mousemove', function (e) { aim(e.clientX); });
    var key = function (e) { if (e.key === 'ArrowLeft') px = Math.max(PW / 2, px - 24); if (e.key === 'ArrowRight') px = Math.min(W - PW / 2, px + 24); };
    document.addEventListener('keydown', key);
    newWave(); draw(); setTimeout(function () { raf = requestAnimationFrame(loop); }, 700);
    return function () { cancelAnimationFrame(raf); document.removeEventListener('keydown', key); };
  };

  // ------------------------------------------------------------------ Memory Match
  G.memory = function (stage, done) {
    done = once(done);
    var faces = ['💘', '🌹', '🍕', '🎷', '🌙', '🍓', '🎈', '⭐'];
    var deck = faces.concat(faces).sort(function () { return Math.random() - 0.5; });
    var h = hud(stage), grid = document.createElement('div'); grid.className = 'gmem'; stage.appendChild(grid);
    var open = [], found = 0, misses = 0, t0 = Date.now(), busy = false, tick;
    deck.forEach(function (f) {
      var b = document.createElement('button'); b.dataset.f = f; b.textContent = '';
      b.onclick = function () {
        if (busy || b.classList.contains('up')) return;
        b.classList.add('up'); b.textContent = f; open.push(b);
        if (open.length < 2) return;
        if (open[0].dataset.f === open[1].dataset.f) { found++; open = []; if (found === 8) finish(); }
        else { misses++; busy = true; setTimeout(function () { open.forEach(function (o) { o.classList.remove('up'); o.textContent = ''; }); open = []; busy = false; }, 650); }
      };
      grid.appendChild(b);
    });
    function score() { return Math.max(0, 1000 - Math.floor((Date.now() - t0) / 1000) * 5 - misses * 25); }
    function show() { h.textContent = 'Pairs ' + found + '/8 · Misses ' + misses + ' · Score ' + score(); }
    function finish() { clearInterval(tick); show(); done(score()); }
    tick = setInterval(show, 500); show();
    return function () { clearInterval(tick); };
  };

  // ------------------------------------------------------------------ Pop-Up Whack
  G.whack = function (stage, done) {
    done = once(done);
    var h = hud(stage), grid = document.createElement('div'); grid.className = 'gwhack'; stage.appendChild(grid);
    var holes = [], score = 0, end = Date.now() + 30000, timer, clock;
    for (var i = 0; i < 9; i++) {
      (function () {
        var b = document.createElement('button'); b.textContent = '';
        var hitIt = function (e) {
          e.preventDefault();
          if (b.dataset.v === 'heart') { score += 10; b.textContent = '✨'; } else if (b.dataset.v === 'bomb') { score = Math.max(0, score - 30); b.textContent = '💥'; }
          b.dataset.v = ''; show();
        };
        b.addEventListener('touchstart', hitIt, { passive: false }); b.addEventListener('mousedown', hitIt);
        grid.appendChild(b); holes.push(b);
      })();
    }
    function pop() {
      var left = end - Date.now();
      if (left <= 0) { clearInterval(clock); holes.forEach(function (b) { b.textContent = ''; b.dataset.v = ''; }); show(); done(score); return; }
      var b = holes[Math.floor(Math.random() * 9)];
      if (!b.dataset.v) {
        var bomb = Math.random() < 0.18; b.dataset.v = bomb ? 'bomb' : 'heart'; b.textContent = bomb ? '💣' : '💗';
        var life = Math.max(450, 1000 - (30000 - left) / 40);
        setTimeout(function () { b.dataset.v = ''; b.textContent = ''; }, life);
      }
      timer = setTimeout(pop, Math.max(280, 650 - (30000 - left) / 60));
    }
    function show() { h.textContent = 'Score ' + score + ' · ' + Math.max(0, Math.ceil((end - Date.now()) / 1000)) + 's'; }
    clock = setInterval(show, 250); show(); timer = setTimeout(pop, 500);
    return function () { clearTimeout(timer); clearInterval(clock); };
  };

  window.SparkGames = G;
})();
