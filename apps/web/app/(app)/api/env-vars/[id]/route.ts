import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projectEnvVars } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/config'
import { headers } from 'next/headers'

// PUT /api/env-vars/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { key, value, type } = await req.json()

  const [updated] = await db
    .update(projectEnvVars)
    .set({ key, value, type, updatedAt: new Date() })
    .where(
      and(
        eq(projectEnvVars.id, id),
        eq(projectEnvVars.userId, session.user.id)
      )
    )
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ envVar: updated })
}

// DELETE /api/env-vars/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const deleted = await db
    .delete(projectEnvVars)
    .where(
      and(
        eq(projectEnvVars.id, id),
        eq(projectEnvVars.userId, session.user.id)
      )
    )
    .returning()

  if (!deleted.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
