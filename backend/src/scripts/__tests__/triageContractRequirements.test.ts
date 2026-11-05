jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), close: jest.fn() } }));

import { renderRow, renderReport } from '../triageContractRequirements';
import { triageStatement } from '../../services/factory/proposal/requirementTriage';

const row = (canonical_req_id: string, statement: string) => ({ canonical_req_id, statement });

describe('renderRow', () => {
  it('marks a non-obligation with a star so the eye finds it', () => {
    const s = 'All Proposals received will be reviewed by a Review Panel.';
    expect(renderRow('REQ-001', triageStatement(s), s).startsWith('*')).toBe(true);
  });

  it('leaves a real obligation unmarked', () => {
    const s = 'System must support bidirectional GIS integration.';
    expect(renderRow('REQ-002', triageStatement(s), s).startsWith('*')).toBe(false);
  });

  it('clips a long statement rather than wrapping the table into noise', () => {
    const s = 'x'.repeat(400);
    expect(renderRow('REQ-003', triageStatement(s), s)).toContain('…');
  });
});

describe('renderReport', () => {
  const rows = [
    row('REQ-001', 'System must support bidirectional GIS integration.'),
    row('REQ-002', 'All Proposals received will be reviewed by a Review Panel.'),
    row('REQ-003', 'Can you provide the expected number of users by User Roles?'),
  ];
  const results = rows.map((r) => triageStatement(r.statement));

  it('leads with how many rows actually bind us', () => {
    const text = renderReport('proj-1', rows, results);
    expect(text).toContain('BINDING on us   : 1');
    expect(text).toContain("buyer's process : 1");
    expect(text).toContain('questions / Q&A : 1');
  });

  it('says plainly how many rows bind nobody but still demand a citation', () => {
    expect(renderReport('proj-1', rows, results))
      .toContain('2 of 3 rows bind nobody');
  });

  it('calls out a single-valued distribution as THE defect, not as a statistic', () => {
    const uniform = [
      row('REQ-001', 'System must integrate with GIS.'),
      row('REQ-002', 'System must provide dashboards.'),
    ];
    const text = renderReport('p', uniform, uniform.map((r) => triageStatement(r.statement)));
    expect(text).toMatch(/single-valued\s*: YES/);
    expect(text).toContain('the kind field carries no signal');
  });

  it('does not cry defect on a healthy mixed set', () => {
    expect(renderReport('p', rows, results)).toMatch(/single-valued\s*: no/);
  });
});
