/**
 * Mobile API: Static Bundle Generation
 * POST /api/mobile/projects/[id]/bundle - Trigger static bundle build
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { getAuthenticatedUserId } from '@/lib/auth/test-mode'
import { buildStaticBundle, getLatestCommitSHA } from '@/lib/bundle-builder'
import { connectSandbox } from '@/lib/sandbox-connect'

/**
 * POST /api/mobile/projects/[id]/bundle
 * Trigger static bundle build for project
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const userId = await getAuthenticatedUserId()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projectId = params.id

    // Verify project ownership and get sandbox ID
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
        { error: 'No active sandbox for this project' },
        { status: 400 }
      )
    }

    // Get commit SHA from sandbox
    let commitId: string

    try {
      const sandbox = await connectSandbox(project.sandboxId)
      commitId = await getLatestCommitSHA(sandbox)
    } catch (error) {
      console.error('[Mobile API] Error getting commit SHA:', error)
      return NextResponse.json(
        { error: 'Failed to access sandbox' },
        { status: 500 }
      )
    }

    // Get user message from request body (optional)
    const body = await req.json().catch(() => ({}))
    const userMessage = body.message || 'Static bundle build'

    // Build bundle (this runs in background but we await it)
    const result = await buildStaticBundle(
      project.sandboxId,
      projectId,
      commitId,
      userMessage
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Bundle build failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      manifestUrl: result.manifestUrl,
      bundleUrl: result.bundleUrl,
      commitId: result.commitId,
    })
  } catch (error) {
    console.error('[Mobile API] Error building bundle:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
