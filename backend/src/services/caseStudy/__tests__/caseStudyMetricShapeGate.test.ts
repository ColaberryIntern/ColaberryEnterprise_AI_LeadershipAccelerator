import { evaluateCaseStudyPublishGate } from '../caseStudyPublishGate';
import { scoreCaseStudyReadiness } from '../caseStudyReadinessService';
import type {
  CaseStudyMetricEntry,
  CaseStudySnapshotContent,
} from '../../../types/caseStudy';
import type {
  CaseStudyPublishDecision,
  CaseStudyPublishGateInput,
} from '../caseStudyPublishRules';

/**
 * The shaped-metric publish rules, and the one promise underneath all of them.
 *
 * THE LAST DESCRIBE BLOCK IS THE IMPORTANT ONE. Every rule here is a no-op on a
 * metric with no `shape` and no `collected`, which is every metric written
 * before shapes existed. An additive feature that retroactively blocked the
 * library it was added to would be a worse defect than the one it fixes, so
 * that is asserted directly rather than assumed from reading the code.
 */

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

function metric(over: Partial<CaseStudyMetricEntry> = {}): CaseStudyMetricEntry {
  return {
    key: 'modules_with_tests',
    label: 'Modules with a test file',
    valueDisplay: '4 of 7',
    metricType: 'quality',
    verification: { class: 'verified', method: 'repo' },
    isHeadline: false,
    publishable: true,
    ...over,
  } as CaseStudyMetricEntry;
}

function content(metrics: readonly CaseStudyMetricEntry[]): CaseStudySnapshotContent {
  return {
    identity: {
      slug: 'shaped', title: 'A shaped record', standfirst: 'One line.',
      summary: 'A summary.', builtByType: 'learner',
    },
    heroMetrics: [],
    measurement: { metrics: [...metrics] },
    repositories: [{
      repoOwner: 'o', repoName: 'r', repoUrl: 'https://github.com/o/r',
      role: 'primary', visibility: 'public', accessStatus: 'connected',
      allowPublicRepoLink: true, defaultBranch: 'main', lastSeenSha: SHA,
    }],
    taxonomy: {
      industry: 'software', primaryCapability: 'platform',
      capabilities: ['platform'], stack: ['typescript'],
      deliverables: ['service'], projectStatus: 'shipped',
    },
  } as unknown as CaseStudySnapshotContent;
}

const gate = (metrics: readonly CaseStudyMetricEntry[]): CaseStudyPublishDecision =>
  evaluateCaseStudyPublishGate({
    surfaceKey: 'enterprise',
    caseStudy: {
      id: 'cs-1', status: 'approved',
      organizationIdentityMode: 'anonymized', organizationNamingConsent: false,
      organizationDisplayName: null,
      builderIdentityMode: 'role_only', builderNamingConsent: false,
      archivedAt: null,
    },
    snapshot: {
      id: 'snap-1', version: 1, status: 'approved',
      approvedBy: 'ali@colaberry.com', approvedAt: '2026-09-01T00:00:00.000Z',
      content: content(metrics), provenance: {},
    },
  } as CaseStudyPublishGateInput);

const codes = (metrics: readonly CaseStudyMetricEntry[]): readonly string[] => gate(metrics).codes;

describe('metric shape publish rules', () => {
  it('blocks a shape whose payload says something else', () => {
    // The card would be told to draw a meter from numbers that are not there.
    expect(codes([metric({
      shape: 'ratio',
      payload: { shape: 'count', value: 4 },
    })])).toContain('metric_shape_payload_mismatch');
  });

  it('blocks a declared shape with no payload at all', () => {
    expect(codes([metric({ shape: 'ratio' })])).toContain('metric_shape_payload_mismatch');
  });

  it('blocks a ratio with no usable denominator, which is the original defect', () => {
    // "4 of 7" with no 7, restated in a structured field where it looks fixed.
    expect(codes([metric({
      shape: 'ratio',
      payload: { shape: 'ratio', numerator: 4, denominator: 0 },
    })])).toContain('metric_ratio_missing_denominator');
  });

  it('blocks a share with no usable denominator', () => {
    expect(codes([metric({
      shape: 'share',
      payload: { shape: 'share', numerator: 46, denominator: 0 },
    })])).toContain('metric_ratio_missing_denominator');
  });

  it('blocks more members than the total they are counted against', () => {
    // A reader can count the names, so this is a claim they catch.
    expect(codes([metric({
      shape: 'ratio',
      payload: {
        shape: 'ratio', numerator: 1, denominator: 2,
        members: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      },
    })])).toContain('metric_members_count_mismatch');
  });

  it('blocks a numerator that disagrees with the members marked yes', () => {
    expect(codes([metric({
      shape: 'ratio',
      payload: {
        shape: 'ratio', numerator: 3, denominator: 2,
        members: [{ name: 'a', status: 'yes' }, { name: 'b', status: 'no' }],
      },
    })])).toContain('metric_members_count_mismatch');
  });

  it('allows a CAPPED member list, because a collector may list 40 of 200', () => {
    expect(codes([metric({
      shape: 'ratio',
      payload: {
        shape: 'ratio', numerator: 90, denominator: 200,
        members: [{ name: 'a', status: 'no' }, { name: 'b', status: 'yes' }],
      },
    })])).not.toContain('metric_members_count_mismatch');
  });

  it('blocks a count that lists more members than it counts', () => {
    expect(codes([metric({
      key: 'decision_records',
      shape: 'count',
      payload: { shape: 'count', value: 1, members: [{ name: 'a' }, { name: 'b' }] },
    })])).toContain('metric_members_count_mismatch');
  });

  it('blocks a figure computed at a commit the record is not pinned to', () => {
    // The promise is "run this at this commit and you get this number". Against
    // a commit nobody is reading about, that promise fails when checked.
    expect(codes([metric({
      shape: 'count',
      payload: { shape: 'count', value: 2 },
      collected: {
        collectorKey: 'decision_records', collectedSha: OTHER_SHA,
        reproduceCommand: 'git ls-tree -r --name-only ' + OTHER_SHA,
        outputHash: 'c'.repeat(64), collectedAt: '2026-09-09T00:00:00.000Z',
      },
    })])).toContain('metric_collected_sha_mismatch');
  });

  it('allows a figure computed at the pinned commit', () => {
    expect(codes([metric({
      shape: 'count',
      payload: { shape: 'count', value: 2 },
      collected: {
        collectorKey: 'decision_records', collectedSha: SHA,
        reproduceCommand: 'git ls-tree -r --name-only ' + SHA,
        outputHash: 'c'.repeat(64), collectedAt: '2026-09-09T00:00:00.000Z',
      },
    })])).not.toContain('metric_collected_sha_mismatch');
  });

  it('ignores a metric nobody will see, like every other content rule', () => {
    const broken = metric({ publishable: false, shape: 'ratio', payload: { shape: 'count', value: 1 } });
    expect(codes([broken])).not.toContain('metric_shape_payload_mismatch');
  });
});

describe('an unshaped metric triggers none of it', () => {
  it('raises no shape blocker on the record shape every case study had yesterday', () => {
    const legacy = metric({
      valueDisplay: '4 of 7',
      measurement: { limitations: ['A file count is not coverage.'] },
    });
    expect(legacy.shape).toBeUndefined();
    const raised = codes([legacy]);
    for (const code of [
      'metric_shape_payload_mismatch',
      'metric_ratio_missing_denominator',
      'metric_members_count_mismatch',
      'metric_collected_sha_mismatch',
    ]) {
      expect(raised).not.toContain(code);
    }
  });
});

describe('plain-language readiness warning', () => {
  const report = (metrics: readonly CaseStudyMetricEntry[]) => scoreCaseStudyReadiness({
    content: content(metrics),
  } as never);

  it('warns when a SHAPED metric has no plain-language answers', () => {
    const warnings = report([metric({ shape: 'count', payload: { shape: 'count', value: 2 } })]).warnings;
    expect(warnings.map((w) => w.code)).toEqual(['metric_plain_missing']);
    expect(warnings[0].remedy).toContain('what it does not show');
  });

  it('stays silent on an unshaped metric, so an old record is not buried in notices', () => {
    expect(report([metric()]).warnings).toEqual([]);
  });

  it('stays silent once the three answers are written', () => {
    expect(report([metric({
      shape: 'count',
      payload: { shape: 'count', value: 2 },
      plain: {
        counts: 'Decision records committed to the repository.',
        from: 'The tree at the pinned commit.',
        cannotShow: 'Whether anybody followed them.',
      },
    })]).warnings).toEqual([]);
  });

  it('costs no points, because the rubric is a balanced budget', () => {
    const shaped = report([metric({ shape: 'count', payload: { shape: 'count', value: 2 } })]);
    const plain = report([metric()]);
    expect(shaped.score).toBe(plain.score);
  });
});
