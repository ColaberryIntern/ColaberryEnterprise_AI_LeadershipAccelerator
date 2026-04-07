import React, { useEffect, useRef, useState, useMemo } from 'react';
import { getAdvisoryUrl } from '../services/utmService';
import scenarios from '../config/demoScenarios.json';

interface InlineDemoPlayerProps {
  /** Restrict to specific scenario IDs (e.g. ['saas','logistics']). Defaults to all 10. */
  allowedScenarios?: string[];
  trackContext?: string;
  /** Called when demo finishes. If provided, hides default done state. */
  onDemoComplete?: (scenarioId: string) => void;
  /** Force replay a specific scenario (change this value to trigger) */
  replayScenario?: string;
  /** Auto-play immediately without requiring "Watch It Build" click */
  autoPlay?: boolean;
}

export default function InlineDemoPlayer({ allowedScenarios, trackContext, onDemoComplete, replayScenario, autoPlay }: InlineDemoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'initial' | 'playing' | 'done'>('initial');
  const autoPlayedRef = useRef(false);
  const advisoryUrl = getAdvisoryUrl();

  const pool = useMemo(() => {
    if (!allowedScenarios) return scenarios as any[];
    return (scenarios as any[]).filter(s => allowedScenarios.includes(s.id));
  }, [allowedScenarios]);

  const scenarioRef = useRef<any>(null);
  if (!scenarioRef.current) {
    const last = localStorage.getItem('cb_last_demo') || '';
    const avail = pool.filter(s => s.id !== last);
    const list = avail.length ? avail : pool;
    scenarioRef.current = list[Math.floor(Math.random() * list.length)];
  }
  const scenario = scenarioRef.current;

  const timersRef = useRef<number[]>([]);
  const graphRef = useRef<any>(null);
  const runIdRef = useRef(0);

  function stopAll() {
    runIdRef.current++;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (graphRef.current) { graphRef.current.destroy(); graphRef.current = null; }
  }

  useEffect(() => { return () => stopAll(); }, []);

  // External replay trigger — parent can force a new scenario
  useEffect(() => {
    if (replayScenario) {
      const found = (scenarios as any[]).find(s => s.id === replayScenario);
      if (found) {
        stopAll();
        scenarioRef.current = found;
        ++runIdRef.current;
        localStorage.setItem('cb_last_demo', replayScenario);
        try { (window as any).trackBookingEvent?.('demo_start', { scenario: replayScenario, industry: found.industry, context: trackContext }); } catch {}
        // Reset to initial then playing to force remount
        setState('initial');
        setTimeout(() => setState('playing'), 50);
      }
    }
  }, [replayScenario]);

  // Callback ref: fires when the playing container div mounts
  const playingRef = React.useCallback((node: HTMLDivElement | null) => {
    if (node && state === 'playing') {
      // DOM is guaranteed ready — node just mounted
      const rid = runIdRef.current;
      runDemo(rid);
    }
  }, [state]);

  // Auto-play on mount if autoPlay prop is true
  useEffect(() => {
    if (autoPlay && !autoPlayedRef.current && state === 'initial') {
      autoPlayedRef.current = true;
      setTimeout(() => start(), 300);
    }
  }, [autoPlay]);

  function start() {
    stopAll();
    ++runIdRef.current;
    localStorage.setItem('cb_last_demo', scenarioRef.current.id);
    try { (window as any).trackBookingEvent?.('demo_start', { scenario: scenarioRef.current.id, industry: scenarioRef.current.industry, context: trackContext }); } catch {}
    setState('playing');
  }

  function skip() {
    stopAll();
    setState('done');
    try { (window as any).trackBookingEvent?.('demo_skip', { scenario: scenarioRef.current?.id, industry: scenarioRef.current?.industry, context: trackContext }); } catch {}
  }

  function pickNew(id: string) {
    stopAll();
    const found = (scenarios as any[]).find(s => s.id === id);
    if (found) scenarioRef.current = found;
    ++runIdRef.current;
    localStorage.setItem('cb_last_demo', id);
    try { (window as any).trackBookingEvent?.('demo_start', { scenario: id, industry: found?.industry, context: trackContext }); } catch {}
    // Brief reset to initial then back to playing to remount the div
    setState('initial');
    setTimeout(() => setState('playing'), 50);
  }

  function delay(ms: number, rid: number): Promise<boolean> {
    return new Promise(r => {
      const id = window.setTimeout(() => {
        timersRef.current = timersRef.current.filter(t => t !== id);
        r(runIdRef.current === rid);
      }, ms);
      timersRef.current.push(id);
    });
  }

  function narr(t: string) { const el = document.getElementById('ep-narr'); if (el) el.textContent = t; }
  function showStep(id: string) {
    document.querySelectorAll('.ep-step').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('ep-step-' + id);
    if (el) el.classList.add('active');
  }

  async function typeText(el: HTMLTextAreaElement, text: string, rid: number, speed = 25) {
    el.value = '';
    for (let i = 0; i < text.length; i++) {
      if (runIdRef.current !== rid) return;
      el.value += text[i];
      el.scrollTop = el.scrollHeight;
      if (!(await delay(speed, rid))) return;
    }
  }

  function botBubble(cont: HTMLElement, html: string) {
    const d = document.createElement('div');
    d.className = 'ep-bubble ep-bubble-bot';
    d.innerHTML = '<div class="ep-av bg-primary-subtle text-primary"><i class="bi bi-cpu"></i></div><div class="bbl"><strong>' + html + '</strong></div>';
    cont.appendChild(d);
    cont.scrollTop = cont.scrollHeight;
  }

  function userBubble(cont: HTMLElement, text: string) {
    const d = document.createElement('div');
    d.className = 'ep-bubble ep-bubble-user';
    d.innerHTML = '<div class="bbl">' + text + '</div><div class="ep-av bg-primary text-white"><i class="bi bi-person"></i></div>';
    cont.appendChild(d);
    cont.scrollTop = cont.scrollHeight;
  }

  function countUp(el: HTMLElement, target: number, pre = '', suf = '', dur = 1200) {
    let st: number | null = null;
    function step(ts: number) {
      if (!st) st = ts;
      const p = Math.min((ts - st) / dur, 1), e = 1 - Math.pow(1 - p, 3), c = Math.floor(e * target);
      el.textContent = pre + c.toLocaleString() + suf;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function buildGraph(contId: string, agents: any[], simSteps?: any[]) {
    const cont = document.getElementById(contId);
    if (!cont || !(window as any).d3) return { highlight: () => {}, destroy: () => {} };
    cont.innerHTML = '';
    const w = cont.clientWidth || 500, h = 320;
    const d3 = (window as any).d3;
    const colors: any = { Executive: '#1a1a2e', Operations: '#f59e0b', 'Customer Support': '#6f42c1', Sales: '#4361ee', Finance: '#dc3545', Marketing: '#198754', HR: '#0dcaf0', Compliance: '#198754' };
    const nodes: any[] = [], links: any[] = [], deptMap: any = {};

    // Add AI agent nodes
    agents.forEach(a => {
      nodes.push({ id: a.name, name: a.name, dept: a.dept, r: a.cory ? 24 : a.primary ? 14 : 10, color: colors[a.dept] || '#64748b', isCory: !!a.cory, isHuman: false });
      if (!a.cory) { if (!deptMap[a.dept]) deptMap[a.dept] = []; deptMap[a.dept].push(a.name); }
    });

    // Add human nodes from HITL sim steps
    const humanNames = new Set<string>();
    if (simSteps) {
      simSteps.filter((s: any) => s.is_hitl).forEach((s: any) => {
        const name = s.agent;
        if (!humanNames.has(name)) {
          humanNames.add(name);
          nodes.push({ id: name, name: name, dept: 'Human', r: 16, color: '#38a169', isCory: false, isHuman: true });
        }
      });
    }

    const cory = nodes.find(n => n.isCory);
    if (cory) {
      nodes.forEach(n => {
        if (!n.isCory && !n.isHuman) links.push({ source: cory.id, target: n.id });
        // Humans connect to the Control Tower with a special link
        if (n.isHuman) links.push({ source: cory.id, target: n.id });
      });
    }
    Object.values(deptMap).forEach((arr: any) => { for (let i = 0; i < arr.length - 1; i++) links.push({ source: arr[i], target: arr[i + 1] }); });

    const svg = d3.select('#' + contId).append('svg').attr('width', w).attr('height', h);
    const defs = svg.append('defs');
    const f = defs.append('filter').attr('id', 'epglow');
    f.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'b');
    const m = f.append('feMerge'); m.append('feMergeNode').attr('in', 'b'); m.append('feMergeNode').attr('in', 'SourceGraphic');

    // Position humans to the right side
    nodes.filter(n => n.isHuman).forEach((n, i) => { n.fx = w - 50; n.fy = 60 + i * 60; });

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(70))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide(20));
    const link = svg.append('g').selectAll('line').data(links).enter().append('line')
      .attr('stroke', (d: any) => (d.source.isHuman || d.target.isHuman) ? '#38a169' : '#cbd5e1')
      .attr('stroke-width', (d: any) => (d.source.isHuman || d.target.isHuman) ? 2 : 1.5)
      .attr('stroke-dasharray', '4,3');
    const node = svg.append('g').selectAll('g').data(nodes).enter().append('g');

    // AI agents = circles, Humans = rounded rectangles
    node.each(function(this: any, d: any) {
      const g = d3.select(this);
      if (d.isHuman) {
        g.append('rect')
          .attr('x', -18).attr('y', -14).attr('width', 36).attr('height', 28)
          .attr('rx', 6).attr('ry', 6)
          .attr('fill', '#38a169').attr('stroke', 'white').attr('stroke-width', 2);
        g.append('text').text('\u{1F464}')
          .attr('text-anchor', 'middle').attr('dy', '.35em').attr('font-size', '14px').style('pointer-events', 'none');
      } else {
        g.append('circle').attr('r', d.r).attr('fill', d.color)
          .attr('stroke', 'white').attr('stroke-width', 2)
          .attr('filter', d.isCory ? 'url(#epglow)' : null);
        g.append('text').text(d.name.substring(0, 2).toUpperCase())
          .attr('text-anchor', 'middle').attr('dy', '.35em').attr('fill', 'white').attr('font-size', '8px').attr('font-weight', '700').style('pointer-events', 'none');
      }
    });

    // Add labels below human nodes
    node.filter((d: any) => d.isHuman).append('text')
      .text((d: any) => d.name.replace(' (Human)', ''))
      .attr('text-anchor', 'middle').attr('dy', '26px').attr('fill', '#38a169').attr('font-size', '7px').attr('font-weight', '600').style('pointer-events', 'none');

    sim.on('tick', () => {
      link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
      node.attr('transform', (d: any) => {
        if (!d.fx) { d.x = Math.max(25, Math.min(w - 25, d.x)); d.y = Math.max(25, Math.min(h - 25, d.y)); }
        return 'translate(' + d.x + ',' + d.y + ')';
      });
    });

    function hl(name: string) {
      // Highlight both circle and rect nodes
      node.select('circle').transition().duration(200)
        .attr('r', (d: any) => d.name === name ? d.r + 7 : d.r)
        .attr('stroke', (d: any) => d.name === name ? '#facc15' : 'white')
        .attr('stroke-width', (d: any) => d.name === name ? 3 : 2);
      node.select('rect').transition().duration(200)
        .attr('stroke', (d: any) => d.name === name ? '#facc15' : 'white')
        .attr('stroke-width', (d: any) => d.name === name ? 3 : 2)
        .attr('x', (d: any) => d.name === name ? -22 : -18)
        .attr('y', (d: any) => d.name === name ? -18 : -14)
        .attr('width', (d: any) => d.name === name ? 44 : 36)
        .attr('height', (d: any) => d.name === name ? 36 : 28);
      link.transition().duration(200)
        .attr('stroke', (d: any) => (d.source.name === name || d.target.name === name) ? '#facc15' : (d.source.isHuman || d.target.isHuman) ? '#38a169' : '#cbd5e1')
        .attr('stroke-width', (d: any) => (d.source.name === name || d.target.name === name) ? 3 : 1.5);
      setTimeout(() => {
        node.select('circle').transition().duration(400).attr('r', (d: any) => d.r).attr('stroke', 'white').attr('stroke-width', 2);
        node.select('rect').transition().duration(400).attr('stroke', 'white').attr('stroke-width', 2).attr('x', -18).attr('y', -14).attr('width', 36).attr('height', 28);
        link.transition().duration(400).attr('stroke', (d: any) => (d.source.isHuman || d.target.isHuman) ? '#38a169' : '#cbd5e1').attr('stroke-width', 1.5);
      }, 1200);
    }
    return { highlight: hl, destroy: () => { sim.stop(); svg.remove(); } };
  }

  async function runDemo(rid: number) {
    const data = scenarioRef.current;
    const ok = (v: boolean) => v && runIdRef.current === rid;

    // DOM is guaranteed ready because useEffect fires after render
    const ideaEl = document.getElementById('ep-step-idea');
    if (!ideaEl) { console.warn('[Demo] DOM not ready'); return; }

    // Step 1: Idea typing — the business problem
    narr(data.narr.idea);
    ideaEl.innerHTML = '<div class="card border-0 shadow-sm"><div class="card-body p-3"><label class="form-label fw-semibold small">Describe your business challenge:</label><textarea class="form-control" id="ep-ta" rows="5" readonly style="resize:none;font-size:.85rem;border-radius:8px;"></textarea></div></div>';
    showStep('idea');
    if (!ok(await delay(400, rid))) return;
    const ta = document.getElementById('ep-ta') as HTMLTextAreaElement;
    if (ta) await typeText(ta, data.idea, rid, 35);
    if (runIdRef.current !== rid) return;
    if (!ok(await delay(2500, rid))) return;

    // Step 2: Questions
    narr(data.narr.questions);
    const qEl = document.getElementById('ep-step-questions');
    if (qEl) qEl.innerHTML = '<div id="ep-chat" style="max-height:280px;overflow-y:auto;"></div>';
    showStep('questions');
    const chat = document.getElementById('ep-chat');
    if (!chat) return;
    for (const q of data.questions) {
      if (runIdRef.current !== rid) return;
      const dots = document.createElement('div');
      dots.className = 'ep-bubble ep-bubble-bot';
      dots.innerHTML = '<div class="ep-av bg-primary-subtle text-primary"><i class="bi bi-cpu"></i></div><div class="bbl"><span class="ep-tdots"><span></span><span></span><span></span></span></div>';
      chat.appendChild(dots);
      chat.scrollTop = chat.scrollHeight;
      if (!ok(await delay(600, rid))) return;
      dots.querySelector('.bbl')!.innerHTML = '<strong style="font-size:.85rem;">' + q.q + '</strong>';
      if (q.chips && q.method === 'chip') {
        const cr = document.createElement('div');
        cr.className = 'd-flex flex-wrap gap-1 ms-4 mb-2';
        q.chips.forEach((c: string) => { cr.innerHTML += '<span class="badge rounded-pill bg-white text-dark border px-2 py-1" style="font-size:.75rem;">' + c + '</span>'; });
        chat.appendChild(cr);
        chat.scrollTop = chat.scrollHeight;
        if (!ok(await delay(400, rid))) return;
        const answers = q.a.split(', ');
        cr.querySelectorAll('.badge').forEach((b: any) => { if (answers.includes(b.textContent)) { b.classList.remove('bg-white', 'text-dark', 'border'); b.classList.add('bg-primary', 'text-white'); } });
      }
      if (!ok(await delay(300, rid))) return;
      userBubble(chat, q.a);
      if (!ok(await delay(500, rid))) return;
    }
    if (!ok(await delay(600, rid))) return;

    // Step 3: Design
    narr(data.narr.design);
    let dHTML = '<div class="row g-3"><div class="col-md-6"><h6 class="fw-semibold small mb-2"><i class="bi bi-bullseye me-1"></i>Outcomes</h6>';
    data.design.outcomes.forEach((o: any) => { dHTML += '<div class="ep-card mb-2 d-flex align-items-center gap-2" id="epc-' + o.id + '"><i class="bi ' + o.icon + ' text-primary"></i><span style="font-size:.85rem;">' + o.label + '</span></div>'; });
    dHTML += '</div><div class="col-md-6"><h6 class="fw-semibold small mb-2"><i class="bi bi-cpu me-1"></i>AI Systems</h6>';
    data.design.systems.forEach((s: any) => { dHTML += '<div class="ep-card mb-2 d-flex align-items-center gap-2" id="epc-s-' + s.id + '"><i class="bi ' + s.icon + ' text-' + s.color + '"></i><span style="font-size:.85rem;">' + s.label + '</span></div>'; });
    dHTML += '</div></div>';
    const dEl = document.getElementById('ep-step-design');
    if (dEl) dEl.innerHTML = dHTML;
    showStep('design');
    if (!ok(await delay(600, rid))) return;
    for (const o of data.design.outcomes) { if (runIdRef.current !== rid) return; if (o.sel) { const el = document.getElementById('epc-' + o.id); if (el) el.classList.add('sel'); if (!ok(await delay(500, rid))) return; } }
    for (const s of data.design.systems) { if (runIdRef.current !== rid) return; if (s.sel) { const el = document.getElementById('epc-s-' + s.id); if (el) el.classList.add('sel'); if (!ok(await delay(500, rid))) return; } }
    if (!ok(await delay(800, rid))) return;

    // Step 4: Results
    narr(data.narr.results);
    const kp = data.kpis;
    const rHTML = '<div class="row g-2 mb-3"><div class="col"><div class="card shadow-sm border-0 text-center py-2"><div class="ep-kpi text-success" id="ek1">$0</div><div style="font-size:.65rem;color:#64748b;text-transform:uppercase;">Savings</div></div></div><div class="col"><div class="card shadow-sm border-0 text-center py-2"><div class="ep-kpi text-primary" id="ek2">$0</div><div style="font-size:.65rem;color:#64748b;text-transform:uppercase;">Revenue</div></div></div><div class="col"><div class="card shadow-sm border-0 text-center py-2"><div class="ep-kpi text-warning" id="ek3">0</div><div style="font-size:.65rem;color:#64748b;text-transform:uppercase;">ROI</div></div></div><div class="col"><div class="card shadow-sm border-0 text-center py-2"><div class="ep-kpi text-info" id="ek4">0</div><div style="font-size:.65rem;color:#64748b;text-transform:uppercase;">Agents</div></div></div></div><div class="row g-2"><div class="col-lg-7"><div class="ep-graph" id="ep-graph-res"></div></div><div class="col-lg-5"><div class="small text-muted mb-2"><i class="bi bi-robot me-1"></i>Agent Details</div><div id="ep-agent-card"></div></div></div>';
    const rEl = document.getElementById('ep-step-results');
    if (rEl) rEl.innerHTML = rHTML;
    showStep('results');
    if (!ok(await delay(300, rid))) return;
    countUp(document.getElementById('ek1')!, kp.savings, '$', kp.savings_suf || 'K');
    countUp(document.getElementById('ek2')!, kp.revenue, '$', kp.revenue_suf || 'M');
    countUp(document.getElementById('ek3')!, kp.roi, '', '%');
    countUp(document.getElementById('ek4')!, kp.agents, '', '');
    if (!ok(await delay(1500, rid))) return;
    if (graphRef.current) graphRef.current.destroy();
    graphRef.current = buildGraph('ep-graph-res', data.agents, data.sim);
    if (!ok(await delay(2000, rid))) return;

    const deptColors: any = { Executive: 'dark', Operations: 'warning', 'Customer Support': 'info', Sales: 'primary', Finance: 'danger', Marketing: 'success', HR: 'info', Compliance: 'success' };
    const agentCard = document.getElementById('ep-agent-card');
    for (const ag of data.agents) {
      if (runIdRef.current !== rid) return;
      graphRef.current?.highlight(ag.name);
      const dc = deptColors[ag.dept] || 'secondary';
      if (agentCard) {
        agentCard.innerHTML = '<div class="ep-agent-card highlight"><div class="d-flex align-items-center gap-2 mb-2"><i class="bi ' + (ag.cory ? 'bi-cpu' : 'bi-robot') + ' fs-5 text-' + dc + '"></i><div><strong style="font-size:.9rem;">' + ag.name + '</strong><span class="ep-agent-dept bg-' + dc + '-subtle text-' + dc + ' ms-2">' + ag.dept + '</span></div></div><div class="ep-agent-role">' + (ag.role || ag.name + ' agent') + '</div></div>';
      }
      narr(ag.name + ': ' + (ag.role || ''));
      if (!ok(await delay(1800, rid))) return;
    }
    if (!ok(await delay(800, rid))) return;

    // Step 5: Simulation
    narr(data.narr.sim);
    const simHTML = '<div class="row g-2"><div class="col-lg-7"><div class="ep-graph" id="ep-graph-sim"></div></div><div class="col-lg-5"><div class="card border-0 shadow-sm"><div class="card-header py-2 small fw-semibold"><i class="bi bi-activity me-1"></i>Live Activity</div><div class="card-body p-2" id="ep-feed" style="max-height:280px;overflow-y:auto;"></div></div></div></div>';
    const sEl = document.getElementById('ep-step-sim');
    if (sEl) sEl.innerHTML = simHTML;
    showStep('sim');
    if (!ok(await delay(400, rid))) return;
    if (graphRef.current) graphRef.current.destroy();
    graphRef.current = buildGraph('ep-graph-sim', data.agents, data.sim);
    if (!ok(await delay(1200, rid))) return;
    const feed = document.getElementById('ep-feed');
    if (!feed) return;
    for (const ev of data.sim) {
      if (runIdRef.current !== rid) return;
      narr(ev.narr);
      graphRef.current?.highlight(ev.agent);
      const fi = document.createElement('div');
      const isHitl = ev.is_hitl === true;
      fi.className = 'ep-feed-item' + (ev.agent === 'AI Control Tower' ? ' cory' : '') + (isHitl ? ' hitl' : '');
      if (isHitl) {
        fi.style.borderLeft = '3px solid #38a169';
        fi.style.background = '#f0fff4';
      }
      const icon = isHitl ? '<i class="bi bi-person-check-fill" style="color:#38a169;margin-right:4px;"></i>' : '';
      const badge = isHitl ? '<span style="font-size:.6rem;background:#38a169;color:white;padding:1px 5px;border-radius:3px;margin-left:4px;">HUMAN APPROVAL</span>' : '';
      fi.innerHTML = icon + '<strong style="font-size:.75rem;">' + ev.agent + '</strong>' + badge + '<div style="font-size:.7rem;">' + ev.action + '</div>';
      feed.insertBefore(fi, feed.firstChild);
      if (!ok(await delay(2000, rid))) return;
    }
    if (!ok(await delay(1000, rid))) return;

    // Done
    narr("See what AI could look like for your business.");
    try { (window as any).trackBookingEvent?.('demo_complete', { scenario: data.id, industry: data.industry, context: trackContext }); } catch {}
    if (!ok(await delay(1500, rid))) return;
    if (onDemoComplete) {
      onDemoComplete(data.id);
    }
    setState('done');
  }

  const icons: Record<string, string> = { logistics: 'bi-truck', healthcare: 'bi-heart-pulse', saas: 'bi-cloud', ecommerce: 'bi-cart3', consulting: 'bi-briefcase', utility: 'bi-lightning-charge', manufacturing: 'bi-gear-wide-connected', realestate: 'bi-building', insurance: 'bi-shield-check', education: 'bi-mortarboard' };

  return (
    <div ref={containerRef}>
      <style>{`
        .ep-step { display: none; animation: epFade .35s ease; }
        .ep-step.active { display: block; }
        @keyframes epFade { from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);} }
        .ep-bubble { animation: epFade .3s ease; margin-bottom: 10px; }
        .ep-bubble-bot { display:flex; gap:8px; }
        .ep-bubble-bot .bbl { background:#f0f4ff; border-radius:12px 12px 12px 0; padding:10px 14px; max-width:80%; }
        .ep-bubble-user { display:flex; gap:8px; justify-content:flex-end; }
        .ep-bubble-user .bbl { background:#4361ee; color:white; border-radius:12px 12px 0 12px; padding:10px 14px; max-width:80%; }
        .ep-av { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; flex-shrink:0; }
        .ep-tdots span { display:inline-block; width:5px; height:5px; border-radius:50%; background:#4361ee; animation:epDot 1.2s infinite; }
        .ep-tdots span:nth-child(2){animation-delay:.2s;} .ep-tdots span:nth-child(3){animation-delay:.4s;}
        @keyframes epDot { 0%,100%{transform:translateY(0);}50%{transform:translateY(-4px);} }
        .ep-card { border:2px solid #e2e8f0; border-radius:10px; padding:12px; transition:all .3s; }
        .ep-card.sel { border-color:#4361ee; background:#eff6ff; }
        .ep-kpi { font-size:1.6rem; font-weight:800; line-height:1; }
        .ep-graph { min-height:320px; background:#fafbfe; border-radius:10px; }
        .ep-feed-item { animation:epFade .3s ease; border-left:3px solid #dee2e6; padding:5px 10px; margin-bottom:5px; border-radius:0 6px 6px 0; background:#f8fafc; font-size:.8rem; }
        .ep-feed-item.cory { border-left-color:#1a1a2e; background:#f0f4ff; }
        .ep-agent-card { border-radius:10px; border:2px solid #e2e8f0; padding:14px; animation:epFade .3s ease; transition:border-color .3s; }
        .ep-agent-card.highlight { border-color:#facc15; background:#fffbeb; }
        .ep-agent-dept { display:inline-block; font-size:.65rem; padding:2px 8px; border-radius:10px; font-weight:600; }
        .ep-agent-role { font-size:.8rem; color:#475569; line-height:1.4; }
        .ep-narr-bar { background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%); color:white; border-radius:8px; font-size:.9rem; }
        .ep-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:#22c55e; animation:epPulse 1.2s infinite; }
        @keyframes epPulse { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(1.4);} }
      `}</style>

      {state === 'initial' && (
        <div className="text-center py-4 px-3" style={{ background: 'var(--color-bg-alt, #f7fafc)', borderRadius: 12, border: '1px solid var(--color-border, #e2e8f0)' }}>
          <h5 className="fw-bold mb-2" style={{ color: 'var(--color-primary, #1a365d)', fontSize: 18 }}>
            See a <span style={{ color: 'var(--color-primary-light, #2b6cb0)' }}>{scenario.industry}</span> AI Organization Get Configured in Seconds
          </h5>
          <button
            className="btn btn-dark rounded-pill px-4 py-2"
            data-track={`demo_play_${scenario.id}_${trackContext || 'page'}`}
            onClick={start}
            style={{ fontSize: 14 }}
          >
            <i className="bi bi-play-circle me-2" />Watch It Build
          </button>
        </div>
      )}

      {state === 'playing' && (
        <div ref={playingRef} style={{ maxWidth: 800, margin: '0 auto' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <small className="text-muted fw-semibold" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
              <i className={`bi ${icons[scenario.id] || 'bi-building'} me-1`} />{scenario.industry} Demo
            </small>
            <button className="btn btn-outline-secondary btn-sm rounded-pill px-3" onClick={skip} style={{ fontSize: 12 }}>
              <i className="bi bi-skip-forward-fill me-1" />Skip
            </button>
          </div>
          <div className="ep-narr-bar p-3 mb-3 d-flex align-items-center gap-2">
            <span className="ep-dot" />
            <span id="ep-narr" className="flex-grow-1" />
          </div>
          <div id="ep-step-idea" className="ep-step" />
          <div id="ep-step-questions" className="ep-step" />
          <div id="ep-step-design" className="ep-step" />
          <div id="ep-step-results" className="ep-step" />
          <div id="ep-step-sim" className="ep-step" />
        </div>
      )}

      {state === 'done' && !onDemoComplete && (
        <div className="text-center py-4 px-3" style={{ background: 'var(--color-bg-alt, #f7fafc)', borderRadius: 12, border: '1px solid var(--color-border, #e2e8f0)' }}>
          <p className="fw-bold mb-2" style={{ color: 'var(--color-primary, #1a365d)', fontSize: 16 }}>
            Now design one for <strong>your</strong> business
          </p>
          <a
            href={advisoryUrl}
            className="btn btn-primary rounded-pill px-4 py-2"
            data-track={`demo_start_own_${trackContext || 'page'}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 14 }}
          >
            Design My AI Organization &rarr;
          </a>
          <div className="mt-3">
            <small className="text-muted d-block mb-2">Or watch another industry:</small>
            <div className="d-flex flex-wrap justify-content-center gap-2">
              {pool.filter(s => s.id !== scenarioRef.current.id).slice(0, 5).map((s: any) => (
                <button
                  key={s.id}
                  className="btn btn-sm btn-outline-primary rounded-pill px-3"
                  onClick={() => pickNew(s.id)}
                  style={{ fontSize: 12 }}
                >
                  <i className={`bi ${icons[s.id] || 'bi-building'} me-1`} />{s.industry}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
