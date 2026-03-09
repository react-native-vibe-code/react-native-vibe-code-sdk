import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { startExpoServer } from '@/lib/server-utils'
import { connectSandbox } from '@/lib/sandbox-connect'
import { eq, and } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { tunnelMode as tunnelModeFlag } from '@/flags'

export const maxDuration = 120

interface RestartServerRequest {
  projectId: string
  userID: string
  sandboxId: string
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, userID, sandboxId }: RestartServerRequest = await req.json()

    console.log('[Restart Server] API called with:', {
      projectId,
      userID,
      sandboxId,
    })

    if (!userID) {
      return Response.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 })
    }

    if (!sandboxId) {
      return Response.json({ error: 'Sandbox ID is required' }, { status: 400 })
    }

    // Get existing project
    const existingProjects = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.userId, userID),
          eq(projects.status, 'active'),
        ),
      )
      .limit(1)

    if (existingProjects.length === 0) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = existingProjects[0]
    console.log(
      `[Restart Server] Found project: ${project.id} with sandbox: ${project.sandboxId}`,
    )

    if (project.sandboxId !== sandboxId) {
      return Response.json(
        { error: 'Sandbox ID mismatch' },
        { status: 400 },
      )
    }

    let sandbox: Sandbox | null = null

    // Try to connect to the existing sandbox
    try {
      sandbox = await connectSandbox(sandboxId)
      console.log(`[Restart Server] Connected to sandbox: ${sandbox.sandboxId}`)
    } catch (error) {
      console.log(`[Restart Server] Failed to resume sandbox ${sandboxId}:`, error)
      return Response.json(
        {
          error: 'Failed to resume sandbox',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      )
    }

    // First, kill any existing Expo and ngrok processes
    console.log('[Restart Server] Killing existing Expo and ngrok processes...')
    try {
      await sandbox.commands.run(
        'pkill -f "expo start" || true',
        { timeoutMs: 5000 }
      )
      await sandbox.commands.run(
        'pkill -f "watchman" || true',
        { timeoutMs: 5000 }
      )
      await sandbox.commands.run(
        'pkill -f "ngrok" || true',
        { timeoutMs: 5000 }
      )
      // Wait a bit for processes to clean up
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (error) {
      console.log('[Restart Server] Error killing processes (non-fatal):', error)
    }

    // Start Expo server for React Native projects (both production and testing templates)
    if (project.template === 'react-native-expo' || project.template === 'expo-testing') {
      try {
        console.log('[Restart Server] Starting Expo server...')
        const currentTunnelMode = await tunnelModeFlag()
        const serverResult = await startExpoServer(sandbox, project.id, undefined, currentTunnelMode as any)

        return Response.json({
          success: true,
          projectId: project.id,
          projectTitle: project.title,
          sandboxId: sandbox.sandboxId,
          url: serverResult.url,
          ngrokUrl: serverResult.ngrokUrl,
          serverReady: serverResult.serverReady,
          restarted: true,
          tunnelMode: currentTunnelMode,
        })
      } catch (error) {
        console.log('[Restart Server] Error starting Expo server:', error)
        return Response.json(
          {
            success: false,
            error: 'Failed to restart server',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 },
        )
      }
    }

    // For non-React Native projects
    return Response.json({
      success: true,
      projectId: project.id,
      projectTitle: project.title,
      sandboxId: sandbox.sandboxId,
      url: `https://${sandbox.getHost(8081)}`,
      serverReady: false,
      restarted: true,
    })
  } catch (error) {
    console.error('[Restart Server] Error in API:', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}