import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { connectSandbox, sandboxTimeout } from '@/lib/sandbox-connect'
import { eq, and } from 'drizzle-orm'
import { NextRequest } from 'next/server'

export const maxDuration = 60

interface SandboxStatusRequest {
  projectId: string
  userID: string
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, userID }: SandboxStatusRequest = await req.json()

    console.log('[Sandbox Status] Check sandbox status API called with:', {
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
      `[Sandbox Status] Found project: ${project.id} with sandbox: ${project.sandboxId}`,
    )

    if (!project.sandboxId) {
      return Response.json(
        {
          isRunning: false,
          needsResume: false,
          error: 'No sandbox found for project'
        },
        { status: 200 },
      )
    }

    // Try to get sandbox info
    try {
      const sandbox = await connectSandbox(project.sandboxId, { enforceMaxLifetime: true })

      if (!sandbox) {
        return Response.json({
          isRunning: false,
          needsResume: true,
          error: 'Sandbox exceeded maximum lifetime',
        })
      }

      const info = await sandbox.getInfo()

      console.log('[Sandbox Status] Sandbox info:', info)

      // Check if sandbox is still running based on endAt time
      const now = new Date()
      const endAt = new Date(info.endAt)
      const isRunning = now < endAt

      // Note: sandbox.close() is not available in E2B v2.0 API
      // The sandbox connection will be cleaned up automatically

      return Response.json({
        isRunning,
        needsResume: !isRunning,
        sandboxId: info.sandboxId,
        templateId: info.templateId,
        startedAt: info.startedAt,
        endAt: info.endAt,
      })
    } catch (error) {
      console.log(`[Sandbox Status] Failed to get sandbox info for ${project.sandboxId}:`, error)

      // If we can't get info, the sandbox is likely stopped/deleted
      return Response.json({
        isRunning: false,
        needsResume: true,
        error: error instanceof Error ? error.message : 'Failed to get sandbox info',
      })
    }
  } catch (error) {
    console.error('[Sandbox Status] Error in Sandbox Status API:', error)

    return Response.json(
      {
        isRunning: false,
        needsResume: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}