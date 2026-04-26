/**
 * Architect Proxy Service
 *
 * HTTP client for the AI Project Architect & Build Companion
 * running at advisor.colaberry.ai. Handles project creation,
 * idea submission, auto-build triggering, and status polling.
 */

const ARCHITECT_BASE = process.env.ARCHITECT_SERVICE_URL || 'https://advisor.colaberry.ai';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
}

/**
 * Create a project on the Architect service, send the idea,
 * and start the auto-build pipeline. Returns the project slug.
 */
export async function startArchitectBuild(projectName: string, idea: string): Promise<{ slug: string }> {
  // 1. Create project
  const createRes = await fetch(`${ARCHITECT_BASE}/projects/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `project_name=${encodeURIComponent(projectName)}&blueprint=standard`,
    redirect: 'manual', // Don't follow redirect — we need the slug
  });

  // The endpoint returns a 303 redirect to /projects/{slug}
  const location = createRes.headers.get('location') || '';
  let slug = location.split('/projects/')[1] || slugify(projectName);
  slug = slug.replace(/\/$/, '');

  // If redirect didn't give us a slug, try to get it from the response
  if (!slug) {
    const body = await createRes.text();
    const match = body.match(/projects\/([a-z0-9-]+)/);
    slug = match ? match[1] : slugify(projectName);
  }

  // 2. Send the idea via chat
  await fetch(`${ARCHITECT_BASE}/projects/${slug}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: idea }),
  });

  // 3. Start auto-build (runs phases 1-8 unattended)
  await fetch(`${ARCHITECT_BASE}/projects/${slug}/auto-build/start`, {
    method: 'POST',
  });

  return { slug };
}

/**
 * Get the current status of an Architect build.
 */
export async function getArchitectStatus(slug: string): Promise<{
  phase: string;
  progress: number;
  complete: boolean;
  chapters_done: number;
  chapters_total: number;
  message: string;
}> {
  try {
    const res = await fetch(`${ARCHITECT_BASE}/projects/${slug}`);
    if (!res.ok) return { phase: 'unknown', progress: 0, complete: false, chapters_done: 0, chapters_total: 0, message: 'Unable to reach build service' };

    const html = await res.text();

    // Try to extract state from the project page
    // The project detail page contains phase info
    const phaseMatch = html.match(/current_phase['":\s]+['"](\w+)['"]/);
    const phase = phaseMatch ? phaseMatch[1] : 'unknown';

    // Map phase to progress
    const PHASE_PROGRESS: Record<string, number> = {
      idea_intake: 8,
      feature_discovery: 20,
      outline_generation: 32,
      outline_approval: 38,
      chapter_build: 60,
      quality_gates: 85,
      final_assembly: 93,
      complete: 100,
    };

    const progress = PHASE_PROGRESS[phase] || 0;
    const complete = phase === 'complete';

    // Try to get chapter count
    const chaptersMatch = html.match(/(\d+)\s*(?:of|\/)\s*(\d+)\s*chapters/i);
    const chapters_done = chaptersMatch ? parseInt(chaptersMatch[1]) : 0;
    const chapters_total = chaptersMatch ? parseInt(chaptersMatch[2]) : 11;

    // For chapter_build phase, refine progress based on chapters done
    const refinedProgress = phase === 'chapter_build' && chapters_total > 0
      ? 40 + Math.round((chapters_done / chapters_total) * 40)
      : progress;

    const PHASE_MESSAGES: Record<string, string> = {
      idea_intake: 'Analyzing your idea...',
      feature_discovery: 'Discovering system capabilities...',
      outline_generation: 'Designing system architecture...',
      outline_approval: 'Locking requirements structure...',
      chapter_build: `Writing detailed requirements (${chapters_done}/${chapters_total} chapters)...`,
      quality_gates: 'Running quality validation...',
      final_assembly: 'Assembling final blueprint...',
      complete: 'Your system is ready!',
    };

    return {
      phase,
      progress: refinedProgress,
      complete,
      chapters_done,
      chapters_total,
      message: PHASE_MESSAGES[phase] || 'Building your system...',
    };
  } catch (err: any) {
    return { phase: 'error', progress: 0, complete: false, chapters_done: 0, chapters_total: 0, message: `Build service error: ${err.message}` };
  }
}

/**
 * Fetch the completed document from the Architect service.
 * Tries the assembled markdown first, falls back to project state.
 */
export async function getArchitectDocument(slug: string): Promise<string> {
  try {
    // Try to get the project state which has chapters
    const res = await fetch(`${ARCHITECT_BASE}/projects/${slug}`);
    const html = await res.text();

    // Look for a download link to the assembled document
    const downloadMatch = html.match(/href="([^"]*Build_Guide[^"]*)"/i);
    if (downloadMatch) {
      const docRes = await fetch(`${ARCHITECT_BASE}${downloadMatch[1]}`);
      if (docRes.ok) return await docRes.text();
    }

    // Fallback: try the output directory
    const docRes = await fetch(`${ARCHITECT_BASE}/output/${slug}/`);
    if (docRes.ok) {
      const listing = await docRes.text();
      const mdMatch = listing.match(/href="([^"]*\.md)"/i);
      if (mdMatch) {
        const mdRes = await fetch(`${ARCHITECT_BASE}/output/${slug}/${mdMatch[1]}`);
        if (mdRes.ok) return await mdRes.text();
      }
    }

    return '# Requirements Document\n\nGeneration completed but document retrieval failed. Please check the Architect dashboard.';
  } catch {
    return '# Requirements Document\n\nUnable to fetch the generated document. The build may still be in progress.';
  }
}
