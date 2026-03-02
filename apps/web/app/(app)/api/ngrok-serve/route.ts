// THIS FILE SHOULD NEVER BE EDITED, THE PORT, THE EXPO SERVER RUNNING ALL OF IT IS NECESARY
import { connectSandbox } from '@/lib/sandbox-connect'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  console.log('[Test Expo] Starting ngrok setup...')

  try {
    const { searchParams } = new URL(request.url)
    const sandboxId = searchParams.get('sandboxId')
    // IMPORTANT: Do not change this port! It's intentionally different from server-utils.ts (8090)
    // This port configuration is required for the ngrok tunnel to work correctly
    // const port = '8888'
    const port = '8999'

    if (!sandboxId) {
      return NextResponse.json(
        { success: false, error: 'sandboxId is required' },
        { status: 400 }
      )
    }

    // Connect to existing sandbox
    console.log('[Test Expo] Connecting to sandbox:', sandboxId)
    let sandbox
    try {
      sandbox = await connectSandbox(sandboxId)
      console.log('[Test Expo] Connected to sandbox:', sandbox.sandboxId)
    } catch (connectError) {
      console.error('[Test Expo] Failed to connect to sandbox:', connectError)
      return NextResponse.json(
        { success: false, error: `Failed to connect to sandbox: ${connectError instanceof Error ? connectError.message : 'Unknown error'}` },
        { status: 500 }
      )
    }

    // Check if ngrok is installed, if not install it
    console.log('[Test Expo] Checking ngrok installation...')
    const ngrokCheck = await sandbox.commands.run('command -v ngrok || echo "NGROK_NOT_FOUND"')

    if (ngrokCheck.stdout.includes('NGROK_NOT_FOUND') || !ngrokCheck.stdout || ngrokCheck.stdout.trim() === '') {
      console.log('[Test Expo] ngrok not found, installing...')
      const installResult = await sandbox.commands.run('wget -q https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz && tar -xzf ngrok-v3-stable-linux-amd64.tgz && sudo mv ngrok /usr/local/bin/ && rm ngrok-v3-stable-linux-amd64.tgz', {
        onStdout: (data: string) => {
          console.log('[Test Expo] NGROK INSTALL STDOUT:', data)
        },
        onStderr: (data: string) => {
          console.log('[Test Expo] NGROK INSTALL STDERR:', data)
        },
      })

      if (installResult.exitCode !== 0) {
        console.error('[Test Expo] Failed to install ngrok:', installResult.stderr)
        return NextResponse.json(
          { success: false, error: `Failed to install ngrok: ${installResult.stderr}` },
          { status: 500 }
        )
      }
      console.log('[Test Expo] ngrok installed successfully')
    } else {
      console.log('[Test Expo] ngrok already installed at:', ngrokCheck.stdout.trim())
    }

    // Start ngrok tunnel
    console.log('[Test Expo] Starting ngrok tunnel...')

    const authtokenResult = await sandbox.commands.run(`ngrok config add-authtoken ${process.env.NGROK_AUTHTOKEN}`, {
      onStdout: (data: string) => {
        console.log('[Test Expo] NGROK CONFIG ADD-AUTHTOKEN STDOUT:', data)
      },
      onStderr: (data: string) => {
        console.log('[Test Expo] NGROK CONFIG ADD-AUTHTOKEN STDERR:', data)
      },
    })

    if (authtokenResult.exitCode !== 0) {
      console.error('[Test Expo] Failed to configure ngrok authtoken:', authtokenResult.stderr)
      return NextResponse.json(
        { success: false, error: `Failed to configure ngrok authtoken: ${authtokenResult.stderr}` },
        { status: 500 }
      )
    }

    // Kill any existing ngrok processes first
    console.log('[Test Expo] Killing any existing ngrok processes...')
    await sandbox.commands.run('pkill -9 ngrok || true', {
      onStdout: (data: string) => {
        console.log('[Test Expo] PKILL NGROK STDOUT:', data)
      },
      onStderr: (data: string) => {
        console.log('[Test Expo] PKILL NGROK STDERR:', data)
      },
    })

    // Generate ngrok domain
    const domain = `capsule-${Math.floor(Math.random() * 200000)}.ngrok.dev`
    const ngrokUrl = `https://${domain}`
    console.log(`[Test Expo] Using ngrok domain: ${ngrokUrl}`)

    // Start ngrok tunnel in background with domain
    const ngrokProcess = sandbox.commands.run(`ngrok http ${port} --domain ${domain}`, {
      background: true,
      timeoutMs: parseInt(process.env.E2B_SANDBOX_TIMEOUT_MS || '3600000'), // Use env var, default to 1 hour
      onStdout: (data: string) => {
        console.log('[Test Expo] NGROK STDOUT:', data)
      },
      onStderr: (data: string) => {
        console.log('[Test Expo] NGROK STDERR:', data)
      },
    })

    // Wait a few seconds for ngrok to initialize
    console.log('[Test Expo] Waiting for ngrok to initialize....')
    await new Promise(resolve => setTimeout(resolve, 5000))

  //   console.log('[Test Expo] ngrok tunnel established:', ngrokUrl)
  //  // Start Expo server
  //   console.log('[Test Expo] Starting Expo server...')
  //   sandbox.commands.run(
  //     `cd /home/user/app && CI=false npx expo start --web --tunnel --port ${port}`,
  //     {
  //       envs: {
  //         CI: 'false',
  //       },
  //       background: true,
  //       timeoutMs: 1800000, // 30 minutes
  //       onStdout: (data: string) => {
  //         console.log('[Test Expo] EXPO STDOUT:', data)
  //       },
  //       onStderr: (data: string) => {
  //         console.log('[Test Expo] EXPO STDERR:', data)
  //       },
  //     }
  //   )

    return NextResponse.json({
      success: true,
      sandboxId: sandbox.sandboxId,
      ngrokUrl: ngrokUrl,
      port: port,
    })
  } catch (error) {
    console.error('[Test Expo] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
