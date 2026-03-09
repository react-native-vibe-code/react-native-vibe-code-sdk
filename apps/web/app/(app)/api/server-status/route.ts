import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { startExpoServer } from '@/lib/server-utils'
import { connectSandbox } from '@/lib/sandbox-connect'
import { eq, and } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { tunnelMode as tunnelModeFlag } from '@/flags'

export const maxDuration = 120

interface ServerStatusRequest {
  projectId: string
  userID: string
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, userID }: ServerStatusRequest = await req.json()

    console.log('Server status API called with:', {
      projectId,
      userID,
    })

    if (!userID) {
      return Response.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 })
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
      `Found project: ${project.id} with sandbox: ${project.sandboxId}`,
    )

    if (!project.sandboxId) {
      return Response.json(
        { error: 'No sandbox found for project' },
        { status: 404 },
      )
    }

    // Check if we already have server info and it's ready
    if (project.sandboxUrl && project.serverReady) {
      console.log('Server already running, returning cached info')
      return Response.json({
        success: true,
        projectId: project.id,
        projectTitle: project.title,
        sandboxId: project.sandboxId,
        url: project.sandboxUrl,
        serverReady: project.serverReady,
        cached: true,
      })
    }

    // Server not ready or no URL, start it
    console.log('Server not ready, starting Expo server...')

    let sandbox: Sandbox | null = null

    // Try to connect to the existing sandbox
    try {
      sandbox = await connectSandbox(project.sandboxId)
      console.log(`Connected to sandbox: ${sandbox.sandboxId}`)
    } catch (error) {
      console.log(`Failed to resume sandbox ${project.sandboxId}:`, error)
      return Response.json(
        {
          error: 'Failed to resume sandbox',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      )
    }

    // Start Expo server for React Native projects (both production and testing templates)
    if (project.template === 'react-native-expo' || project.template === 'expo-testing') {
      try {
        const currentTunnelMode = await tunnelModeFlag()
        const serverResult = await startExpoServer(sandbox, project.id, undefined, currentTunnelMode as any)
        return Response.json({
          success: true,
          projectId: project.id,
          projectTitle: project.title,
          sandboxId: sandbox.sandboxId,
          url: serverResult.url,
          serverReady: serverResult.serverReady,
          cached: false,
          tunnelMode: currentTunnelMode,
        })
      } catch (error) {
        console.log('Error starting Expo server:', error)
        return Response.json(
          {
            success: false,
            error: 'Failed to start server',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 },
        )
      }
    }

    // For non-React Native projects, just return the sandbox URL
    return Response.json({
      success: true,
      projectId: project.id,
      projectTitle: project.title,
      sandboxId: sandbox.sandboxId,
      url: `https://${sandbox.getHost(8081)}`,
      serverReady: false,
      cached: false,
    })
  } catch (error) {
    console.error('Error in Server Status API:', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}
