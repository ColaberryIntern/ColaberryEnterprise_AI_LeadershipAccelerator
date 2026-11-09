// STORY-024: role -> permission mapping, config-file-based per the ticket's
// own suggested approach (not a database-backed user system -- this
// rehearsal has no per-person login, see decision-record-STORY-024.md).
// Deliberately narrow: data_steward is granted audit_log:read specifically.
// The general ADMIN_API_KEY used by every other admin route in this app is
// NOT mapped to any role here -- holding it alone does not grant
// audit-log access, a deliberate strengthening over the prior binary gate.
const ROLES = {
  data_steward: ['audit_log:read'],
};

// Maps each role to the env var holding its credential. One shared
// credential per role (not per person) -- see the decision record for why
// that's an intentional, flagged rehearsal-scope limitation.
const ROLE_CREDENTIAL_ENV = {
  data_steward: 'DATA_STEWARD_API_KEY',
};

module.exports = { ROLES, ROLE_CREDENTIAL_ENV };
