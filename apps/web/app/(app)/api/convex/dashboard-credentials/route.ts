import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects, convexProjectCredentials } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/config'
import { headers } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId parameter' }, { status: 400 })
    }

    // Verify the user owns this project
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
      .limit(1)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const [credentials] = await db
      .select()
      .from(convexProjectCredentials)
      .where(eq(convexProjectCredentials.projectId, projectId))
      .limit(1)

    if (!credentials || !credentials.adminKey) {
      return NextResponse.json({ error: 'No Convex credentials found' }, { status: 404 })
    }

    return NextResponse.json({
      deploymentUrl: credentials.deploymentUrl,
      deploymentName: credentials.deploymentName,
      adminKey: credentials.adminKey,
    })
  } catch (error) {
    console.error('Error in Convex dashboard credentials API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
