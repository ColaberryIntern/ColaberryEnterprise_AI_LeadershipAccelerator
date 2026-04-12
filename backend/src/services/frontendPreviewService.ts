/**
 * Frontend Preview URL Resolution
 *
 * Determines the best preview URL for a project's frontend:
 * 1. Project.portfolio_url (user-set deployed URL)
 * 2. Vercel/Netlify auto-detected from GitHub repo
 * 3. null if nothing available
 */

export async function getFrontendPreviewUrl(enrollmentId: string): Promise<string | null> {
  try {
    const { getProjectByEnrollment } = await import('./projectService');
    const project = await getProjectByEnrollment(enrollmentId);
    if (!project) return null;

    // 1. User-set portfolio URL (highest priority)
    if ((project as any).portfolio_url) {
      return (project as any).portfolio_url;
    }

    // 2. GitHub Pages / Vercel / Netlify detection from repo URL
    const repoUrl = (project as any).github_repo_url;
    if (repoUrl) {
      // GitHub Pages: https://github.com/user/repo → https://user.github.io/repo
      const ghMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
      if (ghMatch) {
        // Don't auto-construct — too unreliable. Just return null and let user set it.
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Set the preview URL for a project
 */
export async function setPreviewUrl(enrollmentId: string, url: string): Promise<void> {
  const { getProjectByEnrollment } = await import('./projectService');
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');
  (project as any).portfolio_url = url;
  await project.save();
}
