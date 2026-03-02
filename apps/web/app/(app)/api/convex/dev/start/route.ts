// API endpoint to start Convex dev server in sandbox

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects, convexProjectCredentials } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/config'
import { headers } from 'next/headers'
import { connectSandbox } from '@/lib/sandbox-connect'
import { pusherServer } from '@/lib/pusher'

// Buffer for accumulating multi-line Convex error messages
const convexErrorBuffers = new Map<string, { buffer: string; timeout: NodeJS.Timeout | null }>()

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
  /✖/,  // Convex CLI error indicator
]

function sendConvexError(projectId: string, logData: string): void {
  if (!projectId) return

  const hasError = CONVEX_ERROR_PATTERNS.some(pattern => pattern.test(logData))

  // Skip common non-error messages
  if (logData.includes('Convex functions ready') ||
      logData.includes('✔') ||
      logData.includes('Watching for changes') ||
      logData.includes('bunx convex dev')) {
    return
  }

  let bufferData = convexErrorBuffers.get(projectId)
  if (!bufferData) {
    bufferData = { buffer: '', timeout: null }
    convexErrorBuffers.set(projectId, bufferData)
  }

  if (hasError) {
    console.log('[Convex Dev] Error detected:', logData.substring(0, 200))

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
        pusherServer.trigger(channelName, 'error-notification', {
          message: cleanError,
          timestamp: new Date().toISOString(),
          projectId,
          type: 'convex-error',
          source: 'convex-dev',
        })
        .then(() => {
          console.log(`[Convex Dev] Error notification sent to channel: ${channelName}`)
        })
        .catch((error) => {
          console.error('[Convex Dev] Failed to send error notification:', error)
        })
      }

      bufferData!.buffer = ''
      bufferData!.timeout = null
    }, 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId } = body

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    // Get project
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
      .limit(1)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.sandboxId) {
      return NextResponse.json({ error: 'No sandbox found for this project' }, { status: 400 })
    }

    // Get Convex credentials
    const [credentials] = await db
      .select()
      .from(convexProjectCredentials)
      .where(eq(convexProjectCredentials.projectId, projectId))
      .limit(1)

    if (!credentials) {
      return NextResponse.json({ error: 'No Convex project connected' }, { status: 400 })
    }

    // Get sandbox instance
    const sandbox = await connectSandbox(project.sandboxId)

    // Create .env.local file with Convex URL for the client-side (EXPO_PUBLIC_ prefix for Expo apps)
    const { updateSandboxEnvFile } = await import('@/lib/convex/sandbox-utils')
    await updateSandboxEnvFile(sandbox, 'EXPO_PUBLIC_CONVEX_URL', credentials.deploymentUrl)

    // Start convex dev in background (long-running process)
    // Set CONVEX_DEPLOY_KEY environment variable to run non-interactively
    // The adminKey is actually a deploy key in format: project:team:project|token
    sandbox.commands.run(
      `cd /home/user/app && CONVEX_DEPLOY_KEY="${credentials.adminKey}" bunx convex dev --typecheck=disable`,
      {
        background: true,
        timeoutMs: 3600000, // 1 hour
        onStdout: (data: string) => {
          console.log('[Convex Dev] stdout:', data)
          sendConvexError(projectId, data)
        },
        onStderr: (data: string) => {
          console.log('[Convex Dev] stderr:', data)
          sendConvexError(projectId, data)
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
      .where(eq(projects.id, projectId))

    return NextResponse.json({
      success: true,
      message: 'Convex dev server started',
    })
  } catch (error) {
    console.error('Error starting Convex dev:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to start Convex dev'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
