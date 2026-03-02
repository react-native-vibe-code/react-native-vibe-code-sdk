/**
 * Mobile API: Resume Project
 * POST /api/mobile/projects/[id]/resume - Resume paused sandbox
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { getAuthenticatedUserId } from '@/lib/auth/test-mode'
import { connectSandbox } from '@/lib/sandbox-connect'
import { restoreConvexEnvToSandbox } from '@/lib/convex/sandbox-utils'

/**
 * POST /api/mobile/projects/[id]/resume
 * Resume paused sandbox and return Metro URL
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const userId = await getAuthenticatedUserId()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projectId = params.id

    // Get project
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.sandboxId) {
      return NextResponse.json(
        { error: 'No sandbox associated with this project' },
        { status: 400 }
      )
    }

    // Connect to sandbox
    const sandbox = await connectSandbox(project.sandboxId)

    // Restore Convex environment variables from database
    await restoreConvexEnvToSandbox(sandbox, project.id)

    // Check if dev server is running
    const statusCheck = await sandbox.commands.run(
      'curl -s -o /dev/null -w "%{http_code}" http://localhost:8081 || echo "000"',
      { timeoutMs: 5000 }
    )

    let metroUrl = project.ngrokUrl

    // Start server if not running (check for HTTP response codes)
    if (!statusCheck.stdout.includes('200') && !statusCheck.stdout.includes('404')) {
      console.log('[Mobile API] Dev server not running, starting it...')

      // Kill any zombie processes on port 8081 first
      try {
        await sandbox.commands.run(
          'lsof -ti:8081 | xargs kill -9 || true',
          { timeoutMs: 10000 }
        )
        console.log('[Mobile API] Cleaned up port 8081')
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } catch (error) {
        console.log('[Mobile API] No processes to kill on port 8081')
      }

      // Get ngrok domain from project or use sandboxId
      const ngrokDomain = project.ngrokUrl?.replace('https://', '').replace('.ngrok.dev', '') || sandbox.sandboxId

      // Start Metro bundler in background using proper E2B background parameter
      const startCommand = `cd /home/user/app && CI=false bun run start -- --ngrokurl ${ngrokDomain} --tunnel --web`
      console.log('[Mobile API] Starting with command:', startCommand)

      sandbox.commands.run(startCommand, {
        background: true,
        requestTimeoutMs: 3600000,
        timeoutMs: 3600000,
        onStdout: (data) => {
          console.log('[Mobile API] Server output:', data)
        },
        onStderr: (data) => {
          console.log('[Mobile API] Server error:', data)
        }
      }).catch((err) => console.log('[Mobile API] Server process error:', err))

      // Wait for server to start and check health
      console.log('[Mobile API] Waiting for server to start...')
      let serverReady = false
      let attempts = 0
      const maxAttempts = 20 // 20 attempts * 3 seconds = 60 seconds max

      while (!serverReady && attempts < maxAttempts) {
        attempts++
        await new Promise((resolve) => setTimeout(resolve, 3000))

        try {
          const healthCheck = await sandbox.commands.run(
            'curl -s -o /dev/null -w "%{http_code}" http://localhost:8081 || echo "000"',
            { timeoutMs: 10000 }
          )

          if (healthCheck.stdout.includes('200') || healthCheck.stdout.includes('404')) {
            console.log('[Mobile API] Server is ready!')
            serverReady = true
          } else {
            console.log(`[Mobile API] Attempt ${attempts}/${maxAttempts}: Server not ready yet...`)
          }
        } catch (error) {
          console.log(`[Mobile API] Health check failed:`, error)
        }
      }

      if (!serverReady) {
        console.warn('[Mobile API] Server may not be fully ready, but proceeding')
      }
    } else {
      console.log('[Mobile API] Dev server is already running')
    }

    // Update project status
    await db
      .update(projects)
      .set({
        sandboxStatus: 'active',
        serverStatus: 'running',
        serverReady: true,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))

    return NextResponse.json({
      url: metroUrl || '',
      sandboxId: project.sandboxId,
    })
  } catch (error) {
    console.error('[Mobile API] Error resuming project:', error)
    return NextResponse.json(
      { error: 'Failed to resume project' },
      { status: 500 }
    )
  }
}
