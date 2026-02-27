import { GitHubService, getSandboxProvider } from '@react-native-vibe-code/sandbox/lib'
import type { GitHubCommitRequest, GitHubCommitResponse } from '../types'

export const maxDuration = 300 // 5 minutes

interface GitHubEnvConfig {
  token?: string
  owner?: string
}

/**
 * Commit and push changes to GitHub
 */
export async function commitToGitHub(
  request: GitHubCommitRequest,
  envConfig?: GitHubEnvConfig
): Promise<GitHubCommitResponse> {
  const { sandboxId, projectId, userMessage, messageId, executionFailed = false } = request

  console.log('[GitHub Commit API] Received request:', {
    sandboxId,
    projectId,
    messageId,
    executionFailed,
  })

  // Check if GitHub is configured
  const githubToken = envConfig?.token || process.env.GITHUB_TOKEN
  const githubOwner = envConfig?.owner || process.env.GITHUB_OWNER

  if (!githubToken || !githubOwner) {
    console.log('[GitHub Commit API] GitHub not configured, skipping commit/push')
    return {
      success: true,
      skipped: true,
      message: 'GitHub not configured',
    }
  }

  // Connect to sandbox using the active provider
  let sandbox: Awaited<ReturnType<typeof getSandboxProvider>['connect']>
  try {
    sandbox = await getSandboxProvider().connect(sandboxId)
    console.log('[GitHub Commit API] Connected to sandbox:', sandboxId)
  } catch (error) {
    console.error('[GitHub Commit API] Failed to connect to sandbox:', error)
    return {
      success: false,
      error: 'Failed to connect to sandbox',
    }
  }

  // Initialize GitHub service
  const githubService = new GitHubService({
    owner: githubOwner,
    token: githubToken,
  })

  // Create commit message
  const repositoryName = `project-${projectId}`
  const failurePrefix = executionFailed ? '[FAILED] ' : ''
  const commitMessage = messageId
    ? `${messageId} --- ${failurePrefix}Update: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`
    : `${failurePrefix}Update: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`

  console.log('[GitHub Commit API] Committing changes:', {
    repository: `${githubOwner}/${repositoryName}`,
    commitMessage,
  })

  // Commit and push
  const success = await githubService.commitAndPush(
    sandbox,
    repositoryName,
    commitMessage
  )

  if (success) {
    console.log('[GitHub Commit API] Successfully committed and pushed changes')
    return {
      success: true,
      repository: `${githubOwner}/${repositoryName}`,
      commitMessage,
    }
  } else {
    console.log('[GitHub Commit API] Failed to commit and push changes')
    return {
      success: false,
      error: 'Failed to commit and push changes',
    }
  }
}
