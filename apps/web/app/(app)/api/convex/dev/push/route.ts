// API endpoint to push Convex schema/function changes from sandbox

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects, convexProjectCredentials } from '@react-native-vibe-code/database'
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

    // Get Convex credentials
    const [credentials] = await db
      .select()
      .from(convexProjectCredentials)
      .where(eq(convexProjectCredentials.projectId, projectId))
      .limit(1)

    if (!credentials) {
      return NextResponse.json({ error: 'No Convex project connected' }, { status: 400 })
    }

    // Get sandbox instance
    const sandbox = await connectSandbox(project.sandboxId)

    // Ensure .env.local has the credentials for the client-side (EXPO_PUBLIC_ prefix for Expo apps)
    const { updateSandboxEnvFile } = await import('@/lib/convex/sandbox-utils')
    await updateSandboxEnvFile(sandbox, 'EXPO_PUBLIC_CONVEX_URL', credentials.deploymentUrl)

    // Push changes to Convex using the project deploy key
    // The deploy key format is: project:team:project|token
    // Use --typecheck=disable to skip TS errors in user code
    const result = await sandbox.commands.run(
      `cd /home/user/app && CONVEX_DEPLOY_KEY="${credentials.adminKey}" bunx convex deploy --typecheck=disable 2>&1`,
      {
        timeoutMs: 120000, // 120 second timeout for deployment
      }
    )

    console.log('[Convex Push] stdout:', result.stdout)
    console.log('[Convex Push] stderr:', result.stderr)
    console.log('[Convex Push] exitCode:', result.exitCode)

    if (result.exitCode !== 0) {
      return NextResponse.json({
        error: `Convex push failed: ${result.stdout || result.stderr}`,
        stdout: result.stdout,
        stderr: result.stderr,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Convex changes pushed successfully',
      output: result.stdout,
    })
  } catch (error) {
    console.error('Error pushing Convex changes:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to push Convex changes'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
