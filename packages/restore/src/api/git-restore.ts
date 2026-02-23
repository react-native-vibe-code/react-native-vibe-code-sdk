import { db, projects, message, eq, and, gte } from '@react-native-vibe-code/database'
import { startExpoServer, getSandboxProvider } from '@react-native-vibe-code/sandbox/lib'
import type { GitRestoreRequest, GitRestoreResponse } from '../types'

export const maxDuration = 120 // 2 minutes for git operations + server restart

/**
 * Restore sandbox to a specific git commit
 */
export async function restoreGitCommit(
  request: GitRestoreRequest
): Promise<GitRestoreResponse> {
  const { projectId, userID, messageId, sandboxId } = request

  console.log('[Git Restore] API called with:', {
    projectId,
    userID,
    messageId,
    sandboxId,
  })

  if (!userID) {
    return {
      success: false,
      message: 'User ID is required',
      error: 'User ID is required',
      messageId: '',
      branchName: '',
      currentCommit: '',
      currentBranch: '',
      projectId: '',
      sandboxId: '',
      serverRestarted: false,
      cacheCleared: false,
      filesRefreshed: false,
      messagesDeleted: false,
      deletedMessagesCount: 0,
      shouldReloadChat: false,
      shouldRefreshPreview: false,
    }
  }

  if (!projectId) {
    return {
      success: false,
      message: 'Project ID is required',
      error: 'Project ID is required',
      messageId: '',
      branchName: '',
      currentCommit: '',
      currentBranch: '',
      projectId: '',
      sandboxId: '',
      serverRestarted: false,
      cacheCleared: false,
      filesRefreshed: false,
      messagesDeleted: false,
      deletedMessagesCount: 0,
      shouldReloadChat: false,
      shouldRefreshPreview: false,
    }
  }

  if (!messageId) {
    return {
      success: false,
      message: 'Message ID is required',
      error: 'Message ID is required',
      messageId: '',
      branchName: '',
      currentCommit: '',
      currentBranch: '',
      projectId: '',
      sandboxId: '',
      serverRestarted: false,
      cacheCleared: false,
      filesRefreshed: false,
      messagesDeleted: false,
      deletedMessagesCount: 0,
      shouldReloadChat: false,
      shouldRefreshPreview: false,
    }
  }

  if (!sandboxId) {
    return {
      success: false,
      message: 'Sandbox ID is required',
      error: 'Sandbox ID is required',
      messageId: '',
      branchName: '',
      currentCommit: '',
      currentBranch: '',
      projectId: '',
      sandboxId: '',
      serverRestarted: false,
      cacheCleared: false,
      filesRefreshed: false,
      messagesDeleted: false,
      deletedMessagesCount: 0,
      shouldReloadChat: false,
      shouldRefreshPreview: false,
    }
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
        eq(projects.status, 'active'),
      ),
    )
    .limit(1)

  if (existingProjects.length === 0) {
    return {
      success: false,
      message: 'Project not found or access denied',
      error: 'Project not found or access denied',
      messageId,
      branchName: '',
      currentCommit: '',
      currentBranch: '',
      projectId,
      sandboxId,
      serverRestarted: false,
      cacheCleared: false,
      filesRefreshed: false,
      messagesDeleted: false,
      deletedMessagesCount: 0,
      shouldReloadChat: false,
      shouldRefreshPreview: false,
    }
  }

  const project = existingProjects[0]

  // Connect to sandbox using the active provider
  let sandbox: Awaited<ReturnType<typeof getSandboxProvider>['connect']>
  try {
    sandbox = await getSandboxProvider().connect(sandboxId)
    console.log(`[Git Restore] Connected to sandbox: ${sandbox.sandboxId}`)
  } catch (error) {
    console.error(
      `[Git Restore] Failed to connect to sandbox ${sandboxId}:`,
      error,
    )
    return {
      success: false,
      message: 'Failed to connect to sandbox',
      error: 'Failed to connect to sandbox',
      messageId,
      branchName: '',
      currentCommit: '',
      currentBranch: '',
      projectId,
      sandboxId,
      serverRestarted: false,
      cacheCleared: false,
      filesRefreshed: false,
      messagesDeleted: false,
      deletedMessagesCount: 0,
      shouldReloadChat: false,
      shouldRefreshPreview: false,
    }
  }

  // Execute git checkout command to restore to the commit associated with the message
  try {
    console.log(`[Git Restore] Checking out commit for message: ${messageId}`)

    const gitScript = `#!/bin/bash
set -e

cd /home/user/app

# Check if we're in a git repository
if [ ! -d ".git" ]; then
  echo "Error: Not in a git repository"
  exit 1
fi

# Configure git user if not already configured
git config user.name "E2B User" || true
git config user.email "user@e2b.dev" || true

# First, let's see what commits we have
echo "Available commits:"
git log --oneline -10

BRANCH_NAME="message-${messageId}"

# Check if branch already exists
if git branch -a | grep -q "\\b\${BRANCH_NAME}\\b"; then
  echo "Branch \${BRANCH_NAME} exists, checking out..."
  git checkout \${BRANCH_NAME}

  # Force reset to ensure we're at the exact state of the branch
  echo "Ensuring working directory matches branch state..."
  git reset --hard HEAD
  git clean -fd  # Remove untracked files

  echo "Successfully checked out existing branch \${BRANCH_NAME}"
else
  echo "Branch \${BRANCH_NAME} does not exist, need to find the commit for message ${messageId}..."

  # Strategy: Check if messageId is already a commit hash
  # First, try to use it directly as a commit hash
  if git cat-file -e ${messageId} 2>/dev/null; then
    COMMIT_HASH="${messageId}"
    echo "messageId is a valid commit hash: \$COMMIT_HASH"
  else
    # Not a commit hash, search for messageId in commit messages
    # Search for messageId at start of commit message (format: "messageId --- message")
    COMMIT_HASH=\$(git log --grep="^${messageId} ---" --format="%H" -n 1)

    # If not found with --- format, try searching for messageId anywhere in commit message
    if [ -z "\$COMMIT_HASH" ]; then
      COMMIT_HASH=\$(git log --grep="${messageId}" --format="%H" -n 1)
    fi
  fi

  # If still not found, this means the commit doesn't exist for this message
  if [ -z "\$COMMIT_HASH" ]; then
    echo "Error: No commit found for message ${messageId}"
    echo "This message may not have resulted in any code changes, or was created before git tracking."
    echo "Available recent commits:"
    git log --oneline -10
    exit 1
  fi

  echo "Found commit \$COMMIT_HASH for message ${messageId}"

  # Show the commit details
  echo "Commit details:"
  git log --oneline -1 \$COMMIT_HASH

  # Create the branch from the specific commit and checkout to it
  echo "Creating branch \${BRANCH_NAME} from commit \$COMMIT_HASH"
  git checkout -b \${BRANCH_NAME} \$COMMIT_HASH

  # Ensure working directory is clean and matches the commit exactly
  echo "Ensuring working directory matches commit state..."
  git reset --hard \$COMMIT_HASH
  git clean -fd  # Remove any untracked files

  echo "Created branch \${BRANCH_NAME} from commit \$COMMIT_HASH"
fi

# Double-check that we're on the correct branch and commit
echo "Verifying checkout..."
CURRENT_BRANCH=\$(git branch --show-current)
CURRENT_COMMIT=\$(git rev-parse HEAD)
echo "Currently on branch: \$CURRENT_BRANCH"
echo "Currently on commit: \$CURRENT_COMMIT"

# Verify working directory is clean
if [ -n "\$(git status --porcelain)" ]; then
  echo "Warning: Working directory has uncommitted changes after checkout"
  git status --short
else
  echo "Working directory is clean and matches commit state"
fi

# Force file system sync and verify actual file changes
echo "Forcing file system synchronization..."
sync

# Show actual file listing to verify changes took effect
echo "Current file listing (to verify checkout worked):"
ls -la | head -20

# Show a sample of file contents to verify state
echo "Sample file contents verification:"
if [ -f "package.json" ]; then
  echo "=== package.json exists ==="
  head -10 package.json
fi

if [ -f "app.json" ]; then
  echo "=== app.json exists ==="
  head -10 app.json
fi

# Check for React Native/Expo specific files
if [ -f "App.tsx" ] || [ -f "App.js" ]; then
  echo "=== Main App file exists ==="
  ls -la App.*
fi

if [ -d "app" ]; then
  echo "=== App directory contents ==="
  ls -la app/ | head -10
fi

# Get current commit info
echo "Current commit: \$(git rev-parse HEAD)"
echo "Current branch: \$(git branch --show-current || echo 'detached HEAD')"
echo "Git status:"
git status --porcelain || true

# Force refresh any cached file watchers by touching key files
echo "Refreshing file watchers..."
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | grep -v node_modules | head -10 | xargs touch 2>/dev/null || true

# Push the branch to origin
echo "Pushing branch to origin..."
git push -u origin \${BRANCH_NAME} || echo "Warning: Failed to push to origin"

echo "Successfully restored to message ${messageId}"
`

    const gitResult = await sandbox.commands.run(gitScript, {
      timeoutMs: 30000, // 30 seconds
      onStdout: (line) => {
        console.log(`[Git Restore] ${line}`)
      },
      onStderr: (line) => {
        console.error(`[Git Restore] ${line}`)
      },
    })

    // Get current branch name
    const branchResult = await sandbox.commands.run(
      'cd /home/user/app && git branch --show-current',
      {
        timeoutMs: 5000,
        onStdout: (line) => {
          console.log(`[Git Restore] Current branch: ${line}`)
        },
      },
    )

    console.log('[Git Restore] Branch check result:', branchResult.stdout)

    if (gitResult.exitCode !== 0) {
      console.error('[Git Restore] Git checkout failed:', gitResult.stderr)
      return {
        success: false,
        message: 'Git checkout failed',
        error: 'Git checkout failed',
        details: gitResult.stderr,
        messageId,
        branchName: `message-${messageId}`,
        currentCommit: '',
        currentBranch: '',
        projectId: project.id,
        sandboxId: sandbox.sandboxId,
        serverRestarted: false,
        cacheCleared: false,
        filesRefreshed: false,
        messagesDeleted: false,
        deletedMessagesCount: 0,
        shouldReloadChat: false,
        shouldRefreshPreview: false,
      }
    }

    console.log('[Git Restore] Git checkout successful:', gitResult.stdout)

    // Get commit timestamp to delete messages after this point
    let commitTimestamp: Date | null = null
    try {
      console.log('[Git Restore] Getting commit timestamp...')
      const timestampScript = `cd /home/user/app && git log -1 --format=%aI HEAD`
      const timestampResult = await sandbox.commands.run(timestampScript, {
        timeoutMs: 5000,
      })

      if (timestampResult.exitCode === 0 && timestampResult.stdout.trim()) {
        commitTimestamp = new Date(timestampResult.stdout.trim())
        console.log('[Git Restore] Commit timestamp:', commitTimestamp)
      }
    } catch (error) {
      console.error('[Git Restore] Failed to get commit timestamp:', error)
      // Continue without deleting messages if we can't get timestamp
    }

    // Delete messages created after this commit
    let deletedMessagesCount = 0
    if (commitTimestamp && project.chatId) {
      try {
        console.log(
          '[Git Restore] Deleting messages created after:',
          commitTimestamp,
        )
        const result = await db
          .delete(message)
          .where(
            and(
              eq(message.chatId, project.chatId),
              gte(message.createdAt, commitTimestamp),
            ),
          )
          .returning({ id: message.id })

        deletedMessagesCount = result.length
        console.log(
          '[Git Restore] Deleted',
          deletedMessagesCount,
          'messages after restore point',
        )

        // Wait for DB transaction to fully commit
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch (error) {
        console.error('[Git Restore] Failed to delete messages:', error)
        // Continue with restore even if message deletion fails
      }
    }

    // Clear Metro cache and kill server processes to prepare for restart
    try {
      console.log(
        '[Git Restore] Clearing caches and killing server processes...',
      )

      // Cache clearing and process killing script
      const cleanupScript = `#!/bin/bash
cd /home/user/app

echo "Killing existing processes..."
# Kill any existing Metro/Expo processes
pkill -f "expo start" || true
pkill -f "metro" || true
pkill -f "react-native start" || true
pkill -f "bun run start" || true
pkill -f "npm start" || true
pkill -f "yarn start" || true

# Wait for processes to die
sleep 2

echo "Clearing all caches..."
# Clear Metro cache thoroughly
rm -rf node_modules/.cache 2>/dev/null || true
rm -rf .expo 2>/dev/null || true
rm -rf /tmp/metro-* 2>/dev/null || true
rm -rf /tmp/react-* 2>/dev/null || true

# Clear bun/npm/yarn caches
# Note: Bun cache clearing disabled per user request
# /usr/local/bin/bun pm cache clear 2>/dev/null || true
npm cache clean --force 2>/dev/null || true

# Force sync file system
sync

echo "Touching source files to trigger rebuilds..."
# Touch all source files to ensure they're detected as changed
find . -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.json" | grep -v node_modules | xargs touch 2>/dev/null || true

echo "Cache clearing and process cleanup completed"
`

      await sandbox.commands.run(cleanupScript, {
        timeoutMs: 15000,
      })

      console.log('[Git Restore] Cache clearing and process cleanup completed')
    } catch (error) {
      console.error('[Git Restore] Failed to clear caches:', error)
      // Don't fail the whole request for cache/restart issues
    }

    // Restart the Expo server to ensure it picks up the restored files
    let restartSuccess = false
    let serverUrl = project.sandboxUrl
    let ngrokUrl = project.ngrokUrl

    try {
      console.log('[Git Restore] Restarting Expo server with restored files...')

      const serverResult = await startExpoServer(sandbox, project.id)

      if (serverResult.serverReady) {
        restartSuccess = true
        serverUrl = serverResult.url
        ngrokUrl = serverResult.ngrokUrl ?? null
        console.log('[Git Restore] Expo server restarted successfully')
        console.log('[Git Restore] Server URL:', serverUrl)
        console.log('[Git Restore] Ngrok URL:', ngrokUrl)
      } else {
        console.log('[Git Restore] Server started but not fully ready yet')
      }
    } catch (error) {
      console.error('[Git Restore] Error restarting server:', error)
      // Continue anyway - the response will indicate restart failed and frontend can retry
    }

    return {
      success: true,
      message: restartSuccess
        ? 'Successfully restored to commit state and restarted server'
        : 'Successfully restored to commit state (server restart pending)',
      messageId: messageId,
      branchName: `message-${messageId}`,
      currentCommit: gitResult.stdout.includes('Current commit:')
        ? gitResult.stdout.split('Current commit: ')[1]?.split('\n')[0] ||
          'unknown'
        : 'unknown',
      currentBranch: gitResult.stdout.includes('Current branch:')
        ? gitResult.stdout.split('Current branch: ')[1]?.split('\n')[0] ||
          `message-${messageId}`
        : `message-${messageId}`,
      projectId: project.id,
      sandboxId: sandbox.sandboxId,
      serverRestarted: restartSuccess,
      serverUrl: serverUrl || undefined,
      ngrokUrl: ngrokUrl || undefined,
      cacheCleared: true,
      filesRefreshed: true,
      messagesDeleted: deletedMessagesCount > 0, // Chat history was cleaned up
      deletedMessagesCount, // Number of messages deleted
      shouldReloadChat: deletedMessagesCount > 0, // Frontend should reload chat history if messages were deleted
      shouldRefreshPreview: true, // Frontend should refresh the preview with new URLs
    }
  } catch (error) {
    console.error('[Git Restore] Error during git checkout:', error)
    return {
      success: false,
      message: 'Git checkout operation failed',
      error: 'Git checkout operation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      messageId,
      branchName: `message-${messageId}`,
      currentCommit: '',
      currentBranch: '',
      projectId,
      sandboxId,
      serverRestarted: false,
      cacheCleared: false,
      filesRefreshed: false,
      messagesDeleted: false,
      deletedMessagesCount: 0,
      shouldReloadChat: false,
      shouldRefreshPreview: false,
    }
  }
}
