/**
 * Every `declare created_at` must be backed by a real Sequelize attribute.
 *
 * WHY THIS EXISTS. On 2026-10-17 the legacy-compatibility guard in
 * `services/sbp/storyAuthorization.ts` was found to be dead code in production. It read
 * `project.created_at` to decide whether a student project predated the registration hook.
 * That property is `undefined` on a real `Project` instance:
 *
 *   - `Project` is initialised with `timestamps: true, underscored: true`, so the Sequelize
 *     ATTRIBUTE is `createdAt`, mapped to the `created_at` COLUMN.
 *   - The model separately writes `declare created_at: Date`. `declare` is a TYPE-ONLY
 *     declaration: it emits no runtime property.
 *   - `created_at` is absent from the `init()` attribute block.
 *
 * So `tsc` typed it as a `Date`, the runtime value was `undefined`, and the guard's defensive
 * `&&` turned that into a silent refusal. Measured against production: all 62 legacy student
 * projects were refused `no_lifecycle`, every one logging `project_created_at: null`, instead of
 * being permitted. Arming the story gate would have refused all 72 projects rather than the 10
 * the design intended.
 *
 * A UNIT TEST DID NOT CATCH IT, and that is why this file is a sweep rather than another case.
 * The test that covered the branch was green and named "PERMITS a project that predates the
 * registration hook". Its `Project.findByPk` mock returned a plain object literal carrying
 * `created_at` — the shape of the TYPE rather than of the INSTANCE. A fixture built from the
 * declaration cannot discover that the declaration is a lie; the more faithfully it matches,
 * the more certainly it passes. No amount of care at one call site finds this. Only a sweep does.
 *
 * WHAT THIS TEST DOES NOT DO. It does not fix the 141 models below. That is a change across a
 * third of the model layer and therefore ESCALATE-tier under CLAUDE.md, not something a test run
 * decides. It freezes the debt: nothing new may join the list, and nothing may stay on it after
 * being fixed.
 *
 * It reads bytes and decodes rather than shelling out to `grep`, because three `.ts` files under
 * `backend/src` carry deliberate NUL bytes and `grep -r` reports those binary and skips their
 * matching lines — a sweep built on it would report a completeness it does not have.
 */
import fs from 'fs';
import path from 'path';

const MODELS_DIR = path.join(__dirname, '..');

/** The snake_case timestamps Sequelize manages under camelCase names. */
const TIMESTAMP_FIELDS = ['created_at', 'updated_at', 'deleted_at'] as const;

/**
 * The lying field names in one model's source.
 *
 * A field lies when it is `declare`d and is NOT opened as an attribute config object. An index
 * entry reads `{ fields: ['created_at'] }` and is deliberately not matched: only `created_at: {`
 * counts, because only that shape defines an attribute.
 */
export function timestampTypeLies(source: string): string[] {
  const text = source.replace(/\r\n/g, '\n');
  return TIMESTAMP_FIELDS.filter((field) => {
    const declared = new RegExp(`^\\s*declare\\s+${field}\\s*[?!]?\\s*:`, 'm').test(text);
    const defined = new RegExp(`^\\s*${field}\\s*:\\s*\\{`, 'm').test(text);
    return declared && !defined;
  });
}

/**
 * Models carrying the lie as measured on 2026-10-17, with the fields each one lies about.
 *
 * GRANDFATHERED, NOT APPROVED. Every entry is a place where `tsc` will accept `.created_at` and
 * hand back `undefined`. Most are harmless today only because nothing reads the property that
 * way — which is exactly what was true of `Project.ts` until something did.
 *
 * To fix one: add the field to its `init()` attribute block (or set `timestamps: false` and
 * define it), then DELETE its line here. The test fails if a fixed model is still listed, so
 * this list cannot rot into a list of things that used to be wrong.
 */
const GRANDFATHERED: readonly string[] = [
  'AgentMemoryProposal.ts', // created_at, updated_at
  'AiCompany.ts', // created_at, updated_at
  'Artifact.ts', // created_at, updated_at
  'AssessmentAttempt.ts', // created_at, updated_at
  'Brand.ts', // created_at, updated_at
  'BrandDomain.ts', // created_at, updated_at
  'BuildAuthorization.ts', // created_at
  'BuildLogDraft.ts', // created_at, updated_at
  'BuilderAuthorityProfile.ts', // created_at, updated_at
  'CardSurveyResponse.ts', // created_at, updated_at
  'CaseStudy.ts', // created_at, updated_at
  'CaseStudyAiDraft.ts', // created_at, updated_at
  'CaseStudyArtifact.ts', // created_at, updated_at
  'CaseStudyChart.ts', // created_at, updated_at
  'CaseStudyCollection.ts', // created_at, updated_at
  'CaseStudyEvidence.ts', // created_at
  'CaseStudyMetric.ts', // created_at, updated_at
  'CaseStudyPublication.ts', // created_at, updated_at
  'CaseStudyQuote.ts', // created_at, updated_at
  'CaseStudyRepoCollection.ts', // created_at, updated_at
  'CaseStudyRepository.ts', // created_at, updated_at
  'CaseStudySnapshot.ts', // created_at
  'CaseStudyStoryline.ts', // created_at, updated_at
  'CertDomain.ts', // created_at, updated_at
  'CertEvidenceMapping.ts', // created_at, updated_at
  'CertQuestion.ts', // created_at, updated_at
  'CertQuestionRevision.ts', // created_at, updated_at
  'CertResponse.ts', // created_at, updated_at
  'CertSession.ts', // created_at, updated_at
  'CertTrack.ts', // created_at, updated_at
  'CommunicationPreference.ts', // created_at, updated_at
  'CommunityComment.ts', // created_at, updated_at
  'CommunityDigestLog.ts', // created_at
  'CommunityEvent.ts', // created_at, updated_at
  'CommunityMember.ts', // created_at, updated_at
  'CommunityNotification.ts', // created_at
  'CommunityPointsEvent.ts', // created_at
  'CommunityPost.ts', // created_at, updated_at
  'CommunityPostReport.ts', // created_at
  'CommunityRoom.ts', // created_at, updated_at
  'CompanyAuditLog.ts', // created_at
  'CompanyBudget.ts', // created_at, updated_at
  'CompanyDirective.ts', // created_at, updated_at
  'CompanyGoal.ts', // created_at, updated_at
  'ContentApprovalRequest.ts', // created_at, updated_at
  'ContentGenerationLog.ts', // created_at
  'ContentItem.ts', // created_at, updated_at
  'ContentTemplate.ts', // created_at, updated_at
  'ContentVariant.ts', // created_at, updated_at
  'ContractProcessDocument.ts', // created_at, updated_at
  'ContractProcessReview.ts', // created_at
  'ContractRequirement.ts', // created_at, updated_at
  'ContractTrack.ts', // created_at, updated_at
  'ContributionEvent.ts', // created_at
  'CurriculumBlueprint.ts', // created_at, updated_at
  'Decision.ts', // created_at, updated_at
  'DeliveryAgentDefinition.ts', // created_at, updated_at
  'DeliveryAgentTrustRequirement.ts', // created_at, updated_at
  'DeliveryContract.ts', // created_at, updated_at
  'DeliveryDecision.ts', // created_at, updated_at
  'DeliveryDiscovery.ts', // created_at, updated_at
  'DeliveryEngagement.ts', // created_at, updated_at
  'DeliveryEvent.ts', // created_at
  'DeliveryOpportunity.ts', // created_at, updated_at
  'DeliveryProject.ts', // created_at, updated_at
  'DeliveryProjectMember.ts', // created_at, updated_at
  'DeliveryProjectSourceLink.ts', // created_at
  'Department.ts', // created_at, updated_at
  'DepartmentEvent.ts', // created_at
  'DepartmentKpi.ts', // created_at, updated_at
  'ExternalPublication.ts', // created_at, updated_at
  'FriendReferral.ts', // created_at, updated_at
  'Friendship.ts', // created_at, updated_at
  'GovOpportunityAlias.ts', // created_at
  'GovOpportunityDismissal.ts', // created_at, updated_at
  'GovQualification.ts', // created_at, updated_at
  'GraphEdge.ts', // created_at
  'GraphEvent.ts', // created_at
  'GraphNode.ts', // created_at, updated_at
  'GrowthJourneyConversationOwnership.ts', // created_at, updated_at
  'GrowthJourneyDecision.ts', // created_at
  'GrowthJourneyExecution.ts', // created_at, updated_at
  'GrowthJourneyExecutionControl.ts', // created_at
  'GrowthJourneyHandoff.ts', // created_at, updated_at
  'GrowthJourneyInAppNudge.ts', // created_at
  'GrowthJourneyOutcome.ts', // created_at
  'GrowthJourneyPolicy.ts', // created_at, updated_at
  'GrowthJourneyProfile.ts', // created_at, updated_at
  'GrowthJourneyScoreSnapshot.ts', // created_at
  'Initiative.ts', // created_at, updated_at
  'LeadTenantContext.ts', // created_at, updated_at
  'LearnerMemory.ts', // created_at, updated_at
  'LifecycleStageFailure.ts', // created_at
  'MediaAsset.ts', // created_at, updated_at
  'MentorTurn.ts', // created_at
  'OnboardingProfile.ts', // created_at, updated_at
  'OpenHouseEvent.ts', // created_at, updated_at
  'OperatingBlueprintManifest.ts', // created_at, updated_at
  'OpsRecommendation.ts', // created_at, updated_at
  'OrgCohort.ts', // created_at, updated_at
  'OrgMember.ts', // created_at, updated_at
  'Organization.ts', // created_at, updated_at
  'PlatformIdentity.ts', // created_at, updated_at
  'PlatformIdentityLink.ts', // created_at, updated_at
  'PortfolioArtifact.ts', // created_at
  'PresentationAssignment.ts', // created_at, updated_at
  'PresentationAttempt.ts', // created_at, updated_at
  'PresentationFeedback.ts', // created_at, updated_at
  'PresentationRecording.ts', // created_at, updated_at
  'PresentationShowcase.ts', // created_at, updated_at
  'Project.ts', // created_at, updated_at
  'ProjectLifecycleState.ts', // created_at, updated_at
  'ProjectUnderstandingRecord.ts', // created_at, updated_at
  'PublishingJob.ts', // created_at, updated_at
  'ReflectionEntry.ts', // created_at, updated_at
  'RequirementsMap.ts', // created_at, updated_at
  'RoomBooking.ts', // created_at, updated_at
  'RoomBookingAttendee.ts', // created_at, updated_at
  'RoomMembership.ts', // created_at, updated_at
  'RoomMessage.ts', // created_at
  'RoomOutboxEvent.ts', // created_at, updated_at
  'RoomPresence.ts', // created_at, updated_at
  'RoomReport.ts', // created_at, updated_at
  'RoomResource.ts', // created_at, updated_at
  'RuntimeNote.ts', // created_at
  'SectionExecutionLog.ts', // created_at
  'SenderProfile.ts', // created_at, updated_at
  'ServiceOffering.ts', // created_at, updated_at
  'ShowcaseArtifact.ts', // created_at, updated_at
  'SimulationAccuracy.ts', // created_at, updated_at
  'StudentPointsEvent.ts', // created_at, updated_at
  'StudentTask.ts', // created_at, updated_at
  'StudentTaskList.ts', // created_at, updated_at
  'Tenant.ts', // created_at, updated_at
  'TenantMembership.ts', // created_at, updated_at
  'TestSimulationResult.ts', // created_at
  'TrackedLink.ts', // created_at, updated_at
  'WorkforceMeeting.ts', // created_at
  'WorkforceMemory.ts', // created_at
  'WorkforceMessage.ts', // created_at
  'WorkforceTask.ts', // created_at, updated_at
];

function modelFiles(): string[] {
  return fs
    .readdirSync(MODELS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && e.name !== 'index.ts')
    .map((e) => e.name)
    .sort();
}

function read(name: string): string {
  return fs.readFileSync(path.join(MODELS_DIR, name)).toString('utf8');
}

describe('model timestamp declarations must match runtime attributes', () => {
  it('finds every model file, so a passing sweep is not an empty one', () => {
    const files = modelFiles();
    // A guard against the sweep silently covering nothing: the directory held 509 model
    // files when this was written. A large drop means the glob broke, not that the debt was paid.
    expect(files.length).toBeGreaterThan(400);
    expect(files).toContain('Project.ts');
  });

  it('NO NEW MODEL may declare a timestamp it does not define', () => {
    const offenders = modelFiles()
      .filter((name) => !GRANDFATHERED.includes(name))
      .map((name) => ({ name, lies: timestampTypeLies(read(name)) }))
      .filter((r) => r.lies.length > 0);

    // Named, not counted: a count tells the next reader that something is wrong and not what.
    expect(offenders.map((o) => `${o.name}: ${o.lies.join(', ')}`)).toEqual([]);
  });

  it('every grandfathered entry still lies, so the list cannot go stale', () => {
    const fixed = GRANDFATHERED.filter((name) => {
      const full = path.join(MODELS_DIR, name);
      if (!fs.existsSync(full)) return true; // deleted or renamed: the entry is stale either way
      return timestampTypeLies(read(name)).length === 0;
    });

    expect(fixed).toEqual([]);
  });

  it('the model that caused the incident is on the list', () => {
    // If Project.ts ever leaves this list it should be because someone fixed it, and the test
    // above will then require the line to be removed. Pinning it here keeps the provenance.
    expect(GRANDFATHERED).toContain('Project.ts');
    expect(timestampTypeLies(read('Project.ts'))).toContain('created_at');
  });
});

describe('the detector itself', () => {
  // A sweep is only as good as its detector, and a detector that cannot be seen failing is a
  // claim rather than a check.
  const DECLARED_NOT_DEFINED = `
    class Thing extends Model {
      declare id: string;
      declare created_at: Date;
    }
    Thing.init({ id: { type: DataTypes.UUID } }, { tableName: 'things', timestamps: true });
  `;

  const DECLARED_AND_DEFINED = `
    class Thing extends Model {
      declare id: string;
      declare created_at: Date;
    }
    Thing.init({
      id: { type: DataTypes.UUID },
      created_at: { type: DataTypes.DATE, allowNull: false },
    }, { tableName: 'things', timestamps: false });
  `;

  const INDEX_ONLY = `
    class Thing extends Model {
      declare id: string;
      declare created_at: Date;
    }
    Thing.init({ id: { type: DataTypes.UUID } }, {
      tableName: 'things',
      indexes: [{ fields: ['created_at'], name: 'idx_things_created_at' }],
    });
  `;

  it('POSITIVE CONTROL: fires when a declared timestamp has no attribute', () => {
    expect(timestampTypeLies(DECLARED_NOT_DEFINED)).toEqual(['created_at']);
  });

  it('NEGATIVE CONTROL: silent when the attribute is defined', () => {
    expect(timestampTypeLies(DECLARED_AND_DEFINED)).toEqual([]);
  });

  it('an INDEX on the column is not an attribute definition', () => {
    // The distinction that makes the rule meaningful: indexing `created_at` does not give the
    // instance a `created_at` property, so this must still be reported.
    expect(timestampTypeLies(INDEX_ONLY)).toEqual(['created_at']);
  });

  it('says nothing about a model that never declares a timestamp', () => {
    expect(timestampTypeLies('class Thing extends Model { declare id: string; }')).toEqual([]);
  });

  it('is unaffected by CRLF line endings', () => {
    // Half this repo's files are CRLF and half are LF; a sweep that only works on one is a
    // sweep that quietly covers half the tree.
    expect(timestampTypeLies(DECLARED_NOT_DEFINED.replace(/\n/g, '\r\n'))).toEqual(['created_at']);
  });
});
