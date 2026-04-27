/**
 * Architect Proxy Service
 *
 * HTTP client for the AI Project Architect & Build Companion
 * running at advisor.colaberry.ai.
 *
 * The Architect has an 8-phase pipeline:
 * 1. idea_intake → 2. feature_discovery → 3. outline_generation
 * → 4. outline_approval → 5. chapter_build → 6. quality_gates
 * → 7. final_assembly → 8. complete
 *
 * Phases 1-4 are driven by the chat engine (conversation-based).
 * Phase 5-7 run via auto-build (unattended).
 *
 * This service creates the project, submits the idea, approves
 * features/outline to advance through phases 1-4, then starts
 * auto-build for phases 5-7.
 */

const ARCHITECT_BASE = process.env.ARCHITECT_SERVICE_URL || 'https://advisor.colaberry.ai';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
}

/**
 * Create a project and drive it through all phases.
 * This runs asynchronously — returns the slug immediately,
 * then continues driving phases in the background.
 */
export async function startArchitectBuild(projectName: string, idea: string): Promise<{ slug: string }> {
  // Use idea's first line or first 50 chars as project name (more descriptive than org name)
  const ideaName = idea.split('\n')[0].substring(0, 80).replace(/[^\w\s-]/g, '').trim() || projectName;
  const fullName = `${ideaName} - ${Date.now().toString(36)}`.substring(0, 100); // Add timestamp to avoid collisions

  // 1. Create project
  const createRes = await fetch(`${ARCHITECT_BASE}/projects/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `project_name=${encodeURIComponent(fullName)}&blueprint=standard`,
    redirect: 'manual',
  });

  const location = createRes.headers.get('location') || '';
  const slugPart = location.split('/projects/')[1] || '';
  let slug = slugPart.split('/')[0] || slugify(projectName);
  slug = slug.replace(/\/$/, '');

  if (!slug) {
    const body = await createRes.text();
    const match = body.match(/projects\/([a-z0-9-]+)/);
    slug = match ? match[1] : slugify(projectName);
  }

  console.log(`[ArchitectProxy] Created project: ${slug}`);

  // 2. Drive through phases in background (don't await — return slug immediately)
  drivePhases(slug, idea).catch(err => {
    console.error(`[ArchitectProxy] Phase driving failed for ${slug}:`, err.message);
  });

  return { slug };
}

/**
 * Drive the project through phases 1-4 via chat, then start auto-build.
 * This runs in the background — takes 1-2 minutes for phases 1-4,
 * then 10-12 minutes for auto-build (phases 5-7).
 */
async function drivePhases(slug: string, idea: string): Promise<void> {
  const chat = async (message: string): Promise<any> => {
    try {
      const res = await fetch(`${ARCHITECT_BASE}/projects/${slug}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => ({}));
      console.log(`[ArchitectProxy] Chat for ${slug}: phase=${data.phase || data.current_phase || '?'}, msg=${(data.message || '').substring(0, 80)}`);
      return data;
    } catch (err: any) {
      console.warn(`[ArchitectProxy] Chat failed for ${slug}:`, err.message);
      return {};
    }
  };

  const postEndpoint = async (path: string): Promise<any> => {
    try {
      const res = await fetch(`${ARCHITECT_BASE}/projects/${slug}/${path}`, { method: 'POST' });
      const text = await res.text();
      console.log(`[ArchitectProxy] POST ${path} for ${slug}: ${res.status} ${text.substring(0, 100)}`);
      return { status: res.status, ok: res.ok };
    } catch (err: any) {
      console.warn(`[ArchitectProxy] POST ${path} failed:`, err.message);
      return { status: 0, ok: false };
    }
  };

  // Phase 1: Send the idea via chat — this triggers idea_intake → feature_discovery
  console.log(`[ArchitectProxy] Phase 1: Sending idea to ${slug}`);
  let chatResult = await chat(idea);

  // The chat engine may need multiple turns to advance through phases
  // Keep sending confirmations until we get past feature_discovery
  for (let i = 0; i < 5; i++) {
    await sleep(3000);
    const phase = chatResult?.phase || chatResult?.current_phase || '';
    console.log(`[ArchitectProxy] Current phase for ${slug}: ${phase} (attempt ${i + 1})`);

    if (phase === 'feature_discovery' || phase === 'outline_generation') break;

    // Send a follow-up to advance
    chatResult = await chat('yes, proceed with all suggested features');
  }

  // Phase 2: Auto-select features and approve
  console.log(`[ArchitectProxy] Phase 2: Selecting features for ${slug}`);
  await postEndpoint('api/select-features');
  await sleep(2000);
  await postEndpoint('approve-features');
  await sleep(3000);

  // Phase 3: Generate outline
  console.log(`[ArchitectProxy] Phase 3: Generating outline for ${slug}`);
  await postEndpoint('generate-outline');
  // Wait for outline generation (can take 10-30 seconds)
  await sleep(15000);

  // Phase 4: Approve outline
  console.log(`[ArchitectProxy] Phase 4: Approving outline for ${slug}`);
  await postEndpoint('approve-outline');
  await sleep(5000);

  // Phase 5-7: Start auto-build (may take 10+ minutes)
  console.log(`[ArchitectProxy] Phase 5: Starting auto-build for ${slug}`);
  const buildResult = await postEndpoint('auto-build/start');
  if (!buildResult.ok) {
    console.warn(`[ArchitectProxy] Auto-build failed, trying chat fallback for ${slug}`);
    // Try chat to see what phase we're actually in
    const statusChat = await chat('what phase are we in? please continue building');
    console.log(`[ArchitectProxy] Chat fallback response: ${JSON.stringify(statusChat).substring(0, 200)}`);
  } else {
    console.log(`[ArchitectProxy] Auto-build successfully started for ${slug}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    // Try the project detail page
    const res = await fetch(`${ARCHITECT_BASE}/projects/${slug}`);
    if (!res.ok) return { phase: 'unknown', progress: 0, complete: false, chapters_done: 0, chapters_total: 0, message: 'Unable to reach build service' };

    const html = await res.text();

    // Extract phase from page content
    const phaseMatch = html.match(/current_phase['":\s]+['"](\w+)['"]/i)
      || html.match(/Phase:\s*(\w[\w\s]*?)(?:<|"|')/i)
      || html.match(/class="[^"]*phase[^"]*"[^>]*>([^<]+)/i);
    let phase = phaseMatch ? phaseMatch[1].trim().toLowerCase().replace(/\s+/g, '_') : 'idea_intake';

    // Normalize phase names
    if (phase.includes('idea') || phase.includes('intake')) phase = 'idea_intake';
    else if (phase.includes('feature') || phase.includes('discovery')) phase = 'feature_discovery';
    else if (phase.includes('outline') && phase.includes('gen')) phase = 'outline_generation';
    else if (phase.includes('outline') && phase.includes('approv')) phase = 'outline_approval';
    else if (phase.includes('chapter') || phase.includes('build')) phase = 'chapter_build';
    else if (phase.includes('quality') || phase.includes('gate')) phase = 'quality_gates';
    else if (phase.includes('final') || phase.includes('assembly')) phase = 'final_assembly';
    else if (phase.includes('complete') || phase.includes('done')) phase = 'complete';

    const PHASE_PROGRESS: Record<string, number> = {
      idea_intake: 8, feature_discovery: 20, outline_generation: 32,
      outline_approval: 38, chapter_build: 60, quality_gates: 85,
      final_assembly: 93, complete: 100,
    };

    const progress = PHASE_PROGRESS[phase] || 0;
    const complete = phase === 'complete';

    const chaptersMatch = html.match(/(\d+)\s*(?:of|\/)\s*(\d+)\s*chapter/i);
    const chapters_done = chaptersMatch ? parseInt(chaptersMatch[1]) : 0;
    const chapters_total = chaptersMatch ? parseInt(chaptersMatch[2]) : 11;

    const refinedProgress = phase === 'chapter_build' && chapters_total > 0
      ? 40 + Math.round((chapters_done / chapters_total) * 40) : progress;

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

    return { phase, progress: refinedProgress, complete, chapters_done, chapters_total, message: PHASE_MESSAGES[phase] || 'Building your system...' };
  } catch (err: any) {
    return { phase: 'error', progress: 0, complete: false, chapters_done: 0, chapters_total: 0, message: `Build service error: ${err.message}` };
  }
}

/**
 * Fetch the completed document from the Architect service.
 */
export async function getArchitectDocument(slug: string): Promise<string> {
  try {
    const res = await fetch(`${ARCHITECT_BASE}/projects/${slug}`);
    const html = await res.text();

    const downloadMatch = html.match(/href="([^"]*Build_Guide[^"]*)"/i);
    if (downloadMatch) {
      const docRes = await fetch(`${ARCHITECT_BASE}${downloadMatch[1]}`);
      if (docRes.ok) return await docRes.text();
    }

    const docRes = await fetch(`${ARCHITECT_BASE}/output/${slug}/`);
    if (docRes.ok) {
      const listing = await docRes.text();
      const mdMatch = listing.match(/href="([^"]*\.md)"/i);
      if (mdMatch) {
        const mdRes = await fetch(`${ARCHITECT_BASE}/output/${slug}/${mdMatch[1]}`);
        if (mdRes.ok) return await mdRes.text();
      }
    }

    return '# Requirements Document\n\nGeneration completed. Check the Architect dashboard for the full document.';
  } catch {
    return '# Requirements Document\n\nUnable to fetch the generated document.';
  }
}
