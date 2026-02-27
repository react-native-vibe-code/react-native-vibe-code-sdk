import { db, projects, eq, and } from '@react-native-vibe-code/database'
import { getSandboxProvider } from '@react-native-vibe-code/sandbox/lib'
import type { GitCommitsRequest, GitCommitsResponse, Commit } from '../types'

export const maxDuration = 30

/**
 * Fetch git commit history from sandbox
 */
export async function getGitCommits(
  request: GitCommitsRequest
): Promise<GitCommitsResponse> {
  const { projectId, userID, sandboxId } = request

  console.log('[Git Commits] API called with:', {
    projectId,
    userID,
    sandboxId,
  })

  if (!userID) {
    return { success: false, commits: [], error: 'User ID is required' }
  }

  if (!projectId) {
    return { success: false, commits: [], error: 'Project ID is required' }
  }

  if (!sandboxId) {
    return { success: false, commits: [], error: 'Sandbox ID is required' }
  }

  // Verify project exists and belongs to user
  const existingProjects = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, userID),
        eq(projects.sandboxId, sandboxId),
      ),
    )
    .limit(1)

  if (existingProjects.length === 0) {
    return {
      success: false,
      commits: [],
      error: 'Project not found or access denied',
    }
  }

  // Connect to sandbox
  let sandbox: Awaited<ReturnType<typeof getSandboxProvider>['connect']>
  try {
    sandbox = await getSandboxProvider().connect(sandboxId)
    console.log(`[Git Commits] Connected to sandbox: ${sandbox.sandboxId}`)
  } catch (error) {
    console.error(
      `[Git Commits] Failed to connect to sandbox ${sandboxId}:`,
      error,
    )
    return {
      success: false,
      commits: [],
      error: 'Failed to connect to sandbox',
    }
  }

  // Execute git log command to get commit history
  try {
    console.log(`[Git Commits] Fetching commit history`)

    const gitScript = `#!/bin/bash
set -e

cd /home/user/app

# Check if we're in a git repository
if [ ! -d ".git" ]; then
  echo "Error: Not in a git repository"
  exit 1
fi

# Get commit history in JSON format
# Format: {"hash": "...", "message": "...", "author": "...", "date": "...", "messageId": "..."}
git log --pretty=format:'{"hash":"%H","shortHash":"%h","message":"%s","author":"%an","email":"%ae","date":"%aI","timestamp":"%at"}' | awk '{print $0","}'

echo ""
`

    const gitResult = await sandbox.commands.run(gitScript, {
      timeoutMs: 15000,
      onStdout: (line) => {
        console.log(`[Git Commits] ${line}`)
      },
      onStderr: (line) => {
        console.error(`[Git Commits] ${line}`)
      },
    })

    if (gitResult.exitCode !== 0) {
      console.error('[Git Commits] Git log failed:', gitResult.stderr)

      // If git log fails, it might be a new repo with no commits
      if (gitResult.stderr.includes('does not have any commits')) {
        return {
          success: true,
          commits: [],
          message: 'No commits yet in this repository',
        }
      }

      return {
        success: false,
        commits: [],
        error: 'Git log failed',
        details: gitResult.stderr,
      }
    }

    // Parse the git log output into JSON
    let commits: Commit[] = []
    if (gitResult.stdout.trim()) {
      try {
        // Add brackets and remove trailing comma to make valid JSON array
        const jsonOutput =
          '[' + gitResult.stdout.trim().replace(/,$/, '') + ']'
        commits = JSON.parse(jsonOutput)

        // Extract messageId from commit message if it exists (format: "messageId --- message")
        commits = commits.map((commit) => {
          const messageMatch = commit.message.match(/^([a-f0-9-]+) --- (.+)$/)
          if (messageMatch) {
            return {
              ...commit,
              messageId: messageMatch[1],
              displayMessage: messageMatch[2],
            }
          }
          return {
            ...commit,
            displayMessage: commit.message,
          }
        })
      } catch (parseError) {
        console.error(
          '[Git Commits] Failed to parse git log output:',
          parseError,
        )
        console.error('[Git Commits] Raw output:', gitResult.stdout)
        return {
          success: false,
          commits: [],
          error: 'Failed to parse commit history',
          details: 'Invalid JSON format from git log',
        }
      }
    }

    console.log(`[Git Commits] Found ${commits.length} commits`)

    return {
      success: true,
      commits,
      projectId,
      sandboxId,
    }
  } catch (error) {
    console.error('[Git Commits] Error fetching commits:', error)
    return {
      success: false,
      commits: [],
      error: 'Failed to fetch commit history',
      details: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
