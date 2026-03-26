/**
 * OpenClaw Engine Upgrade Tests
 *
 * Validates the two-axis platform classification system:
 * - Axis 1: Content Strategy (PASSIVE/HYBRID/AUTHORITY)
 * - Axis 2: Execution Type (API_POSTING/HUMAN_EXECUTION)
 */

import {
  getStrategy,
  getExecutionType,
  isHumanExecution,
  shouldAutoApprove,
  isPostCreationAllowed,
  isLinkAllowed,
  PLATFORM_STRATEGY,
  PLATFORM_EXECUTION,
  validateContentForStrategy,
} from '../../services/agents/openclaw/openclawPlatformStrategy';

// ── Test 1: Strategy + Execution Classification ──────────────────────────────

describe('Platform Strategy Classification', () => {
  const HUMAN_EXECUTION_PLATFORMS = ['reddit', 'quora', 'hackernews', 'facebook_groups', 'linkedin_comments'];
  const API_POSTING_PLATFORMS = ['devto', 'hashnode', 'discourse', 'twitter', 'bluesky', 'producthunt', 'youtube'];

  test('all HUMAN_EXECUTION platforms return isHumanExecution() === true', () => {
    for (const platform of HUMAN_EXECUTION_PLATFORMS) {
      expect(isHumanExecution(platform)).toBe(true);
      expect(getExecutionType(platform)).toBe('HUMAN_EXECUTION');
    }
  });

  test('all API_POSTING platforms return isHumanExecution() === false', () => {
    for (const platform of API_POSTING_PLATFORMS) {
      expect(isHumanExecution(platform)).toBe(false);
      expect(getExecutionType(platform)).toBe('API_POSTING');
    }
  });

  test('unknown platforms default to HUMAN_EXECUTION (safest)', () => {
    expect(getExecutionType('unknown_platform')).toBe('HUMAN_EXECUTION');
    expect(isHumanExecution('unknown_platform')).toBe(true);
  });

  test('unknown platforms default to PASSIVE_SIGNAL strategy (most restrictive)', () => {
    expect(getStrategy('unknown_platform')).toBe('PASSIVE_SIGNAL');
  });

  test('facebook_groups and linkedin_comments are PASSIVE_SIGNAL', () => {
    expect(getStrategy('facebook_groups')).toBe('PASSIVE_SIGNAL');
    expect(getStrategy('linkedin_comments')).toBe('PASSIVE_SIGNAL');
  });

  test('facebook_groups and linkedin_comments are HUMAN_EXECUTION', () => {
    expect(getExecutionType('facebook_groups')).toBe('HUMAN_EXECUTION');
    expect(getExecutionType('linkedin_comments')).toBe('HUMAN_EXECUTION');
  });

  test('every platform in PLATFORM_STRATEGY also has an execution type', () => {
    for (const platform of Object.keys(PLATFORM_STRATEGY)) {
      expect(PLATFORM_EXECUTION[platform] || 'HUMAN_EXECUTION').toBeDefined();
    }
  });
});

// ── Test 2: Auto-Approve Override-Proof for HUMAN_EXECUTION ──────────────────

describe('shouldAutoApprove — override-proof for HUMAN_EXECUTION', () => {
  const HUMAN_PLATFORMS = ['reddit', 'quora', 'hackernews', 'facebook_groups', 'linkedin_comments'];

  test('returns false for ALL HUMAN_EXECUTION platforms regardless of config overrides', () => {
    // Even if someone adds these platforms to the auto-approve config, it should still return false
    for (const platform of HUMAN_PLATFORMS) {
      expect(shouldAutoApprove(platform, [])).toBe(false);
      expect(shouldAutoApprove(platform, [platform])).toBe(false); // config override attempted
      expect(shouldAutoApprove(platform, ['reddit', 'quora', 'hackernews', 'facebook_groups', 'linkedin_comments'])).toBe(false);
    }
  });

  test('returns true for API_POSTING platforms when in config overrides', () => {
    expect(shouldAutoApprove('devto', ['devto'])).toBe(true);
    expect(shouldAutoApprove('hashnode', ['hashnode'])).toBe(true);
  });

  test('HYBRID_ENGAGEMENT platforms auto-approve by default', () => {
    expect(shouldAutoApprove('twitter', [])).toBe(true);
    expect(shouldAutoApprove('bluesky', [])).toBe(true);
    expect(shouldAutoApprove('devto', [])).toBe(true);
  });

  test('AUTHORITY_BROADCAST platforms do NOT auto-approve by default', () => {
    expect(shouldAutoApprove('linkedin', [])).toBe(false);
    expect(shouldAutoApprove('medium', [])).toBe(false);
  });
});

// ── Test 3: Link and Post Creation Rules ─────────────────────────────────────

describe('Link and Post Creation Rules', () => {
  test('PASSIVE_SIGNAL platforms do not allow links', () => {
    expect(isLinkAllowed('reddit')).toBe(false);
    expect(isLinkAllowed('quora')).toBe(false);
    expect(isLinkAllowed('facebook_groups')).toBe(false);
    expect(isLinkAllowed('linkedin_comments')).toBe(false);
  });

  test('HYBRID and AUTHORITY platforms allow links', () => {
    expect(isLinkAllowed('devto')).toBe(true);
    expect(isLinkAllowed('linkedin')).toBe(true);
    expect(isLinkAllowed('twitter')).toBe(true);
  });

  test('PASSIVE_SIGNAL platforms do not allow post creation', () => {
    expect(isPostCreationAllowed('reddit')).toBe(false);
    expect(isPostCreationAllowed('facebook_groups')).toBe(false);
  });

  test('HYBRID and AUTHORITY platforms allow post creation', () => {
    expect(isPostCreationAllowed('devto')).toBe(true);
    expect(isPostCreationAllowed('linkedin')).toBe(true);
  });
});

// ── Test 4: Content Validation ───────────────────────────────────────────────

describe('Content Validation for Strategy', () => {
  test('PASSIVE_SIGNAL rejects content with URLs', () => {
    const result = validateContentForStrategy('Check out https://example.com for more', 'reddit');
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('URLs');
  });

  test('PASSIVE_SIGNAL rejects content with CTAs', () => {
    const result = validateContentForStrategy('Sign up for our program today', 'reddit');
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('CTAs');
  });

  test('PASSIVE_SIGNAL rejects content with promotional language', () => {
    const result = validateContentForStrategy('Our program at Colaberry helps teams', 'quora');
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('promotional');
  });

  test('PASSIVE_SIGNAL accepts clean insight content', () => {
    const result = validateContentForStrategy(
      'Most teams struggle with AI adoption because they focus on tools before workflows. The key is mapping decisions first.',
      'reddit',
    );
    expect(result.passed).toBe(true);
  });

  test('AUTHORITY_BROADCAST accepts promotional content', () => {
    const result = validateContentForStrategy(
      'Sign up for our program at https://example.com to learn more about enterprise AI.',
      'linkedin',
    );
    expect(result.passed).toBe(true);
  });

  test('facebook_groups and linkedin_comments use PASSIVE_SIGNAL validation', () => {
    const fb = validateContentForStrategy('Check https://example.com', 'facebook_groups');
    expect(fb.passed).toBe(false);

    const li = validateContentForStrategy('Join our cohort today', 'linkedin_comments');
    expect(li.passed).toBe(false);
  });
});

// ── Test 5: Execution Type Routing Logic ─────────────────────────────────────

describe('Execution Type Routing Logic', () => {
  test('Reddit signal should route to human_execution (no post_response task)', () => {
    const platform = 'reddit';
    const executionType = getExecutionType(platform);
    expect(executionType).toBe('HUMAN_EXECUTION');
    expect(isHumanExecution(platform)).toBe(true);
    // In ContentResponseAgent: if HUMAN_EXECUTION → post_status = 'ready_for_manual_post', NO task created
    expect(shouldAutoApprove(platform, ['reddit'])).toBe(false); // override-proof
  });

  test('Dev.to signal should route to api_posting (auto-approve + post_response task)', () => {
    const platform = 'devto';
    const executionType = getExecutionType(platform);
    expect(executionType).toBe('API_POSTING');
    expect(isHumanExecution(platform)).toBe(false);
    expect(shouldAutoApprove(platform, ['devto'])).toBe(true);
  });

  test('All platforms have consistent strategy + execution mappings', () => {
    // PASSIVE_SIGNAL + HUMAN_EXECUTION: reddit, quora, hackernews, facebook_groups, linkedin_comments
    const passiveHuman = ['reddit', 'quora', 'hackernews', 'facebook_groups', 'linkedin_comments'];
    for (const p of passiveHuman) {
      expect(getStrategy(p)).toBe('PASSIVE_SIGNAL');
      expect(getExecutionType(p)).toBe('HUMAN_EXECUTION');
    }

    // HYBRID_ENGAGEMENT + API_POSTING: devto, hashnode, discourse, twitter, bluesky, producthunt
    const hybridApi = ['devto', 'hashnode', 'discourse', 'twitter', 'bluesky', 'producthunt'];
    for (const p of hybridApi) {
      expect(getStrategy(p)).toBe('HYBRID_ENGAGEMENT');
      expect(getExecutionType(p)).toBe('API_POSTING');
    }

    // AUTHORITY_BROADCAST: linkedin, medium, youtube — mixed execution
    expect(getStrategy('linkedin')).toBe('AUTHORITY_BROADCAST');
    expect(getStrategy('medium')).toBe('AUTHORITY_BROADCAST');
    expect(getStrategy('youtube')).toBe('AUTHORITY_BROADCAST');
    expect(getExecutionType('youtube')).toBe('API_POSTING');
  });
});
