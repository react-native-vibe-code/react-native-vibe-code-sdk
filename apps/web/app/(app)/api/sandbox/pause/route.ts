import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { connectSandbox } from '@/lib/sandbox-connect'
import { eq, and } from 'drizzle-orm'

export async function POST(req: Request) {
  const { projectId, userID } = await req.json()

  if (!projectId || !userID) {
    return new Response(
      JSON.stringify({ error: 'Project ID and User ID are required' }),
      {
        status: 400,
      },
    )
  }

  try {
    // Find the project
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
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
      })
    }

    const project = existingProjects[0]

    if (!project.sandboxId) {
      return new Response(
        JSON.stringify({ error: 'No sandbox associated with project' }),
        {
          status: 400,
        },
      )
    }

    // Connect to the sandbox and pause it
    const sbx = await connectSandbox(project.sandboxId)
    const pausedSandboxId = await sbx.pause()

    // Update project status to paused and server status to closed
    await db
      .update(projects)
      .set({
        status: 'paused',
        serverStatus: 'closed',
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))

    console.log(`Paused sandbox ${project.sandboxId} for project ${projectId}`)

    return new Response(
      JSON.stringify({
        success: true,
        pausedSandboxId,
        message: 'Sandbox paused successfully',
      }),
    )
  } catch (error) {
    console.error('Error pausing sandbox:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to pause sandbox',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
      },
    )
  }
}
