# GitHub Automation Agent

## Purpose
On-demand agent that creates branches, applies code changes, and opens pull requests on the project GitHub repository. Called by Cory when users request GitHub operations.

## Department
Services | DevOps

## Status
Live | Trigger: on-demand

## Input
- action - one of: create_pr, commit_file, create_branch
- Branch, file path, content, commit message, PR title/body as appropriate

## Output
- GitHub operation results (branch created, file committed, PR opened)
- Success/error status with operation details

## How It Works
1. Checks if GitHub is configured (GITHUB_TOKEN and GITHUB_REPO)
2. Based on the requested action, calls the appropriate GitHub service function
3. create_branch: creates a new branch from the default branch
4. commit_file: commits a file to a specified branch
5. create_pr: opens a pull request with title and body

## Use Cases
- **DevOps**: AI-assisted code deployment workflows
- **Development**: Cory can create PRs for proposed fixes
- **Operations**: Automated branch management

## Integration Points
- agentGitHubService (GitHub API wrapper)
- GitHub API (repository operations)
