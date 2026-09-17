import * as fs from 'fs';
import * as path from 'path';

/**
 * T411 - where the journey dimension is read, at source level: ONCE, inside the
 * path builder, and nowhere in the graph builder or the drill-downs.
 *
 * The behavioural half of "one read per build" is in
 * `campaignJourneyDimension.test.ts` (two queries per call, whatever the
 * population size). This half is the part a behavioural test cannot state
 * cheaply: that `buildGraphFromPaths`, `getNodeUsers`, `getEdgeUsers` and
 * `getSlicedGraphData` - which run per node, per edge and per drill - never
 * reach for it at all. A per-node lookup is the regression this pins, because
 * the graph draws dozens of nodes from one path list and the answer cannot
 * change between them.
 */

const src = fs.readFileSync(path.join(__dirname, '..', 'campaignGraphService.ts'), 'utf8');
/** The file's functions, split on their declarations, so a claim about one function is about its body. */
function bodyOf(name: string): string {
  const re = new RegExp(`(?:export )?(?:async )?function ${name}\\b`);
  const start = src.search(re);
  expect(start).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const next = rest.search(/\n(?:export )?(?:async )?function \w/);
  return next === -1 ? rest : rest.slice(0, next);
}

it('the dimension is read exactly once in the whole file, and that call is inside buildLeadPaths', () => {
  expect(src.match(/loadLeadJourneyMap\(/g)).toHaveLength(1);
  expect(bodyOf('buildLeadPaths')).toContain('await loadLeadJourneyMap(allLeads.map((l) => l.id))');
  // Outside the assembly loop: one call for the population, not one per lead.
  const builder = bodyOf('buildLeadPaths');
  const callAt = builder.indexOf('loadLeadJourneyMap');
  const loopAt = builder.indexOf('for (const lead of allLeads)');
  expect(callAt).toBeGreaterThan(-1);
  expect(loopAt).toBeGreaterThan(callAt);
});

it('the graph builder and every drill-down read the dimension off the path record and never query for it', () => {
  for (const fn of ['buildGraphFromPaths', 'getNodeUsers', 'getEdgeUsers', 'getSlicedGraphData', 'leadMatchesNode', 'buildTimelineBuckets']) {
    expect(bodyOf(fn)).not.toContain('loadLeadJourneyMap');
  }
});

it('the journey filter narrows the PATH LIST, like brand and campaign, and the filtered graph never overwrites the cache', () => {
  expect(bodyOf('filterPathsByJourney')).toContain('paths.filter((lead) => journeyMatches(lead.journey, terms))');
  const graph = bodyOf('getCampaignGraphData');
  // The journey branch derives from the unfiltered paths and returns before the cache write.
  const journeyBranch = graph.slice(graph.indexOf('hasJourneyScope(journey)'), graph.indexOf('const cacheKey'));
  expect(journeyBranch).toContain('graphCache?.leadPaths ?? []');
  expect(journeyBranch).toContain('filterPathsByJourney(allPaths');
  expect(journeyBranch).not.toContain('graphCache = {');
  // The only assignment to the cache is in the unfiltered path.
  expect(src.match(/graphCache = \{/g)).toHaveLength(1);
  // Every term the answer claims it filtered by is a term it applied: the brand half is really applied,
  // through the same campaign brand map the brand branch builds (the T411 verifier's finding).
  expect(journeyBranch).toContain('filterPathsByBrand(cohort, brandId, map)');
  expect(journeyBranch).toContain('loadCampaignBrandMap(campaignIds)');
  expect(journeyBranch).toContain('filterPathsByCampaign(cohort, campaignId)');
});

it('the dimension module writes nothing and reaches no pipeline module', () => {
  const dim = fs.readFileSync(path.join(__dirname, '..', 'campaignJourneyDimension.ts'), 'utf8');
  expect(dim).not.toMatch(/\.(create|update|destroy|upsert|bulkCreate)\(/);
  expect(dim).not.toMatch(/decisionService|classificationService|handoffService|emailService|sendNewLeadAlert|notify/);
  const imports = Array.from(dim.matchAll(/^import .* from '([^']+)';/gm)).map((m) => m[1]);
  expect(imports.sort()).toEqual(['../../models', 'sequelize']);
});
