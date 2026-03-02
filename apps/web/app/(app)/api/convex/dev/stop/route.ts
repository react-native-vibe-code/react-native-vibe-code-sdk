// API endpoint to stop Convex dev server in sandbox

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/config'
import { headers } from 'next/headers'
import { connectSandbox } from '@/lib/sandbox-connect'

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

    // Get sandbox instance
    const sandbox = await connectSandbox(project.sandboxId)

    // Kill convex processes
    await sandbox.commands.run('pkill -f "convex dev"')

    // Update project status
    await db
      .update(projects)
      .set({
        convexDevRunning: false,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))

    return NextResponse.json({
      success: true,
      message: 'Convex dev server stopped',
    })
  } catch (error) {
    console.error('Error stopping Convex dev:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to stop Convex dev'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
