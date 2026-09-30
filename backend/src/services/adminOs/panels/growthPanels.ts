import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/**
 * How a person is DEVELOPING, and who they are beyond their enrolment row.
 *
 * Four panels the audit surfaced that nobody asked for by name but that answer
 * the questions a mentor or an account owner actually has:
 *
 *   skills   what they can demonstrate, and on what evidence
 *   mentor   what they have asked the AI, and what it concluded about them
 *   content  what they consume, which is the only engagement signal that
 *            survives when attendance is not taken
 *   context  their company, role, goal and AI maturity — the personalisation
 *            record that drives their curriculum, never shown to staff before
 *
 * ── WHY CONTENT CONSUMPTION MATTERS MORE THAN IT LOOKS ──────────────────────
 *
 * lifecycle.ts marks active_learner as not joinable because attendance is
 * unreliable. Podcast, blog and video views are not: they are written on the
 * learner's own action, every time. For anyone outside a cohort with a
 * register, this is the engagement record.
 */

export interface SkillsPanel {
  level: { slug: string | null; rank: number | null; architectReadiness: number | null; promotedAt: string | null } | null;
  competencies: Array<{ domainId: string; confidence: number | null; evidenceCount: number | null; lastEvidenceAt: string | null }>;
  architectureSkills: Array<{ skillId: string; proficiency: number | null; confidence: number | null; evidenceCount: number | null }>;
  evidenceRecords: number;
  validatedEvidence: number;
  skillEvidence: number;
  resumeSkillClaims: number;
  xpTotal: number | null;
  pointsTotal: number | null;
}

export interface MentorPanel {
  mentorTurns: number;
  lastTurnAt: string | null;
  memory: { summary: string | null; goals: string | null; lastDistilledOn: string | null } | null;
  assessments: Array<{
    kind: string | null; score: number | null; passed: boolean | null;
    week: number | null; attemptNumber: number | null; submittedAt: string | null;
  }>;
  architectEvaluations: Array<{ weekNumber: number | null; overallScore: number | null; evaluatedAt: string | null }>;
}

export interface ContentPanel {
  podcasts: number;
  blogPosts: number;
  videos: number;
  feedImpressions: number;
  feedInteractions: number;
  aiPulseExposures: number;
  lastConsumedAt: string | null;
  recent: Array<{ kind: string; title: string | null; at: string | null; seenCount: number | null }>;
}

export interface CommunityPanel {
  level: number | null;
  points: number | null;
  posts: number;
  likesGiven: number;
  contributions: number;
  pointsEvents: number;
  rooms: Array<{ role: string | null; accessState: string | null; joinedAt: string | null }>;
  roomMessages: number;
  referrals: number;
}

export interface ProfileContextPanel {
  industry: string | null;
  companyName: string | null;
  companySize: string | null;
  role: string | null;
  goal: string | null;
  aiMaturityLevel: number | null;
  identifiedUseCase: string | null;
  linkedinUrl: string | null;
  resumeFileName: string | null;
  resumeUploadedAt: string | null;
  githubRepos: Array<{ repoUrl: string | null; language: string | null; fileCount: number | null; lastSyncAt: string | null }>;
}

export async function loadSkills(enrollmentIds: string[]): Promise<SkillsPanel | null> {
  if (enrollmentIds.length === 0) return null;
  const replacements = { ids: enrollmentIds };

  const [level, competencies, archSkills, totals] = await Promise.all([
    sequelize.query<{ slug: string | null; rank: number | null; architectReadiness: number | null; promotedAt: string | null }>(
      `SELECT level_slug AS slug, rank, architect_readiness AS "architectReadiness",
              promoted_at AS "promotedAt"
       FROM student_level WHERE enrollment_id IN (:ids)
       ORDER BY rank DESC NULLS LAST LIMIT 1`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{ domainId: string; confidence: number | null; evidenceCount: number | null; lastEvidenceAt: string | null }>(
      `SELECT domain_id AS "domainId", confidence, evidence_count AS "evidenceCount",
              last_evidence_at AS "lastEvidenceAt"
       FROM student_competency WHERE enrollment_id IN (:ids)
       ORDER BY confidence DESC NULLS LAST LIMIT 30`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{ skillId: string; proficiency: number | null; confidence: number | null; evidenceCount: number | null }>(
      `SELECT skill_id AS "skillId", proficiency, confidence, evidence_count AS "evidenceCount"
       FROM student_architecture_skill WHERE enrollment_id IN (:ids)
       ORDER BY proficiency DESC NULLS LAST LIMIT 30`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{
      evidence: string; validated: string; skill_evidence: string;
      claims: string; xp: string | null; points: string | null;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM evidence_records WHERE enrollment_id IN (:ids))::text AS evidence,
         (SELECT COUNT(*) FROM evidence_records WHERE enrollment_id IN (:ids) AND validated)::text AS validated,
         (SELECT COUNT(*) FROM student_skill_evidence WHERE enrollment_id IN (:ids))::text AS skill_evidence,
         (SELECT COUNT(*) FROM resume_skill_claims WHERE enrollment_id IN (:ids))::text AS claims,
         (SELECT SUM(amount)::text FROM xp_events WHERE enrollment_id IN (:ids)) AS xp,
         (SELECT SUM(points)::text FROM student_points_events WHERE enrollment_id IN (:ids)) AS points`,
      { type: QueryTypes.SELECT, replacements },
    ),
  ]);

  const t = totals[0];
  return {
    level: level[0] ?? null,
    competencies,
    architectureSkills: archSkills,
    evidenceRecords: Number(t?.evidence ?? 0),
    validatedEvidence: Number(t?.validated ?? 0),
    skillEvidence: Number(t?.skill_evidence ?? 0),
    resumeSkillClaims: Number(t?.claims ?? 0),
    xpTotal: t?.xp != null ? Number(t.xp) : null,
    pointsTotal: t?.points != null ? Number(t.points) : null,
  };
}

export async function loadMentor(enrollmentIds: string[]): Promise<MentorPanel | null> {
  if (enrollmentIds.length === 0) return null;
  const replacements = { ids: enrollmentIds };

  const [turns, memory, assessments, evaluations] = await Promise.all([
    sequelize.query<{ count: string; last_at: string | null }>(
      `SELECT COUNT(*)::text AS count, MAX(created_at) AS last_at
       FROM runtime_mentor_turns WHERE enrollment_id IN (:ids)`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{ summary: string | null; goals: string | null; lastDistilledOn: string | null }>(
      `SELECT summary, goals, last_distilled_on AS "lastDistilledOn"
       FROM learner_memory WHERE enrollment_id IN (:ids)
       ORDER BY updated_at DESC LIMIT 1`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{
      kind: string | null; score: number | null; passed: boolean | null;
      week: number | null; attemptNumber: number | null; submittedAt: string | null;
    }>(
      `SELECT kind, score, passed, week, attempt_number AS "attemptNumber",
              submitted_at AS "submittedAt"
       FROM runtime_assessment_attempts WHERE enrollment_id IN (:ids)
       ORDER BY submitted_at DESC NULLS LAST LIMIT 25`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{ weekNumber: number | null; overallScore: number | null; evaluatedAt: string | null }>(
      `SELECT week_number AS "weekNumber", overall_score AS "overallScore",
              evaluated_at AS "evaluatedAt"
       FROM architect_evaluations WHERE enrollment_id IN (:ids)
       ORDER BY evaluated_at DESC NULLS LAST LIMIT 15`,
      { type: QueryTypes.SELECT, replacements },
    ),
  ]);

  return {
    mentorTurns: Number(turns[0]?.count ?? 0),
    lastTurnAt: turns[0]?.last_at ?? null,
    memory: memory[0] ?? null,
    assessments,
    architectEvaluations: evaluations,
  };
}

export async function loadContent(enrollmentIds: string[]): Promise<ContentPanel | null> {
  if (enrollmentIds.length === 0) return null;
  const replacements = { ids: enrollmentIds };

  const [counts, recent] = await Promise.all([
    sequelize.query<{
      podcasts: string; blogs: string; videos: string;
      impressions: string; interactions: string; pulse: string; last_at: string | null;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM podcast_views WHERE enrollment_id IN (:ids))::text AS podcasts,
         (SELECT COUNT(*) FROM blog_post_views WHERE enrollment_id IN (:ids))::text AS blogs,
         (SELECT COUNT(*) FROM network_video_views WHERE enrollment_id IN (:ids))::text AS videos,
         (SELECT COUNT(*) FROM today_feed_impressions WHERE enrollment_id IN (:ids))::text AS impressions,
         (SELECT COUNT(*) FROM today_feed_impressions
           WHERE enrollment_id IN (:ids) AND interacted_at IS NOT NULL)::text AS interactions,
         (SELECT COUNT(*) FROM cape_ai_pulse_exposure WHERE enrollment_id IN (:ids))::text AS pulse,
         (SELECT MAX(last_seen_at) FROM podcast_views WHERE enrollment_id IN (:ids)) AS last_at`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{ kind: string; title: string | null; at: string | null; seenCount: number | null }>(
      `SELECT 'podcast' AS kind, p.title, pv.last_seen_at AS at, pv.seen_count AS "seenCount"
       FROM podcast_views pv LEFT JOIN podcasts p ON p.id = pv.podcast_id
       WHERE pv.enrollment_id IN (:ids)
       UNION ALL
       SELECT 'blog', b.title, bv.last_seen_at, bv.seen_count
       FROM blog_post_views bv LEFT JOIN blog_posts b ON b.id = bv.blog_post_id
       WHERE bv.enrollment_id IN (:ids)
       UNION ALL
       SELECT 'video', nv.title, vv.last_seen_at, vv.seen_count
       FROM network_video_views vv LEFT JOIN network_videos nv ON nv.id = vv.video_id
       WHERE vv.enrollment_id IN (:ids)
       ORDER BY at DESC NULLS LAST LIMIT 25`,
      { type: QueryTypes.SELECT, replacements },
    ),
  ]);

  const c = counts[0];
  return {
    podcasts: Number(c?.podcasts ?? 0),
    blogPosts: Number(c?.blogs ?? 0),
    videos: Number(c?.videos ?? 0),
    feedImpressions: Number(c?.impressions ?? 0),
    feedInteractions: Number(c?.interactions ?? 0),
    aiPulseExposures: Number(c?.pulse ?? 0),
    lastConsumedAt: c?.last_at ?? null,
    recent,
  };
}

export async function loadCommunity(enrollmentIds: string[]): Promise<CommunityPanel | null> {
  if (enrollmentIds.length === 0) return null;
  const replacements = { ids: enrollmentIds };

  const rows = await sequelize.query<{
    level: number | null; points: number | null; posts: string; likes: string;
    contributions: string; points_events: string; room_messages: string; referrals: string;
  }>(
    `WITH m AS (SELECT id, level, points FROM community_members WHERE enrollment_id IN (:ids))
     SELECT
       (SELECT MAX(level) FROM m) AS level,
       (SELECT SUM(points) FROM m) AS points,
       (SELECT COUNT(*) FROM community_posts WHERE member_id IN (SELECT id FROM m))::text AS posts,
       (SELECT COUNT(*) FROM community_likes WHERE member_id IN (SELECT id FROM m))::text AS likes,
       (SELECT COUNT(*) FROM community_contributions WHERE enrollment_id IN (:ids))::text AS contributions,
       (SELECT COUNT(*) FROM community_points_events WHERE member_id IN (SELECT id FROM m))::text AS points_events,
       (SELECT COUNT(*) FROM room_messages WHERE enrollment_id IN (:ids))::text AS room_messages,
       (SELECT COUNT(*) FROM friend_referrals WHERE enrollment_id IN (:ids))::text AS referrals`,
    { type: QueryTypes.SELECT, replacements },
  );

  const rooms = await sequelize.query<{ role: string | null; accessState: string | null; joinedAt: string | null }>(
    `SELECT role, access_state AS "accessState", joined_at AS "joinedAt"
     FROM room_memberships WHERE enrollment_id IN (:ids)
     ORDER BY joined_at DESC NULLS LAST LIMIT 20`,
    { type: QueryTypes.SELECT, replacements },
  );

  const r = rows[0];
  return {
    level: r?.level ?? null,
    points: r?.points ?? null,
    posts: Number(r?.posts ?? 0),
    likesGiven: Number(r?.likes ?? 0),
    contributions: Number(r?.contributions ?? 0),
    pointsEvents: Number(r?.points_events ?? 0),
    rooms,
    roomMessages: Number(r?.room_messages ?? 0),
    referrals: Number(r?.referrals ?? 0),
  };
}

export async function loadProfileContext(enrollmentIds: string[]): Promise<ProfileContextPanel | null> {
  if (enrollmentIds.length === 0) return null;
  const replacements = { ids: enrollmentIds };

  const [curriculum, onboarding, repos] = await Promise.all([
    sequelize.query<{
      industry: string | null; companyName: string | null; companySize: string | null;
      role: string | null; goal: string | null; aiMaturityLevel: number | null;
      identifiedUseCase: string | null;
    }>(
      `SELECT industry, company_name AS "companyName", company_size AS "companySize",
              role, goal, ai_maturity_level AS "aiMaturityLevel",
              identified_use_case AS "identifiedUseCase"
       FROM user_curriculum_profiles WHERE enrollment_id IN (:ids)
       ORDER BY updated_at DESC LIMIT 1`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{ linkedinUrl: string | null; resumeFileName: string | null; resumeUploadedAt: string | null }>(
      `SELECT linkedin_url AS "linkedinUrl", resume_file_name AS "resumeFileName",
              resume_uploaded_at AS "resumeUploadedAt"
       FROM onboarding_profiles WHERE enrollment_id IN (:ids)
       ORDER BY updated_at DESC LIMIT 1`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{ repoUrl: string | null; language: string | null; fileCount: number | null; lastSyncAt: string | null }>(
      `SELECT repo_url AS "repoUrl", repo_language AS language, file_count AS "fileCount",
              last_sync_at AS "lastSyncAt"
       FROM github_connections WHERE enrollment_id IN (:ids)
       ORDER BY last_sync_at DESC NULLS LAST LIMIT 10`,
      { type: QueryTypes.SELECT, replacements },
    ),
  ]);

  const c = curriculum[0];
  const o = onboarding[0];
  if (!c && !o && repos.length === 0) return null;

  return {
    industry: c?.industry ?? null,
    companyName: c?.companyName ?? null,
    companySize: c?.companySize ?? null,
    role: c?.role ?? null,
    goal: c?.goal ?? null,
    aiMaturityLevel: c?.aiMaturityLevel ?? null,
    identifiedUseCase: c?.identifiedUseCase ?? null,
    linkedinUrl: o?.linkedinUrl ?? null,
    resumeFileName: o?.resumeFileName ?? null,
    resumeUploadedAt: o?.resumeUploadedAt ?? null,
    githubRepos: repos,
  };
}
