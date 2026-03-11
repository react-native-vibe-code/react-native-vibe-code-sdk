import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects, projectEnvVars } from '@react-native-vibe-code/database'
import { eq, and, asc } from 'drizzle-orm'
import { auth } from '@/lib/auth/config'
import { headers } from 'next/headers'

// GET /api/env-vars?projectId=xxx
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  // Verify project belongs to user
  const project = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
    .then((rows) => rows[0])

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const vars = await db
    .select()
    .from(projectEnvVars)
    .where(eq(projectEnvVars.projectId, projectId))
    .orderBy(asc(projectEnvVars.createdAt))

  return NextResponse.json({ vars })
}

// POST /api/env-vars
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId, key, value, type } = await req.json()
  if (!projectId || !key || value === undefined || !type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Verify project belongs to user
  const project = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
    .then((rows) => rows[0])

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [envVar] = await db
    .insert(projectEnvVars)
    .values({
      projectId,
      userId: session.user.id,
      key,
      value,
      type,
    })
    .returning()

  return NextResponse.json({ envVar }, { status: 201 })
}
