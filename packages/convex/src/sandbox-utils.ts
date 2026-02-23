/**
 * Convex Sandbox Utilities
 * Functions for managing Convex configuration in sandboxes.
 * Compatible with any sandbox provider (E2B, Daytona, etc.)
 */

/**
 * Minimal sandbox interface required by Convex sandbox utilities.
 * This avoids a circular dependency with @react-native-vibe-code/sandbox.
 */
interface SandboxLike {
  files: {
    exists(path: string): Promise<boolean>
    read(path: string): Promise<string>
    write(path: string, content: string): Promise<void>
  }
}

/** @deprecated Use SandboxLike directly. Kept for backwards compatibility. */
type Sandbox = SandboxLike
import { db, convexProjectCredentials, eq } from '@react-native-vibe-code/database'
import { detectAndNotifyConvexError } from '@react-native-vibe-code/error-manager/server'

/**
 * Update environment variable in sandbox .env.local file
 * Preserves existing environment variables and updates/adds the specified one
 *
 * @param sandbox - E2B Sandbox instance
 * @param key - Environment variable key
 * @param value - Environment variable value
 * @param filePath - Path to env file (defaults to /home/user/app/.env.local)
 */
export async function updateSandboxEnvFile(
  sandbox: Sandbox,
  key: string,
  value: string,
  filePath: string = '/home/user/app/.env.local'
): Promise<void> {
  // Read existing .env.local if it exists
  let envContent = ''
  try {
    envContent = await sandbox.files.read(filePath)
  } catch (error) {
    // File doesn't exist, that's okay
    console.log(`[Sandbox Utils] ${filePath} does not exist, creating new one`)
  }

  // Parse existing lines
  const lines = envContent.split('\n').filter(line => line.trim() !== '')
  const envVars = new Map<string, string>()

  // Parse existing env vars
  for (const line of lines) {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match && match[1] !== undefined && match[2] !== undefined) {
      envVars.set(match[1], match[2])
    }
  }

  // Update/add the specified environment variable
  envVars.set(key, value)
  console.log(`[Sandbox Utils] Set ${key}: ${value}`)

  // Convert map back to lines
  const newLines = Array.from(envVars.entries()).map(
    ([k, v]) => `${k}=${v}`
  )

  // Write back to file
  await sandbox.files.write(filePath, newLines.join('\n') + '\n')
  console.log(`[Sandbox Utils] Successfully updated ${filePath}`)
}

/**
 * Restore Convex environment variables to sandbox .env.local from database
 * Queries the convex_project_credentials table and writes EXPO_PUBLIC_CONVEX_URL
 *
 * @param sandbox - E2B Sandbox instance
 * @param projectId - Project UUID
 * @returns Promise<boolean> - true if restored, false if no credentials found
 */
export async function restoreConvexEnvToSandbox(
  sandbox: Sandbox,
  projectId: string
): Promise<boolean> {
  try {
    console.log(`[Convex Restore] Restoring Convex env for project ${projectId}`)

    // Query Convex credentials from database
    const [credentials] = await db
      .select()
      .from(convexProjectCredentials)
      .where(eq(convexProjectCredentials.projectId, projectId))
      .limit(1)

    if (!credentials) {
      console.log(`[Convex Restore] No Convex credentials found for project ${projectId}`)
      return false
    }

    // Update EXPO_PUBLIC_CONVEX_URL in .env.local (preserves existing vars)
    if (!credentials.deploymentUrl) {
      console.log(`[Convex Restore] No deployment URL found for project ${projectId}`)
      return false
    }
    await updateSandboxEnvFile(sandbox, 'EXPO_PUBLIC_CONVEX_URL', credentials.deploymentUrl)

    console.log(`[Convex Restore] Successfully restored Convex URL to .env.local: ${credentials.deploymentUrl}`)
    return true
  } catch (error) {
    console.error(`[Convex Restore] Failed to restore Convex env:`, error)
    // Don't throw - this should not fail the entire operation
    return false
  }
}

/**
 * Get Convex credentials for a project
 *
 * @param projectId - Project UUID
 * @returns Credentials or null if not found
 */
export async function getConvexCredentials(projectId: string) {
  const [credentials] = await db
    .select()
    .from(convexProjectCredentials)
    .where(eq(convexProjectCredentials.projectId, projectId))
    .limit(1)

  return credentials || null
}

/**
 * Start the Convex dev server in a sandbox
 * This watches for file changes and auto-deploys functions
 *
 * @param sandbox - E2B Sandbox instance
 * @param projectId - Project UUID
 * @param credentials - Convex credentials with adminKey and deploymentUrl
 * @returns Promise<boolean> - true if started successfully
 */
export async function startConvexDevServer(
  sandbox: Sandbox,
  projectId: string,
  credentials: { adminKey: string; deploymentUrl: string }
): Promise<boolean> {
  try {
    console.log(`[Convex Dev] Starting convex dev server for project ${projectId}`)

    // Ensure environment is set for client-side access
    await updateSandboxEnvFile(sandbox, 'EXPO_PUBLIC_CONVEX_URL', credentials.deploymentUrl)

    // Start convex dev in background (long-running process)
    // Use --url and --admin-key flags to avoid interactive prompts
    sandbox.commands.run(
      `cd /home/user/app && bunx convex dev --url "${credentials.deploymentUrl}" --admin-key "${credentials.adminKey}" --typecheck=disable`,
      {
        background: true,
        timeoutMs: 3600000, // 1 hour
        onStdout: (data: string) => {
          console.log('[Convex Dev] stdout:', data)
          detectAndNotifyConvexError(data, projectId)
        },
        onStderr: (data: string) => {
          console.log('[Convex Dev] stderr:', data)
          detectAndNotifyConvexError(data, projectId)
        },
      }
    )

    console.log(`[Convex Dev] Convex dev server started for project ${projectId}`)
    return true
  } catch (error) {
    console.error(`[Convex Dev] Failed to start convex dev:`, error)
    return false
  }
}
