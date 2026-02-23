import type { ISandbox as Sandbox } from '@react-native-vibe-code/sandbox/lib'
import { eq } from 'drizzle-orm'
import { getPusherServer } from '@react-native-vibe-code/pusher'
import { provisionManagedConvexProject } from '@react-native-vibe-code/convex'
import { updateSandboxEnvFile } from '@react-native-vibe-code/convex'
import type { ConvexSetupParams, ConvexDevServerParams } from '../types'

// Buffer for accumulating multi-line Convex error messages
const convexErrorBuffers = new Map<
  string,
  { buffer: string; timeout: ReturnType<typeof setTimeout> | null }
>()

// Convex-specific error patterns
const CONVEX_ERROR_PATTERNS = [
  /error:/i,
  /Error:/,
  /failed to/i,
  /Unable to/i,
  /Cannot find/i,
  /is not defined/i,
  /Argument .* is not/i,
  /Expected .* but got/i,
  /ValidationError/i,
  /SchemaValidationError/i,
  /ConvexError/i,
  /Uncaught exception/i,
  /TypeError:/i,
  /ReferenceError:/i,
  /SyntaxError:/i,
  /Invalid argument/i,
  /Missing required/i,
  /✖/, // Convex CLI error indicator
]

/**
 * Send Convex errors to the frontend via Pusher
 */
export function sendConvexError(projectId: string, logData: string): void {
  if (!projectId) return

  const hasError = CONVEX_ERROR_PATTERNS.some((pattern) => pattern.test(logData))

  // Skip common non-error messages
  if (
    logData.includes('Convex functions ready') ||
    logData.includes('✔') ||
    logData.includes('Watching for changes') ||
    logData.includes('bunx convex dev')
  ) {
    return
  }

  let bufferData = convexErrorBuffers.get(projectId)
  if (!bufferData) {
    bufferData = { buffer: '', timeout: null }
    convexErrorBuffers.set(projectId, bufferData)
  }

  if (hasError) {
    console.log('[Remix Convex Dev] Error detected:', logData.substring(0, 200))

    if (bufferData.timeout) {
      clearTimeout(bufferData.timeout)
    }

    bufferData.buffer += logData + '\n'

    bufferData.timeout = setTimeout(() => {
      const cleanError = bufferData!.buffer
        .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
        .trim()

      if (cleanError.length > 0) {
        const channelName = `${projectId}-errors`
        getPusherServer()
          .trigger(channelName, 'error-notification', {
            message: cleanError,
            timestamp: new Date().toISOString(),
            projectId,
            type: 'convex-error',
            source: 'convex-dev',
          })
          .then(() => {
            console.log(
              `[Remix Convex Dev] Error notification sent to channel: ${channelName}`
            )
          })
          .catch((error: Error) => {
            console.error(
              '[Remix Convex Dev] Failed to send error notification:',
              error
            )
          })
      }

      bufferData!.buffer = ''
      bufferData!.timeout = null
    }, 500)
  }
}

/**
 * Write EXPO_PUBLIC_CONVEX_URL to sandbox .env.local
 */
export async function writeConvexUrlToSandbox(
  sandbox: Sandbox,
  deploymentUrl: string
): Promise<void> {
  try {
    await updateSandboxEnvFile(sandbox, 'EXPO_PUBLIC_CONVEX_URL', deploymentUrl)
    console.log('[Remix] Wrote Convex URL to sandbox .env.local')
  } catch (error) {
    console.error('[Remix] Failed to write to sandbox .env.local:', error)
  }
}

/**
 * Start Convex dev server in the sandbox
 */
export async function startConvexDevServer(
  params: ConvexDevServerParams,
  db: any,
  projects: any
): Promise<void> {
  try {
    console.log('[Remix] Starting Convex dev server...')

    // Start convex dev in background (long-running process)
    params.sandbox.commands.run(
      `cd /home/user/app && bunx convex dev --url "${params.deploymentUrl}" --admin-key "${params.adminKey}" --typecheck=disable`,
      {
        background: true,
        timeoutMs: 3600000, // 1 hour
        onStdout: (data: string) => {
          console.log('[Remix Convex Dev] stdout:', data)
          sendConvexError(params.projectId, data)
        },
        onStderr: (data: string) => {
          console.log('[Remix Convex Dev] stderr:', data)
          sendConvexError(params.projectId, data)
        },
      }
    )

    // Update project status
    await db
      .update(projects)
      .set({
        convexDevRunning: true,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, params.projectId))

    console.log('[Remix] Convex dev server started')
  } catch (error) {
    console.error('[Remix] Failed to start Convex dev server:', error)
  }
}

/**
 * Setup Convex for remixed project
 * Provisions a new managed Convex project if source project had Convex enabled
 */
export async function setupConvexForRemix(
  params: ConvexSetupParams,
  db: any,
  projects: any,
  convexProjectCredentials: any
): Promise<void> {
  // Check if Convex is configured
  const teamScopedToken = process.env.CONVEX_TEAM_SCOPED_TOKEN
  const teamSlug = process.env.CONVEX_TEAM_SLUG

  if (!teamScopedToken || !teamSlug) {
    console.log('[Remix] Convex not configured, skipping')
    return
  }

  // Check if source project had Convex enabled
  const [sourceCredentials] = await db
    .select()
    .from(convexProjectCredentials)
    .where(eq(convexProjectCredentials.projectId, params.sourceProjectId))
    .limit(1)

  if (!sourceCredentials) {
    console.log('[Remix] Source project does not have Convex, skipping')
    return
  }

  console.log(
    '[Remix] Source project has Convex, provisioning new Convex project for remix...'
  )

  // Check if remixed project already has credentials (shouldn't happen, but check anyway)
  const [existingCredentials] = await db
    .select()
    .from(convexProjectCredentials)
    .where(eq(convexProjectCredentials.projectId, params.projectId))
    .limit(1)

  if (existingCredentials) {
    console.log('[Remix] Convex already connected, using existing credentials')
    await writeConvexUrlToSandbox(params.sandbox, existingCredentials.deploymentUrl)
    await startConvexDevServer(
      {
        projectId: params.projectId,
        sandbox: params.sandbox,
        adminKey: existingCredentials.adminKey,
        deploymentUrl: existingCredentials.deploymentUrl,
      },
      db,
      projects
    )
    return
  }

  try {
    console.log('[Remix] Provisioning managed Convex project...')

    // Provision managed Convex project
    const convexProjectName = `${params.appName.replace(/[^a-zA-Z0-9-]/g, '-')}-${params.projectId.substring(0, 8)}`
    const convexProject = await provisionManagedConvexProject({
      teamScopedToken,
      teamSlug,
      projectName: convexProjectName,
    })

    console.log('[Remix] Convex project provisioned:', convexProject.deploymentUrl)

    // Store credentials
    await db.insert(convexProjectCredentials).values({
      projectId: params.projectId,
      userId: params.userId,
      mode: 'managed',
      teamSlug: convexProject.teamSlug,
      projectSlug: convexProject.projectSlug,
      deploymentUrl: convexProject.deploymentUrl,
      deploymentName: convexProject.deploymentName,
      adminKey: convexProject.token,
      accessToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Update project state
    await db
      .update(projects)
      .set({
        convexProject: {
          kind: 'connected',
          projectSlug: convexProject.projectSlug,
          teamSlug: convexProject.teamSlug,
          deploymentUrl: convexProject.deploymentUrl,
          deploymentName: convexProject.deploymentName,
        },
        updatedAt: new Date(),
      })
      .where(eq(projects.id, params.projectId))

    // Write EXPO_PUBLIC_CONVEX_URL to sandbox .env.local
    await writeConvexUrlToSandbox(params.sandbox, convexProject.deploymentUrl)

    // Start Convex dev server
    await startConvexDevServer(
      {
        projectId: params.projectId,
        sandbox: params.sandbox,
        adminKey: convexProject.token,
        deploymentUrl: convexProject.deploymentUrl,
      },
      db,
      projects
    )

    console.log('[Remix] Convex setup complete')
  } catch (error) {
    console.error('[Remix] Failed to setup Convex:', error)
    // Don't fail the entire remix if Convex fails
  }
}
