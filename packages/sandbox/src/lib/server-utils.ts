import { db, projects, eq } from '@react-native-vibe-code/database'
import { Sandbox } from '@e2b/code-interpreter'
import { detectAndNotifyRuntimeError } from '@react-native-vibe-code/error-manager/server'

export async function startExpoServer(
  sandbox: Sandbox,
  projectId?: string,
  customNgrokUrl?: string,
): Promise<{ url: string; serverReady: boolean; ngrokUrl?: string }> {
  console.log('[Server Utils] Starting Expo web server...')
  console.log('[Server Utils] ProjectId for error notifications:', projectId || 'NOT PROVIDED')

  let serverOutput = ''
  let webBundled = false
  let processHandle: any = null
  let port = 8081

  console.log('[Server Utils] sandboxId', sandbox.sandboxId)
  // Use sandbox ID as the ngrok domain (e.g., sandbox ID becomes sandboxid.ngrok.dev)
  const ngrokDomain = customNgrokUrl || sandbox.sandboxId
  const ngrokUrl = `https://${ngrokDomain}.ngrok.dev`

  console.log('[Server Utils] Using ngrok domain:', ngrokDomain)
  console.log('[Server Utils] Ngrok URL will be:', ngrokUrl)

  // Set sandbox timeout to 1 hour
  console.log('[Server Utils] Setting sandbox timeout to 1 hour...')
  try {
    await sandbox.setTimeout(3600000) // 1 hour in milliseconds
    console.log('[Server Utils] Sandbox timeout set successfully')
  } catch (error) {
    console.log('[Server Utils] Failed to set sandbox timeout:', error)
  }

  // Kill any existing ngrok processes first to avoid domain conflicts
  console.log('[Server Utils] Checking for existing ngrok processes...')
  try {
    await sandbox.commands.run(
      `pkill -9 ngrok || true`,
      { timeoutMs: 5000 },
    )
    console.log('[Server Utils] Killed existing ngrok processes')
    await new Promise((resolve) => setTimeout(resolve, 1000))
  } catch (error) {
    console.log('[Server Utils] No ngrok processes to kill or kill failed:', error)
  }

  // Check if port 8081 is already in use (server already running)
  console.log(`[Server Utils] Checking port ${port} availability...`)
  try {
    const portCheck = await sandbox.commands.run(
      `netstat -tuln | grep :${port} || echo "PORT_AVAILABLE"`,
      { timeoutMs: 5000 },
    )

    if (!portCheck.stdout.includes('PORT_AVAILABLE')) {
      // Port 8081 is in use - check if it's a healthy server or zombie process
      console.log(`[Server Utils] Port ${port} is in use, checking if server is healthy...`)

      try {
        const healthCheck = await sandbox.commands.run(
          `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port} || echo "000"`,
          { timeoutMs: 10000 },
        )

        if (
          healthCheck.stdout.includes('200') ||
          healthCheck.stdout.includes('404')
        ) {
          console.log(`[Server Utils] ✅ Healthy server detected on port ${port}, will still restart to reconnect ngrok`)

          // Even if server is healthy, kill it to restart with fresh ngrok connection
          console.log(`[Server Utils] Killing existing server to restart with new ngrok connection...`)
          try {
            await sandbox.commands.run(
              `lsof -ti:${port} | xargs kill -9 || true`,
              { timeoutMs: 10000 },
            )
            console.log('[Server Utils] Existing server killed, waiting for port to be freed...')
            await new Promise((resolve) => setTimeout(resolve, 2000))
          } catch (killError) {
            console.log('[Server Utils] Failed to kill existing server:', killError)
          }
        } else {
          // Server is not responding - kill zombie process
          console.log(`[Server Utils] Port ${port} occupied but server not responding, killing zombie process...`)
          try {
            await sandbox.commands.run(
              `lsof -ti:${port} | xargs kill -9 || true`,
              { timeoutMs: 10000 },
            )
            console.log('[Server Utils] Zombie process killed, waiting for port to be freed...')
            await new Promise((resolve) => setTimeout(resolve, 2000))
          } catch (killError) {
            console.log('[Server Utils] Failed to kill zombie process:', killError)
          }
        }
      } catch (healthError) {
        console.log('[Server Utils] Health check failed, attempting to kill zombie process...')
        try {
          await sandbox.commands.run(
            `lsof -ti:${port} | xargs kill -9 || true`,
            { timeoutMs: 10000 },
          )
          console.log('[Server Utils] Process killed')
          await new Promise((resolve) => setTimeout(resolve, 2000))
        } catch (killError) {
          console.log('[Server Utils] Failed to kill process:', killError)
        }
      }
    }

    console.log(`[Server Utils] Port ${port} is available, starting new server...`)
  } catch (error) {
    console.log('[Server Utils] Port check failed, will attempt to start server anyway')
  }

  // Increase inotify limit for file watching
  console.log('[Server Utils] Setting inotify limits...')
  try {
    await sandbox.commands.run(
      'sudo sysctl fs.inotify.max_user_watches=524288',
      {
        timeoutMs: 10000,
      },
    )
    console.log('[Server Utils] inotify limits set successfully')
  } catch (error) {
    console.log('[Server Utils] Failed to set inotify limits:', error)
  }

  // Write EXPO_PUBLIC_PROJECT_ID to .env.local if projectId is provided
  if (projectId) {
    console.log('[Server Utils] Writing EXPO_PUBLIC_PROJECT_ID to .env.local...')
    try {
      // Read existing .env.local if it exists
      let envContent = ''
      try {
        envContent = await sandbox.files.read('/home/user/app/.env.local')
      } catch (error) {
        // File doesn't exist, that's okay
        console.log('[Server Utils] .env.local does not exist, creating new one')
      }

      // Parse existing lines
      const lines = envContent.split('\n').filter(line => line.trim() !== '')
      const envVars = new Map<string, string>()

      // Parse existing env vars
      for (const line of lines) {
        const match = line.match(/^([^=]+)=(.*)$/)
        if (match) {
          envVars.set(match[1], match[2])
        }
      }

      // Update/add EXPO_PUBLIC_PROJECT_ID
      envVars.set('EXPO_PUBLIC_PROJECT_ID', projectId)
      console.log('[Server Utils] Set EXPO_PUBLIC_PROJECT_ID:', projectId)

      // Set EXPO_PUBLIC_SANDBOX_ID so the hover system can identify the sandbox
      envVars.set('EXPO_PUBLIC_SANDBOX_ID', sandbox.sandboxId)
      console.log('[Server Utils] Set EXPO_PUBLIC_SANDBOX_ID:', sandbox.sandboxId)

      // Convert map back to lines
      const newLines = Array.from(envVars.entries()).map(
        ([key, value]) => `${key}=${value}`
      )

      // Write back to file
      await sandbox.files.write('/home/user/app/.env.local', newLines.join('\n') + '\n')
      console.log('[Server Utils] EXPO_PUBLIC_PROJECT_ID written to .env.local successfully')
    } catch (error) {
      console.log('[Server Utils] Failed to write to .env.local:', error)
    }
  }

  // Configure ngrok auth token
  console.log('[Server Utils] Configuring ngrok auth token...')
  try {
    await sandbox.commands.run(
      `ngrok config add-authtoken ${process.env.NGROK_AUTHTOKEN}`,
      {
        onStdout: (data: string) => {
          console.log('[Server Utils] NGROK CONFIG STDOUT:', data)
        },
        onStderr: (data: string) => {
          console.log('[Server Utils] NGROK CONFIG STDERR:', data)
        },
      },
    )
    console.log('[Server Utils] Ngrok configured successfully')
  } catch (error) {
    console.log('[Server Utils] Failed to configure ngrok:', error)
  }

  // Verify bun is available (should be system-wide from imbios/bun-node image)
  console.log('[Server Utils] Verifying bun installation...')
  try {
    const verifyResult = await sandbox.commands.run('which bun', { timeoutMs: 5000 })
    console.log('[Server Utils] Bun location:', verifyResult.stdout.trim())
  } catch (error) {
    console.log('[Server Utils] Bun not found in PATH:', error)
  }

  // Start the web server in background
  // Build the command with ngrok domain using sandbox ID
  const startCommand = `cd /home/user/app && CI=false bun install && bun run start -- --ngrokurl ${ngrokDomain} --tunnel --web`

  console.log('[Server Utils] Starting with command:', startCommand)

  const webServerProcess = sandbox.commands
    .run(
      startCommand,
      {
        envs: {},
        requestTimeoutMs: 3600000,
        timeoutMs: 3600000,
        background: true,
        onStdout: (data: string) => {
          console.log('[Server Utils] SERVER STDOUT:', data)
          serverOutput += data

          // Check for runtime errors and send notifications
          detectAndNotifyRuntimeError(data, projectId)

          // Check for Web Bundled specifically
          if (
            data.includes('Web Bundled') ||
            data.includes(`Waiting on http://localhost:${port}`)
          ) {
            console.log('[Server Utils] Web Bundled: true')
            webBundled = true
          }

          // Check for Tunnel ready confirmation
          if (data.includes('Tunnel ready') || data.includes('Tunnel connected')) {
            console.log('[Server Utils] Tunnel ready detected')
          }
        },
        onStderr: (data: string) => {
          console.log('SERVER STDERR:', data)
          serverOutput += data

          // Check for runtime errors in stderr as well
          detectAndNotifyRuntimeError(data, projectId)
        },
      },
    )
    .catch((err: any) => console.log('Server process error:', err))

  // Store the process handle when it resolves
  webServerProcess
    .then((proc) => {
      processHandle = proc
    })
    .catch(() => {
      // Process handle assignment failed
    })

  console.log('Waiting for server to start...')

  // Wait for webBundled with timeout and health checks
  const maxWaitTime = 60000 // 60 seconds (reduced from 120)
  const checkInterval = 3000 // 3 seconds
  let waitTime = 0
  let consecutiveSuccessfulChecks = 0

  while (!webBundled && waitTime < maxWaitTime) {
    await new Promise((resolve) => setTimeout(resolve, checkInterval))
    waitTime += checkInterval

    // Try to ping the server directly
    try {
      console.log(`[Server Utils] Running health check at ${waitTime}ms...`)
      const healthCheck = await sandbox.commands.run(
        `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port} || echo "000"`,
        { timeoutMs: 10000 },
      )

      console.log(`[Server Utils] Health check response: ${healthCheck.stdout.trim()}`)

      if (
        healthCheck.stdout.includes('200') ||
        healthCheck.stdout.includes('404')
      ) {
        consecutiveSuccessfulChecks++
        console.log(`[Server Utils] ✅ Server responding to HTTP requests (${consecutiveSuccessfulChecks} consecutive checks)`)

        // Consider server ready after 2 consecutive successful health checks
        if (consecutiveSuccessfulChecks >= 2) {
          console.log('[Server Utils] Server is stable and responding, considering it ready')
          webBundled = true
          break
        }
      } else {
        consecutiveSuccessfulChecks = 0
        console.log(`[Server Utils] ❌ Server not ready yet, response code: ${healthCheck.stdout.trim()}`)
      }
    } catch (error) {
      consecutiveSuccessfulChecks = 0
      console.log(`[Server Utils] ❌ Health check error: ${error}`)
    }

    if (!webBundled) {
      console.log(`[Server Utils] Still waiting for server... ${waitTime}ms elapsed`)
    }
  }

  // Get the public URL using e2b's getHost method
  const publicHost = sandbox.getHost(port)
  // Include sandboxId as query parameter for the hover system
  const publicUrl = `https://${publicHost}?sandboxId=${sandbox.sandboxId}`

  console.log('E2B public URL:', publicUrl)

  if (!webBundled) {
    console.warn('WebBundled not detected, but proceeding with URL')
  }

  console.log('[Server Utils] Final ngrokUrl value:', ngrokUrl)
  console.log('[Server Utils] Server ready status:', webBundled)

  // Save server info to database if projectId is provided
  if (projectId) {
    try {
      await db
        .update(projects)
        .set({
          sandboxUrl: publicUrl,
          serverReady: webBundled,
          ngrokUrl: ngrokUrl,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))

      console.log(
        `[Server Utils] Saved server info to database for project ${projectId}`,
      )

      if (ngrokUrl) {
        console.log(`[Server Utils] Ngrok URL saved to database: ${ngrokUrl}`)
      }
    } catch (error) {
      console.error(
        `[Server Utils] Failed to save server info to database: ${error}`,
      )
      // Don't fail the entire operation if database update fails
    }
  }

  return {
    url: publicUrl,
    serverReady: webBundled,
    ngrokUrl: ngrokUrl,
  }
}
