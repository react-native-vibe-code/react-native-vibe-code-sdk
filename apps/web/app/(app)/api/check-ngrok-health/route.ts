import { NextResponse } from 'next/server'
import { connectSandbox } from '@/lib/sandbox-connect'

interface CheckNgrokHealthRequest {
  ngrokUrl: string
  sandboxId: string
  checkPort?: number
}

interface CheckNgrokHealthResponse {
  isAlive: boolean
  reason?: string
  tunnelStatus: 'connected' | 'disconnected' | 'unknown'
  serverStatus?: 'running' | 'stopped'
}

// Error patterns that indicate ngrok tunnel is down
const NGROK_ERROR_PATTERNS = [
  'ERR_NGROK',
  'Tunnel not found',
  'failed to complete tunnel connection',
  'ngrok error',
  'Closed Port Error',
  'Connection refused on port',
  'no service running on port',
  'tunnel session not found',
  '502 Bad Gateway',
  '503 Service Unavailable',
]

export async function POST(request: Request) {
  try {
    const body: CheckNgrokHealthRequest = await request.json()
    const { ngrokUrl, sandboxId, checkPort = 8081 } = body

    if (!ngrokUrl || !sandboxId) {
      return NextResponse.json<CheckNgrokHealthResponse>(
        {
          isAlive: false,
          reason: 'ngrokUrl and sandboxId are required',
          tunnelStatus: 'unknown',
        },
        { status: 400 }
      )
    }

    console.log('[check-ngrok-health] Checking ngrok tunnel health:', { ngrokUrl, sandboxId, checkPort })

    let tunnelStatus: 'connected' | 'disconnected' | 'unknown' = 'unknown'
    let serverStatus: 'running' | 'stopped' | undefined = undefined

    // Step 1: Check if the ngrok URL is responding
    try {
      console.log('[check-ngrok-health] Fetching ngrok URL...')
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(ngrokUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NgrokHealthCheck/1.0)',
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const text = await response.text()
      console.log('[check-ngrok-health] Response status:', response.status)
      console.log('[check-ngrok-health] Response preview:', text.substring(0, 300))

      // Check for ngrok error patterns in the response
      const hasNgrokError = NGROK_ERROR_PATTERNS.some(pattern =>
        text.toLowerCase().includes(pattern.toLowerCase())
      )

      if (hasNgrokError) {
        console.log('[check-ngrok-health] ❌ Detected ngrok error pattern in response')
        tunnelStatus = 'disconnected'
      } else if (response.ok || response.status === 404) {
        // 200 OK or 404 (Expo might return 404 for some routes) means tunnel is working
        console.log('[check-ngrok-health] ✅ Ngrok tunnel is connected')
        tunnelStatus = 'connected'
      } else if (response.status >= 500) {
        // 5xx errors typically indicate tunnel issues
        console.log('[check-ngrok-health] ❌ Server error, tunnel may be down')
        tunnelStatus = 'disconnected'
      } else {
        tunnelStatus = 'connected'
      }
    } catch (fetchError: any) {
      console.log('[check-ngrok-health] ❌ Fetch failed:', fetchError.message)

      if (fetchError.name === 'AbortError') {
        console.log('[check-ngrok-health] Request timed out')
      }

      tunnelStatus = 'disconnected'
    }

    // Step 2: If tunnel appears down, check if the server is still running in the sandbox
    if (tunnelStatus === 'disconnected') {
      try {
        console.log('[check-ngrok-health] Checking if server is still running in sandbox...')
        const sandbox = await connectSandbox(sandboxId)

        // Check if the port is listening
        const checkPortCmd = `ss -tuln 2>/dev/null | grep -q :${checkPort} && echo "LISTENING" || echo "NOT_LISTENING"`
        const result = await sandbox.commands.run(checkPortCmd, { timeoutMs: 3000 })

        const isPortListening = result.stdout.includes('LISTENING') && !result.stdout.includes('NOT_LISTENING')
        serverStatus = isPortListening ? 'running' : 'stopped'

        console.log('[check-ngrok-health] Server status:', serverStatus)
      } catch (sandboxError) {
        console.error('[check-ngrok-health] Failed to check sandbox:', sandboxError)
        serverStatus = undefined
      }
    } else {
      // Tunnel is connected, so server must be running
      serverStatus = 'running'
    }

    const isAlive = tunnelStatus === 'connected'

    console.log('[check-ngrok-health] Final result:', { isAlive, tunnelStatus, serverStatus })

    return NextResponse.json<CheckNgrokHealthResponse>({
      isAlive,
      tunnelStatus,
      serverStatus,
      reason: !isAlive ? 'Ngrok tunnel is disconnected' : undefined,
    })
  } catch (error) {
    console.error('[check-ngrok-health] Error:', error)
    return NextResponse.json<CheckNgrokHealthResponse>(
      {
        isAlive: false,
        reason: 'Health check failed',
        tunnelStatus: 'unknown',
      },
      { status: 500 }
    )
  }
}
