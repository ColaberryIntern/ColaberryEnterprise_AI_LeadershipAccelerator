import fs from 'fs';
import os from 'os';
import path from 'path';
import { extractTechStack, industryFromFilename, parseWhitepaper } from '../whitepaperParser';
import { extractNumbers, verifyOutcomesVerbatim } from '../outcomeCheck';
import { tagCapabilities } from '../capabilityVocabulary';
import { ClientNameGateError, assertNoClientNames, findClientNameHits, loadClientNames } from '../clientNameGate';

// Synthetic fixtures in the two real layouts (short Utilities form; long Manufacturing form). No real client text.
const SHORT_UTILITIES = [
  'UTILITIES INDUSTRY', '', 'Outage Text Alerts', '', 'Colaberry Inc. www.colaberry.com', 'Executive Summary', '',
  'Colaberry Inc. built an outage alert service for a major utility company. Customers get a text within minutes.', '',
  'Business Reason', 'Customers called the contact center during outages. Call volume spiked.', '',
  'Technology Used', '• AWS: hosting.', '• Angular: the web interface.', '',
  '\fColaberry Inc. www.colaberry.com', 'Outcome', 'The service launched and was well received.', '',
].join('\n');

const LONG_MANUFACTURING = [
  'MANUFACTURING COMPANIES', '', 'Bearing Failure Prediction', '', 'Colaberry Inc. www.colaberry.com', 'Executive Summary',
  'Predictive maintenance lets plants act before failure, with a 20-40% reduction in unplanned downtime.', '',
  'Business Challenge', 'Unplanned equipment failures caused costly downtime.', '', 'Solution',
  'Colaberry trained XGBoost models on sensor telemetry streamed through Kinesis to predict time-to-failure.', '',
  '\fTechnological Stack', '• Amazon SageMaker: model training.', '• AWS Glue: ETL pipelines.', '',
  'Key Results', 'Maintenance costs fell by 15-25% and asset life rose 1.5x across 12 plants.', '',
].join('\n');

describe('parseWhitepaper', () => {
  it('parses the short Utilities layout', () => {
    const r = parseWhitepaper(SHORT_UTILITIES, 'Utilities - Outage Text Alerts.pdf');
    expect(r.title).toBe('Outage Text Alerts');
    expect(r.industry).toBe('Utilities');
    expect(r.clientDescriptor).toBe('a major utility company');
    expect(r.problem).toMatch(/contact center/);
    expect(r.techStack).toEqual(['AWS', 'Angular']);
    expect(r.outcomes).toEqual([]);
    expect(r.pageCount).toBe(2);
  });

  it('parses the long Manufacturing layout, with verbatim-verified outcomes and page numbers', () => {
    const r = parseWhitepaper(LONG_MANUFACTURING, 'Manf-Bearing.pdf');
    expect(r.industry).toBe('Manufacturing');
    expect(r.solution).toMatch(/XGBoost/);
    expect(r.capabilities).toEqual(expect.arrayContaining(['Predictive Maintenance', 'Machine Learning Modeling', 'IoT & Real-Time Streaming']));
    const nums = r.outcomes.flatMap((o) => o.numbers);
    expect(nums).toEqual(expect.arrayContaining(['15-25%', '1.5x', '20-40%']));
    expect(r.outcomes.find((o) => o.numbers.includes('15-25%'))?.page).toBe(2);
    expect(verifyOutcomesVerbatim(r.outcomes, LONG_MANUFACTURING)).toEqual([]);
  });

  it('a paper with no Outcome section yields no invented outcomes and records the gap', () => {
    const r = parseWhitepaper('AGTECH INDUSTRY\nSeed Study\nExecutive Summary\nWe studied seeds for a leading agricultural company.\n', 'AgTech - Seed.pdf');
    expect(r.outcomes).toEqual([]);
    expect(r.gaps.join(' ')).toMatch(/no outcome heading/);
  });

  it('accepts the legacy "Heading: text" layout', () => {
    const r = parseWhitepaper('Load Study\nBusiness Concern: Forecasts were inaccurate.\nSolution:\nWe built propensity models reaching 90% accuracy.\n', 'Utilities - Load.pdf');
    expect(r.problem).toMatch(/inaccurate/);
    expect(r.outcomes[0].numbers).toEqual(['90%']);
  });
});

describe('outcome verbatim guard', () => {
  it('fails on a planted fake number', () => {
    expect(verifyOutcomesVerbatim([{ numbers: ['20-40%', '55%'] }], 'a 20-40% reduction')).toEqual(['55%']);
  });
  it('ignores bare years and list counters', () => {
    expect(extractNumbers('In 2024 we ran 3 pilots and saved $1.2 million (30%).')).toEqual(['$1.2 million', '30%']);
  });
});

describe('capability vocabulary', () => {
  it('is deterministic and ordered', () => {
    const t = 'Akamai WAF, demand forecasting with LSTM';
    expect(tagCapabilities(t)).toEqual(tagCapabilities(t));
    expect(tagCapabilities(t)).toEqual(['Demand & Load Forecasting', 'Time-Series Forecasting', 'Deep Learning', 'Application Security & CDN']);
    expect(industryFromFilename('ConvoAI-Agentic.pdf')).toBe('Conversational AI');
    expect(extractTechStack('• AWS: x\n• AWS: y\nplain line')).toEqual(['AWS']);
  });
});

describe('client name gate', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cn-')), 'names.txt');
  fs.writeFileSync(file, '# fictitious\nAcme Grain\nZentrix\n');
  const names = loadClientNames(file);

  it('requires the untracked names file', () => {
    expect(() => loadClientNames(undefined)).toThrow(ClientNameGateError);
    expect(() => loadClientNames(path.join(os.tmpdir(), 'nope-404.txt'))).toThrow(ClientNameGateError);
  });
  it('matches whole words case-insensitively and throws on a field hit, naming the field not the client', () => {
    expect(findClientNameHits('worked with ACME grain on seeds', names)).toEqual(['Acme Grain']);
    expect(findClientNameHits('Zentrixes', names)).toEqual([]);
    expect(() => assertNoClientNames({ title: 'ok', problem: 'Zentrix had outages' }, names)).toThrow('field "problem"');
  });
  it('the committed gate holds no client names', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'clientNameGate.ts'), 'utf8');
    for (const n of names) expect(src).not.toContain(n);
  });
});
