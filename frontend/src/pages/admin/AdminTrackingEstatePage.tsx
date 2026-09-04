import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import api from '../../utils/api';
import { PageHeader, SectionCard } from '../../components/admin/shell';

/**
 * The tracking estate as a force-directed map.
 *
 * WHY A MAP RATHER THAN A TABLE. The estate's defining problem was not that a number was
 * wrong, but that a number was a sum: five separate websites reported as one brand and no
 * table column existed to reveal it. A layout where sites hang off the brand they report
 * to makes "these five are one thing" visible before you read a single figure.
 *
 * Every number here is read from production at request time. Nothing is hardcoded, which
 * matters because the whole point is to show what is actually happening rather than what
 * a diagram once said was happening.
 */

interface EstateBrand {
  brand_slug: string;
  brand_name: string;
  tenant_slug: string;
  events_30d: number;
  visitors_30d: number;
  pageviews_24h: number;
  scroll_24h: number;
  time_on_page_24h: number;
  cta_click_24h: number;
  click_24h: number;
  top_visitor_events_30d: number;
}
interface EstateHost {
  hostname: string;
  purpose: string | null;
  brand_slug: string | null;
  is_primary: boolean;
  in_token_allowlist: boolean;
}
interface EstateSource {
  site_slug: string;
  visitors: number;
  events_30d: number;
  click_24h: number;
  scroll_24h: number;
  registered_brand: string | null;
}
interface Estate {
  brands: EstateBrand[];
  hosts: EstateHost[];
  sources: EstateSource[];
  generated_at: string;
}

type NodeKind = 'core' | 'brand' | 'host';
interface Node {
  id: string;
  kind: NodeKind;
  label: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  brand?: EstateBrand;
  host?: EstateHost;
  source?: EstateSource;
}
interface Edge { a: Node; b: Node; len: number; k: number; dashed: boolean }

const C = {
  cyan: '#5CE0FF', blue: '#4A8CFF', amber: '#FFB547',
  red: '#FF5C72', green: '#5CF2A9', dim: '#4E6484', text: '#E6EEF9',
};

const fmt = (n: number) => n.toLocaleString('en-US');

function AdminTrackingEstatePage() {
  const [estate, setEstate] = useState<Estate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<Node | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
  const dragRef = useRef<Node | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/admin/tracking/estate')
      .then((res) => { if (!cancelled) setEstate(res.data); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Could not load the estate'); });
    return () => { cancelled = true; };
  }, []);

  // Build the graph once the data arrives. Sites hang off the brand they REPORT to, which
  // is what makes a pooled brand look pooled.
  useEffect(() => {
    if (!estate) return;
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const core: Node = { id: 'core', kind: 'core', label: 'Intent engine', r: 26, x: 0, y: 0, vx: 0, vy: 0 };
    nodes.push(core);

    const byBrand = new Map<string, Node>();
    const active = estate.brands.filter((b) => b.events_30d > 0 || estate.hosts.some((h) => h.brand_slug === b.brand_slug));
    active.forEach((b, i) => {
      const ang = (i / Math.max(1, active.length)) * Math.PI * 2 - Math.PI / 2;
      const n: Node = {
        id: b.brand_slug, kind: 'brand', label: b.brand_name, brand: b,
        r: 15 + Math.log10(b.events_30d + 1) * 3.4,
        x: Math.cos(ang) * 230, y: Math.sin(ang) * 230, vx: 0, vy: 0,
      };
      nodes.push(n); byBrand.set(b.brand_slug, n);
      edges.push({ a: core, b: n, len: 240, k: 0.012, dashed: b.events_30d === 0 });
    });

    estate.hosts.forEach((h, i) => {
      const parent = h.brand_slug ? byBrand.get(h.brand_slug) : undefined;
      if (!parent) return;
      const ang = (i / estate.hosts.length) * Math.PI * 2;
      nodes.push({
        id: `h:${h.hostname}:${h.purpose}`, kind: 'host', label: h.hostname, host: h,
        r: h.in_token_allowlist ? 8 : 6,
        x: parent.x + Math.cos(ang) * 90, y: parent.y + Math.sin(ang) * 90, vx: 0, vy: 0,
      });
      edges.push({ a: parent, b: nodes[nodes.length - 1], len: 95, k: 0.03, dashed: !h.in_token_allowlist });
    });

    graphRef.current = { nodes, edges };
  }, [estate]);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const { nodes, edges } = graphRef.current;
    const W = cv.clientWidth, H = cv.clientHeight;
    const camX = W / 2, camY = H / 2;

    // physics
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.hypot(dx, dy) || 1, f = (d - e.len) * e.k;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      if (e.a !== dragRef.current) { e.a.vx += fx; e.a.vy += fy; }
      if (e.b !== dragRef.current) { e.b.vx -= fx; e.b.vy -= fy; }
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy; if (d2 < 1) d2 = 1;
        const d = Math.sqrt(d2);
        const min = a.r + b.r + 20;
        let f = (a.kind === 'host' && b.kind === 'host' ? 900 : 2600) / d2;
        if (d < min) f += (min - d) * 0.08;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        if (a !== dragRef.current) { a.vx -= fx; a.vy -= fy; }
        if (b !== dragRef.current) { b.vx += fx; b.vy += fy; }
      }
    }
    for (const n of nodes) {
      if (n === dragRef.current) continue;
      const g = n.kind === 'core' ? 0.02 : 0.0035;
      n.vx += -n.x * g; n.vy += -n.y * g;
      n.vx *= 0.86; n.vy *= 0.86;
      n.x += n.vx; n.y += n.vy;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(camX, camY);

    const related = new Set<Node>();
    if (focus) { related.add(focus); edges.forEach((e) => { if (e.a === focus) related.add(e.b); if (e.b === focus) related.add(e.a); }); }

    for (const e of edges) {
      const faded = focus && !(related.has(e.a) && related.has(e.b));
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
      ctx.setLineDash(e.dashed ? [4, 5] : []);
      ctx.strokeStyle = e.dashed ? C.red : 'rgba(92,224,255,.4)';
      ctx.globalAlpha = faded ? 0.08 : 0.6;
      ctx.lineWidth = e.a.kind === 'core' ? 1.4 : 1;
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    ctx.textBaseline = 'middle';
    for (const n of nodes) {
      const faded = focus && !related.has(n);
      ctx.globalAlpha = faded ? 0.18 : 1;
      if (n.kind === 'core') {
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = '#050C18'; ctx.fill();
        ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.font = '500 12px system-ui';
        ctx.fillText(n.label, n.x, n.y + n.r + 16);
      } else if (n.kind === 'brand') {
        const b = n.brand!;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = '#0A1526'; ctx.fill();
        ctx.setLineDash(b.events_30d === 0 ? [4, 4] : []);
        ctx.strokeStyle = b.events_30d === 0 ? C.dim : C.cyan;
        ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.font = '500 12.5px system-ui';
        ctx.fillText(b.brand_name, n.x, n.y + n.r + 16);
        ctx.fillStyle = '#8BA1BF'; ctx.font = '11px system-ui';
        ctx.fillText(b.events_30d === 0 ? 'nothing arriving' : `${fmt(b.events_30d)} events`, n.x, n.y + n.r + 31);
      } else {
        const h = n.host!;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (h.in_token_allowlist) { ctx.fillStyle = C.green; ctx.fill(); }
        else { ctx.fillStyle = '#050C18'; ctx.fill(); ctx.setLineDash([2, 2]); ctx.strokeStyle = C.dim; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
        ctx.fillStyle = faded ? C.dim : C.text; ctx.textAlign = 'left'; ctx.font = '11.5px system-ui';
        ctx.fillText(h.hostname, n.x + n.r + 7, n.y);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    rafRef.current = requestAnimationFrame(draw);
  }, [focus]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !estate) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
      const ctx = cv.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [estate, draw]);

  const pick = (clientX: number, clientY: number): Node | null => {
    const cv = canvasRef.current; if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const x = clientX - rect.left - cv.clientWidth / 2;
    const y = clientY - rect.top - cv.clientHeight / 2;
    let best: Node | null = null, bd = Infinity;
    for (const n of graphRef.current.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < n.r + 10 && d < bd) { best = n; bd = d; }
    }
    return best;
  };

  /** Sites that report to a brand whose name is not theirs — the pooling this page exists to show. */
  const pooled = useMemo(() => {
    if (!estate) return [] as EstateSource[];
    return estate.sources.filter((s) => s.registered_brand && s.registered_brand !== s.site_slug);
  }, [estate]);

  if (error) return <div className="container py-4"><div className="alert alert-danger">{error}</div></div>;
  if (!estate) return <div className="container py-4"><div className="text-muted">Loading the estate…</div></div>;

  return (
    <div className="container-fluid py-3">
      <PageHeader
        title="Tracking estate"
        subtitle="Every brand, hostname and reporting site, read from production. Drag a node; click to focus."
      />

      <SectionCard>
        <div style={{ position: 'relative', height: 560, background: '#050C18', borderRadius: 4, overflow: 'hidden' }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
            onPointerDown={(e) => { const n = pick(e.clientX, e.clientY); if (n) { dragRef.current = n; setFocus(n); (e.target as HTMLElement).setPointerCapture(e.pointerId); } else setFocus(null); }}
            onPointerMove={(e) => {
              const d = dragRef.current; if (!d) return;
              const cv = canvasRef.current!; const rect = cv.getBoundingClientRect();
              d.x = e.clientX - rect.left - cv.clientWidth / 2;
              d.y = e.clientY - rect.top - cv.clientHeight / 2;
              d.vx = 0; d.vy = 0;
            }}
            onPointerUp={() => { dragRef.current = null; }}
          />
          {focus && (
            <div style={{
              position: 'absolute', right: 16, bottom: 16, width: 300, padding: '14px 16px',
              background: 'rgba(10,21,38,.94)', border: '1px solid rgba(96,168,255,.25)',
              borderRadius: 3, color: C.text, fontSize: 13,
            }}>
              <div style={{ fontSize: 17, marginBottom: 6 }}>{focus.label}</div>
              {focus.brand && (
                <>
                  <div style={{ color: '#8BA1BF' }}>{fmt(focus.brand.events_30d)} events · {fmt(focus.brand.visitors_30d)} visitors (30d)</div>
                  <div style={{ color: '#8BA1BF', marginTop: 4 }}>
                    24h — scroll {fmt(focus.brand.scroll_24h)} · clicks {fmt(focus.brand.click_24h)} · CTA {fmt(focus.brand.cta_click_24h)}
                  </div>
                  {focus.brand.top_visitor_events_30d > focus.brand.events_30d * 0.25 && focus.brand.events_30d > 0 && (
                    <div style={{ marginTop: 8, paddingLeft: 8, borderLeft: `2px solid ${C.amber}` }}>
                      One visitor is {fmt(focus.brand.top_visitor_events_30d)} of these events
                      ({Math.round((focus.brand.top_visitor_events_30d / focus.brand.events_30d) * 100)}%). Read the total with that in mind.
                    </div>
                  )}
                </>
              )}
              {focus.host && (
                <>
                  <div style={{ color: '#8BA1BF' }}>purpose: {focus.host.purpose}</div>
                  <div style={{ marginTop: 6, color: focus.host.in_token_allowlist ? C.green : C.dim }}>
                    {focus.host.in_token_allowlist ? 'Campaign links here carry a journey token' : 'Not a linkable page — no token'}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {pooled.length > 0 && (
        <SectionCard title="Sites reporting under another brand's name">
          <p className="text-muted small mb-2">
            These report to a brand that is not named after them, so every brand-keyed number includes
            their traffic without saying so. Site totals are events by people who <em>arrived via</em> that
            site — first-touch, so a genuine cross-site visitor is credited where they landed first.
          </p>
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead><tr><th>Site</th><th>Reports to</th><th className="text-end">Events 30d</th><th className="text-end">Visitors</th><th className="text-end">Clicks 24h</th></tr></thead>
              <tbody>
                {pooled.map((s) => (
                  <tr key={s.site_slug}>
                    <td><code>{s.site_slug}</code></td>
                    <td><code>{s.registered_brand}</code></td>
                    <td className="text-end">{fmt(s.events_30d)}</td>
                    <td className="text-end">{fmt(s.visitors)}</td>
                    <td className="text-end">{fmt(s.click_24h)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <p className="text-muted small mt-2">Read from production at {new Date(estate.generated_at).toLocaleString()}.</p>
    </div>
  );
}

export default AdminTrackingEstatePage;
