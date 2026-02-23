import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { startExpoServer } from '@/lib/server-utils'
import { getSandboxProvider } from '@react-native-vibe-code/sandbox/lib'
import { eq, and } from 'drizzle-orm'
import { NextRequest } from 'next/server'

export const maxDuration = 120 // 2 minutes for server start

interface StartServerRequest {
  sandboxId: string
  projectId: string
  userID: string
}

export async function POST(req: NextRequest) {
  try {
    const { sandboxId, projectId, userID }: StartServerRequest =
      await req.json()

    console.log('Start Server API called with:', {
      sandboxId,
      projectId,
      userID,
    })

    if (!userID) {
      return Response.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (!sandboxId) {
      return Response.json({ error: 'Sandbox ID is required' }, { status: 400 })
    }

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Verify project exists and belongs to user
    let project
    try {
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
        return Response.json(
          { error: 'Project not found or access denied' },
          { status: 404 },
        )
      }

      project = existingProjects[0]

      // Check if server is already running AND sandbox is still valid
      if (project.serverStatus === 'running' && project.sandboxUrl && project.ngrokUrl) {
        // Verify the sandbox is still active before returning cached URLs
        try {
          console.log('Verifying sandbox is still active:', sandboxId)
          const testSandbox = await getSandboxProvider().connect(sandboxId)
          if (testSandbox.close) await testSandbox.close() // Close immediately after verification

          console.log(
            'Server already running and sandbox active, returning existing URLs:',
            project.sandboxUrl,
            project.ngrokUrl,
          )
          return Response.json({
            success: true,
            url: project.sandboxUrl,
            ngrokUrl: project.ngrokUrl,
            sandboxId,
            projectId,
            cached: true,
          })
        } catch (verifyError) {
          console.log('Cached sandbox no longer valid, will restart server:', verifyError)
          // Continue to restart the server
        }
      }
    } catch (error) {
      console.error('Error verifying project:', error)
      return Response.json(
        { error: 'Failed to verify project' },
        { status: 500 },
      )
    }

    // Connect to sandbox using the active provider
    let sandbox: Awaited<ReturnType<typeof getSandboxProvider>['connect']>
    try {
      sandbox = await getSandboxProvider().connect(sandboxId)
      console.log(`Connected to sandbox for server start: ${sandbox.sandboxId}`)
    } catch (error) {
      console.error(`Failed to resume sandbox ${sandboxId}:`, error)
      return Response.json(
        { error: 'Failed to resume sandbox' },
        { status: 400 },
      )
    }

    // Start Expo server
    try {
      console.log('Starting Expo server...')
      const serverResult = await startExpoServer(sandbox, projectId)

      console.log('Expo server started successfully:', serverResult.url)

      // Update project with server status and URL
      await db
        .update(projects)
        .set({
          serverStatus: 'running',
          sandboxUrl: serverResult.url,
          ngrokUrl: serverResult.ngrokUrl,
          serverReady: true,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))

      return Response.json({
        success: true,
        url: serverResult.url,
        ngrokUrl: serverResult.ngrokUrl,
        sandboxId,
        projectId,
      })
    } catch (error) {
      console.error('Error starting Expo server:', error)
      return Response.json(
        {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to start server',
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('Error in Start Server API:', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}
