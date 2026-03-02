import { NextResponse } from 'next/server'
import { Sandbox } from '@e2b/code-interpreter'
import { connectSandbox } from '@/lib/sandbox-connect'
import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'

interface BackupServerRequest {
  sandboxId: string
  projectId: string
  userId: string
  action: 'start_backup' | 'cleanup_and_restart' | 'kill_backup'
}

interface BackupServerResponse {
  success: boolean
  backupPort?: number
  ngrokUrl?: string
  sandboxUrl?: string  // E2B public URL for the backup port
  message?: string
  error?: string
}

const PRIMARY_PORT = 8081
const BACKUP_PORT = 8082
const NGROK_AUTH_TOKEN = process.env.NGROK_AUTHTOKEN!

export async function POST(request: Request) {
  try {
    const body: BackupServerRequest = await request.json()
    const { sandboxId, projectId, userId, action } = body

    if (!sandboxId || !projectId || !userId || !action) {
      return NextResponse.json<BackupServerResponse>(
        { success: false, error: 'sandboxId, projectId, userId, and action are required' },
        { status: 400 }
      )
    }

    console.log('[ngrok-backup-server] Request:', { sandboxId, projectId, userId, action })

    // Verify project ownership
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1)

    if (!project.length) {
      return NextResponse.json<BackupServerResponse>(
        { success: false, error: 'Project not found or unauthorized' },
        { status: 403 }
      )
    }

    // Connect to sandbox
    let sandbox: Sandbox
    try {
      sandbox = await connectSandbox(sandboxId)
    } catch (error) {
      console.error('[ngrok-backup-server] Failed to connect to sandbox:', error)
      return NextResponse.json<BackupServerResponse>(
        { success: false, error: 'Failed to connect to sandbox' },
        { status: 500 }
      )
    }

    const ngrokDomain = sandboxId
    const ngrokUrl = `https://${ngrokDomain}.ngrok.dev`

    switch (action) {
      case 'start_backup':
        return await startBackupServer(sandbox, sandboxId, projectId, ngrokDomain, ngrokUrl)

      case 'cleanup_and_restart':
        return await cleanupAndRestart(sandbox, sandboxId, projectId, ngrokDomain, ngrokUrl)

      case 'kill_backup':
        return await killBackupServer(sandbox)

      default:
        return NextResponse.json<BackupServerResponse>(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[ngrok-backup-server] Error:', error)
    return NextResponse.json<BackupServerResponse>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function startBackupServer(
  sandbox: Sandbox,
  sandboxId: string,
  projectId: string,
  ngrokDomain: string,
  ngrokUrl: string
): Promise<NextResponse<BackupServerResponse>> {
  console.log('[ngrok-backup-server] Starting backup server on port', BACKUP_PORT)

  try {
    // Step 1: Kill any existing process on backup port
    console.log('[ngrok-backup-server] Killing any existing process on backup port...')
    try {
      await sandbox.commands.run(`lsof -ti:${BACKUP_PORT} | xargs kill -9 || true`, { timeoutMs: 5000 })
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
      console.log('[ngrok-backup-server] No process to kill on backup port')
    }

    // Step 2: Kill existing ngrok processes
    console.log('[ngrok-backup-server] Killing existing ngrok processes...')
    try {
      await sandbox.commands.run('pkill -9 ngrok || true', { timeoutMs: 5000 })
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
      console.log('[ngrok-backup-server] No ngrok processes to kill')
    }

    // Step 3: Configure ngrok auth token
    console.log('[ngrok-backup-server] Configuring ngrok auth token...')
    try {
      await sandbox.commands.run(`ngrok config add-authtoken ${NGROK_AUTH_TOKEN}`, { timeoutMs: 5000 })
    } catch (error) {
      console.log('[ngrok-backup-server] Failed to configure ngrok:', error)
    }

    // Step 4: Start backup server
    // Use bunx expo start directly instead of bun run start to ensure proper argument passing
    const startCommand = `cd /home/user/app && CI=false bunx expo start --ngrokurl ${ngrokDomain} --tunnel --web --port ${BACKUP_PORT}`
    console.log('[ngrok-backup-server] Starting backup server with command:', startCommand)

    let serverReady = false

    // Start the server in background
    sandbox.commands.run(startCommand, {
      background: true,
      timeoutMs: 3600000,
      onStdout: (data: string) => {
        console.log('[ngrok-backup-server] BACKUP STDOUT:', data)
        if (data.includes('Web Bundled') || data.includes(`Waiting on http://localhost:${BACKUP_PORT}`)) {
          serverReady = true
        }
        if (data.includes('Tunnel ready') || data.includes('Tunnel connected')) {
          console.log('[ngrok-backup-server] Tunnel ready detected')
        }
      },
      onStderr: (data: string) => {
        console.log('[ngrok-backup-server] BACKUP STDERR:', data)
      },
    }).catch(err => console.log('[ngrok-backup-server] Server process error:', err))

    // Step 5: Wait for server to be ready with health checks
    const maxWaitTime = 60000 // 60 seconds
    const checkInterval = 3000 // 3 seconds
    let waitTime = 0
    let consecutiveSuccessfulChecks = 0

    while (!serverReady && waitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval))
      waitTime += checkInterval

      try {
        console.log(`[ngrok-backup-server] Health check at ${waitTime}ms...`)
        const healthCheck = await sandbox.commands.run(
          `curl -s -o /dev/null -w "%{http_code}" http://localhost:${BACKUP_PORT} || echo "000"`,
          { timeoutMs: 10000 }
        )

        if (healthCheck.stdout.includes('200') || healthCheck.stdout.includes('404')) {
          consecutiveSuccessfulChecks++
          console.log(`[ngrok-backup-server] ✅ Server responding (${consecutiveSuccessfulChecks} consecutive checks)`)

          if (consecutiveSuccessfulChecks >= 2) {
            serverReady = true
            break
          }
        } else {
          consecutiveSuccessfulChecks = 0
        }
      } catch (error) {
        consecutiveSuccessfulChecks = 0
        console.log(`[ngrok-backup-server] Health check error: ${error}`)
      }
    }

    if (!serverReady) {
      console.log('[ngrok-backup-server] ⚠️ Server not ready after timeout, but proceeding')
    }

    // Step 6: Verify ngrok tunnel is actually working (not just localhost)
    let ngrokWorking = false
    console.log('[ngrok-backup-server] Verifying ngrok tunnel is working...')

    // Wait a bit for ngrok to fully establish
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Check ngrok API first to see if tunnel exists
    try {
      const ngrokApiCheck = await sandbox.commands.run(
        `curl -s http://localhost:4040/api/tunnels 2>/dev/null || echo "{}"`,
        { timeoutMs: 10000 }
      )
      console.log('[ngrok-backup-server] Ngrok API response:', ngrokApiCheck.stdout.substring(0, 500))

      if (ngrokApiCheck.stdout.includes('public_url') && ngrokApiCheck.stdout.includes(ngrokDomain)) {
        console.log('[ngrok-backup-server] ✅ Ngrok tunnel found in API')
        ngrokWorking = true
      } else {
        console.log('[ngrok-backup-server] ⚠️ Ngrok tunnel not found in API, will try to start ngrok manually')
      }
    } catch (error) {
      console.log('[ngrok-backup-server] Ngrok API check failed:', error)
    }

    // If ngrok tunnel not working, start it manually
    if (!ngrokWorking) {
      console.log('[ngrok-backup-server] Starting ngrok tunnel manually...')
      try {
        // Kill any existing ngrok first
        await sandbox.commands.run('pkill -9 ngrok || true', { timeoutMs: 5000 })
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Start ngrok with the backup port
        const ngrokStartCmd = `ngrok http --domain=${ngrokDomain}.ngrok.dev ${BACKUP_PORT} > /tmp/ngrok.log 2>&1 &`
        console.log('[ngrok-backup-server] Running:', ngrokStartCmd)
        await sandbox.commands.run(ngrokStartCmd, { timeoutMs: 10000, background: true })

        // Wait for ngrok to start
        await new Promise(resolve => setTimeout(resolve, 5000))

        // Verify ngrok started
        const verifyNgrok = await sandbox.commands.run(
          `curl -s http://localhost:4040/api/tunnels 2>/dev/null || echo "{}"`,
          { timeoutMs: 10000 }
        )
        console.log('[ngrok-backup-server] Ngrok verification:', verifyNgrok.stdout.substring(0, 500))

        if (verifyNgrok.stdout.includes('public_url')) {
          console.log('[ngrok-backup-server] ✅ Ngrok tunnel started manually')
          ngrokWorking = true
        } else {
          console.log('[ngrok-backup-server] ❌ Failed to start ngrok tunnel manually')
        }
      } catch (error) {
        console.error('[ngrok-backup-server] Failed to start ngrok manually:', error)
      }
    }

    // Final verification: actually test the ngrok URL
    if (ngrokWorking) {
      console.log('[ngrok-backup-server] Testing ngrok URL:', ngrokUrl)
      try {
        // Test from outside the sandbox by making a request to the ngrok URL
        const response = await fetch(ngrokUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'BackupServerHealthCheck/1.0' },
          signal: AbortSignal.timeout(10000),
        })

        const text = await response.text()
        console.log('[ngrok-backup-server] Ngrok URL test status:', response.status)
        console.log('[ngrok-backup-server] Ngrok URL test response preview:', text.substring(0, 200))

        // Check for ngrok error patterns
        const ngrokErrorPatterns = ['ERR_NGROK', 'Tunnel not found', 'failed to complete tunnel']
        const hasNgrokError = ngrokErrorPatterns.some(pattern =>
          text.toLowerCase().includes(pattern.toLowerCase())
        )

        if (hasNgrokError) {
          console.log('[ngrok-backup-server] ❌ Ngrok URL returning error page')
          ngrokWorking = false
        } else if (response.ok || response.status === 404) {
          console.log('[ngrok-backup-server] ✅ Ngrok URL is working!')
          ngrokWorking = true
        } else {
          console.log('[ngrok-backup-server] ⚠️ Ngrok URL returned status:', response.status)
        }
      } catch (fetchError: any) {
        console.log('[ngrok-backup-server] ❌ Failed to test ngrok URL:', fetchError.message)
        ngrokWorking = false
      }
    }

    if (!ngrokWorking) {
      console.log('[ngrok-backup-server] ❌ Ngrok tunnel verification failed')
      return NextResponse.json<BackupServerResponse>({
        success: false,
        error: 'Backup server started but ngrok tunnel failed to connect',
        backupPort: BACKUP_PORT,
      })
    }

    // Get E2B public URL for the backup port
    const publicHost = sandbox.getHost(BACKUP_PORT)
    const sandboxUrl = `https://${publicHost}?sandboxId=${sandboxId}`
    console.log('[ngrok-backup-server] E2B public URL for backup port:', sandboxUrl)

    // Update database with backup server info (including new sandboxUrl)
    try {
      await db
        .update(projects)
        .set({
          sandboxUrl: sandboxUrl,  // Update to use backup port's E2B URL
          ngrokUrl: ngrokUrl,
          serverReady: serverReady,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
      console.log('[ngrok-backup-server] ✅ Database updated with new URLs')
    } catch (error) {
      console.error('[ngrok-backup-server] Failed to update database:', error)
    }

    return NextResponse.json<BackupServerResponse>({
      success: true,
      backupPort: BACKUP_PORT,
      ngrokUrl: ngrokUrl,
      sandboxUrl: sandboxUrl,
      message: serverReady ? 'Backup server started successfully' : 'Backup server started (may still be initializing)',
    })
  } catch (error) {
    console.error('[ngrok-backup-server] Failed to start backup server:', error)
    return NextResponse.json<BackupServerResponse>(
      { success: false, error: 'Failed to start backup server' },
      { status: 500 }
    )
  }
}

async function cleanupAndRestart(
  sandbox: Sandbox,
  sandboxId: string,
  projectId: string,
  ngrokDomain: string,
  ngrokUrl: string
): Promise<NextResponse<BackupServerResponse>> {
  console.log('[ngrok-backup-server] Cleaning up and restarting backup server...')

  try {
    // Step 1: Kill server on backup port
    console.log('[ngrok-backup-server] Killing server on backup port...')
    try {
      await sandbox.commands.run(`lsof -ti:${BACKUP_PORT} | xargs kill -9 || true`, { timeoutMs: 5000 })
    } catch (error) {
      console.log('[ngrok-backup-server] No process to kill')
    }

    // Step 2: Kill ngrok
    console.log('[ngrok-backup-server] Killing ngrok...')
    try {
      await sandbox.commands.run('pkill -9 ngrok || true', { timeoutMs: 5000 })
    } catch (error) {
      console.log('[ngrok-backup-server] No ngrok to kill')
    }

    // Step 3: Wait for processes to fully terminate
    console.log('[ngrok-backup-server] Waiting for cleanup...')
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Step 4: Start fresh backup server
    return await startBackupServer(sandbox, sandboxId, projectId, ngrokDomain, ngrokUrl)
  } catch (error) {
    console.error('[ngrok-backup-server] Cleanup and restart failed:', error)
    return NextResponse.json<BackupServerResponse>(
      { success: false, error: 'Cleanup and restart failed' },
      { status: 500 }
    )
  }
}

async function killBackupServer(sandbox: Sandbox): Promise<NextResponse<BackupServerResponse>> {
  console.log('[ngrok-backup-server] Killing backup server...')

  try {
    await sandbox.commands.run(`lsof -ti:${BACKUP_PORT} | xargs kill -9 || true`, { timeoutMs: 5000 })

    return NextResponse.json<BackupServerResponse>({
      success: true,
      message: 'Backup server killed',
    })
  } catch (error) {
    console.error('[ngrok-backup-server] Failed to kill backup server:', error)
    return NextResponse.json<BackupServerResponse>(
      { success: false, error: 'Failed to kill backup server' },
      { status: 500 }
    )
  }
}
