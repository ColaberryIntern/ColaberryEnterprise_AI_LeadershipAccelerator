// Deterministic, template-based summary composer. Stands in for the "Use Claude
// Code to generate summaries" build step from STORY-010's ticket -- no Claude API
// key/SDK is wired up in this sandbox, so a live LLM call was never actually
// runnable here. This composer can ONLY ever surface text that already exists in
// issue_positions (human/steward-entered source data) -- it rearranges/formats,
// it never invents a claim. Demo data only: subjects are fictional (see
// seeds/index.js), never real officeholders/candidates.
function composeSummaryText(subject, selectedIssues) {
  const { name, office, jurisdiction, issuePositions } = subject;
  const covered = selectedIssues.filter((issue) => issuePositions[issue]?.text);

  const intro = `${name} (${office}, ${jurisdiction}) has taken positions on ${covered.length} of the ${selectedIssues.length} issue${selectedIssues.length === 1 ? '' : 's'} you selected.`;

  const body = covered
    .map((issue) => `On ${issue}: ${issuePositions[issue].text}`)
    .join(' ');

  const provenance = `This summary is generated directly from ${covered.length} recorded position${covered.length === 1 ? '' : 's'} on file for ${name}; no claims are added beyond what is on record.`;

  return [intro, body, provenance].filter(Boolean).join(' ');
}

module.exports = { composeSummaryText };
