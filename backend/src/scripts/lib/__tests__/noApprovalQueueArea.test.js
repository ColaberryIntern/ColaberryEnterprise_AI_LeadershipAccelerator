// Regression guard for the 2026-06-10 assessment: the PMO generator must NOT
// recreate a standalone "Approval Queues" todolist. Oversight approvals live as
// "Review and approve X" gates inside each functional area, bound to the task
// that produces the artifact. A separate approval list only ever produced a
// parallel pile of orphaned/duplicate approvals (it was retired via
// retireApprovalQueue.js). If someone re-adds the area, these tests fail.
const fs = require('fs');
const path = require('path');
const { APPROVAL_LIST_NAME } = require('../approvalArtifactLink');

const scriptsDir = path.join(__dirname, '..', '..'); // backend/src/scripts
function src(file) { return fs.readFileSync(path.join(scriptsDir, file), 'utf8'); }

describe('generator never regenerates a standalone Approval Queues list', () => {
  test('contract name is unchanged ("Approval Queues")', () => {
    // The guards below hard-code the name; this keeps them honest if it changes.
    expect(APPROVAL_LIST_NAME).toBe('Approval Queues');
  });

  test('setupLaunchProject.js does not declare an "Approval Queues" todolist', () => {
    expect(src('setupLaunchProject.js')).not.toMatch(/name:\s*['"]Approval Queues['"]/);
  });

  test('generateLaunchTasks.js AREA_CONFIG has no "Approval Queues" area key', () => {
    // matches  'Approval Queues':  (an object/map key), not prose mentions
    expect(src('generateLaunchTasks.js')).not.toMatch(/['"]Approval Queues['"]\s*:/);
  });
});
