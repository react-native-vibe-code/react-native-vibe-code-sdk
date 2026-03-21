import { exec } from 'child_process'
import type { SessionHook } from '../types.js'

// Debounce state for PostToolUse convex deploys
let deployDebounceTimer: ReturnType<typeof setTimeout> | null = null
let deployInProgress = false

/**
 * Runs convex deploy to push any schema/function changes to the server
 * This is a safeguard to ensure changes made during the session are deployed
 */
async function runConvexDeploy(cwd: string): Promise<void> {
  console.log('Running convex deploy...')
  return new Promise((resolve) => {
    exec('npx convex deploy --typecheck=disable', { cwd }, (error, stdout, stderr) => {
      if (error) {
        console.error('Convex deploy failed:', error.message)
        if (stderr) console.error('stderr:', stderr)
      } else {
        console.log('Convex deploy completed')
        if (stdout) console.log('stdout:', stdout)
      }
      // Always resolve - deploy failure shouldn't block session completion
      resolve()
    })
  })
}

/**
 * Creates a session end hook that runs convex deploy
 */
export function createConvexDeployHook(): SessionHook {
  return async (
    input: { hook_event_name: string; cwd: string },
    _toolUseID: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<{ continue: boolean }> => {
    console.log('SessionEnd hook triggered - running convex deploy')
    await runConvexDeploy(input.cwd)
    return { continue: true }
  }
}

/**
 * Creates a PostToolUse hook that runs convex deploy after Write/Edit
 * operations on files inside the convex/ directory.
 *
 * Debounced: waits 2 seconds after the last convex file change before
 * deploying, so rapid successive writes don't trigger multiple deploys.
 */
export function createConvexPostToolUseHook(): SessionHook {
  return async (
    input: { hook_event_name: string; cwd: string; tool_name?: string; tool_input?: unknown },
    _toolUseID: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<{ continue: boolean }> => {
    // Only act on Write or Edit tools
    const toolName = (input as any).tool_name
    if (toolName !== 'Write' && toolName !== 'Edit') {
      return { continue: true }
    }

    // Check if the file path is inside a convex/ directory
    const toolInput = (input as any).tool_input as Record<string, unknown> | undefined
    const filePath = toolInput?.file_path as string | undefined
    if (!filePath || !filePath.includes('/convex/')) {
      return { continue: true }
    }

    console.log(`[Convex Hook] Convex file changed: ${filePath}`)

    // Debounce: clear any pending deploy and schedule a new one
    if (deployDebounceTimer) {
      clearTimeout(deployDebounceTimer)
    }

    // Don't block the agent — schedule deploy in background
    deployDebounceTimer = setTimeout(async () => {
      if (deployInProgress) {
        console.log('[Convex Hook] Deploy already in progress, skipping')
        return
      }
      deployInProgress = true
      try {
        console.log('[Convex Hook] Debounce elapsed, running convex deploy...')
        await runConvexDeploy(input.cwd)
      } finally {
        deployInProgress = false
      }
    }, 2000)

    // Don't block the agent — return immediately
    return { continue: true }
  }
}
