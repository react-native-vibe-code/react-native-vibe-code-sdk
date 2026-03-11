import { NextRequest, NextResponse } from 'next/server'
import { Sandbox } from '@e2b/code-interpreter'
import { db } from '@/lib/db'
import { projects, projectEnvVars } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/config'
import { headers } from 'next/headers'
import { updateSandboxEnvFile } from '@/lib/convex/sandbox-utils'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sandboxId, projectId } = await req.json()
  if (!sandboxId || !projectId) {
    return NextResponse.json(
      { error: 'sandboxId and projectId required' },
      { status: 400 }
    )
  }

  // Verify project belongs to user
  const project = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.userId, session.user.id))
    )
    .then((rows) => rows[0])

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const sandbox = await Sandbox.connect(sandboxId)

    // Write all env vars to .env.local
    const envVars = await db
      .select()
      .from(projectEnvVars)
      .where(eq(projectEnvVars.projectId, projectId))

    for (const envVar of envVars) {
      await updateSandboxEnvFile(sandbox, envVar.key, envVar.value)
    }

    // Kill existing Expo server and restart
    console.log('[Restart Server] Killing existing Expo server...')
    await sandbox.commands.run('pkill -f "expo start" || true', {
      timeoutMs: 10000,
    })

    // Wait for port to free up
    await new Promise((resolve) => setTimeout(resolve, 2000))

    console.log('[Restart Server] Starting Expo server...')
    await sandbox.commands.run(
      'cd /home/user/app && bun run start --tunnel --web',
      {
        background: true,
        timeoutMs: 3600000,
      }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Restart Server] Failed:', error)
    return NextResponse.json(
      { error: 'Failed to restart server' },
      { status: 500 }
    )
  }
}
