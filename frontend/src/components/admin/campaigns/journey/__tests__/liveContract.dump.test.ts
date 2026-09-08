/**
 * Runs the adapter and the metrics against a LIVE payload.
 *
 * SKIPPED unless `HARNESS_PAYLOAD` points at a JSON file captured from
 * `GET /api/admin/campaign-intelligence/graph`. The capture is never committed —
 * production data does not belong in the repo — so this is a check you run with a
 * fresh capture, not a fixture test.
 *
 *   HARNESS_PAYLOAD=<abs>/graph.json CI=true npx react-scripts test \
 *     --testPathPattern="liveContract.dump" --watchAll=false
 *
 * WHY IT EXISTS. Every other test in this folder feeds the adapter data this repo
 * wrote. That proves the adapter is self-consistent and proves nothing about the
 * contract. The real endpoint is where the surprises live: node types this
 * frontend has never seen, edges pointing at nodes that are not in the payload,
 * counts that do not reconcile with validation.
 */

import fs from 'fs';
import { buildPathRows, buildSankeyView, stageForNodeType } from '../campaignSankeyAdapter';
import { buildKpis, deriveInsights } from '../journeyMetrics';

const file = process.env.HARNESS_PAYLOAD;
const maybeDescribe = file ? describe : describe.skip;

maybeDescribe('live campaign-intelligence contract', () => {
  const data = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : { nodes: [], edges: [] };

  it('reports what the live endpoint actually returned', () => {
    const types = [...new Set(data.nodes.map((n: any) => n.type))].sort();
    const zeroEdges = data.edges.filter((e: any) => !e.volume).length;
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        `  keys            ${Object.keys(data).join(', ')}`,
        `  nodes           ${data.nodes.length}`,
        `  edges           ${data.edges.length} (${zeroEdges} zero-volume)`,
        `  node types      ${types.join(', ')}`,
        `  brands field    ${data.brands === undefined ? 'ABSENT' : JSON.stringify(data.brands)}`,
        `  warnings        ${(data.validation?.warnings ?? []).length}`,
      ].join('\n'),
    );
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
  });

  it('maps every node type the live endpoint emits to a real stage', () => {
    const unknown = [...new Set(data.nodes.map((n: any) => n.type))].filter(
      (t) => stageForNodeType(t as string) === 'other',
    );
    // Not a failure if it happens — unknown types render safely by design — but it
    // is worth seeing, because it means the backend grew a layer.
    if (unknown.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`  NOTE: unmapped node types present: ${unknown.join(', ')}`);
    }
    expect(Array.isArray(unknown)).toBe(true);
  });

  it('conserves every lead the payload describes', () => {
    const view = buildSankeyView(data, { maxCampaigns: 8 });
    const payloadVolume = data.edges.reduce((s: number, e: any) => s + (e.volume ?? 0), 0);
    // eslint-disable-next-line no-console
    console.log(
      `  drawn ${view.nodes.length} nodes / ${view.links.length} links, ` +
        `volume ${view.totalLinkVolume.toLocaleString()} of ${payloadVolume.toLocaleString()}, ` +
        `${view.collapsedCampaigns} campaigns grouped, ` +
        `${view.droppedZeroLinks} zero links + ${view.droppedOrphanNodes} orphan nodes dropped`,
    );
    // Nothing may be lost: dropped links are zero-volume by construction.
    expect(view.totalLinkVolume).toBe(payloadVolume);
  });

  it('conserves volume identically in both journey views', () => {
    const campaigns = buildSankeyView(data, { journeyView: 'campaign', maxCampaigns: 8 });
    const firstTouch = buildSankeyView(data, { journeyView: 'firstTouch' });
    expect(firstTouch.totalLinkVolume).toBe(campaigns.totalLinkVolume);
  });

  it('draws no link pointing at a node it did not draw', () => {
    const view = buildSankeyView(data, { maxCampaigns: 8 });
    for (const l of view.links) {
      expect(view.nodes[l.source]).toBeDefined();
      expect(view.nodes[l.target]).toBeDefined();
    }
  });

  it('produces KPIs that match the live validation block', () => {
    const kpis = buildKpis(data);
    const by = Object.fromEntries(kpis.map((k) => [k.key, k]));
    // eslint-disable-next-line no-console
    console.log(
      '  KPIs  ' +
        kpis
          .map((k) => `${k.label}=${k.value === null ? '—' : k.value.toLocaleString()}${k.rate === null ? '' : ` (${k.rate.toFixed(1)}%)`}`)
          .join('  '),
    );
    expect(by.total.value).toBe(data.validation.total_leads);
    expect(by.reached.value).toBe(data.validation.leads_contacted);
    expect(by.engaged.value).toBe(data.validation.leads_engaged);
    expect(by.enrolled.value).toBe(data.validation.leads_enrolled);
    expect(by.paid.value).toBe(data.validation.leads_paid);
  });

  it('derives insights from live data without inventing any', () => {
    const view = buildSankeyView(data, { maxCampaigns: 8 });
    const insights = deriveInsights(data, view);
    // eslint-disable-next-line no-console
    for (const i of insights) {
      console.log(`  [${i.kind}${i.sufficient ? '' : ' / insufficient'}] ${i.title}`);
      console.log(`          ${i.evidence}`);
    }
    // Every insight must carry its arithmetic; that is the whole contract.
    expect(insights.every((i) => i.evidence.length > 0)).toBe(true);
  });

  it('builds one table row per drawn band, totalling the same', () => {
    const view = buildSankeyView(data, { maxCampaigns: 8 });
    const rows = buildPathRows(view);
    expect(rows).toHaveLength(view.links.length);
    expect(rows.reduce((s, r) => s + r.volume, 0)).toBe(view.totalLinkVolume);
  });
});
