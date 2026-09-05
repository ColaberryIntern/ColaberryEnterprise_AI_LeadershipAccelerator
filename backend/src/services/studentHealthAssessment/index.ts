// Pure barrel — no logic of its own, so nothing here can form a circular
// re-export with the files it re-exports (CLAUDE.md forbids circular module
// dependencies). See assessStudentHealth.ts for the module's own header.
export * from './types';
export * from './assessStudentHealth';
export * from './latestAssessment';
