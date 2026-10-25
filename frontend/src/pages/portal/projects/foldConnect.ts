import type { ConnectStateView, WorkspaceRepoView } from '../../../services/workspaceRepoApi';

/**
 * The connect endpoints answer with the CONNECT state, not the whole workspace
 * view. Folding it onto the view the page already holds keeps one source of
 * truth for "where is this repo up to" — the panel reads `repo.connect` and
 * nothing has to reconcile two objects that describe one repo.
 * (Lifted out of ProjectWorkspacePage unchanged, Campus C19. Its own module, not
 * workspaceRepoApi, because the page's tests mock that module whole.)
 */
export function foldConnect(prev: WorkspaceRepoView | null, next: ConnectStateView): WorkspaceRepoView {
  return {
    connected: Boolean(next.owner && next.repo && next.state === 'connected'),
    provisioned: Boolean(next.owner && next.repo && next.state === 'connected'),
    repo_url: next.url ?? prev?.repo_url ?? null,
    repo_owner: next.state === 'connected' ? next.owner : prev?.repo_owner ?? null,
    repo_name: next.state === 'connected' ? next.repo : prev?.repo_name ?? null,
    student_github_login: prev?.student_github_login ?? null,
    file_count: prev?.file_count ?? null,
    last_sync: prev?.last_sync ?? null,
    recent_commits: prev?.recent_commits ?? [],
    connect: next,
  };
}
