import { NextResponse } from 'next/server'
import { connectSandbox } from '@/lib/sandbox-connect'

export async function POST(request: Request) {
  try {
    const { url, sandboxId } = await request.json()

    if (!url && !sandboxId) {
      return NextResponse.json({ error: 'Either URL or sandboxId is required' }, { status: 400 })
    }

    console.log('[check-expo-server] Checking Expo server:', { url, sandboxId })

    // NEW APPROACH: If sandboxId provided, check directly in the sandbox
    if (sandboxId) {
      try {
        console.log('[check-expo-server] Connecting to sandbox:', sandboxId)
        const sandbox = await connectSandbox(sandboxId)
        if (!sandbox) throw new Error('Sandbox expired')

        // Check if port 8081 is listening using netstat or ss
        // We use 'ss' (socket statistics) which is more modern and reliable
        const checkPortCmd = 'ss -tuln 2>/dev/null | grep -q :8081 && echo "LISTENING" || echo "NOT_LISTENING"'
        console.log('[check-expo-server] Running port check command in sandbox...')

        const result = await sandbox.commands.run(checkPortCmd, {
          timeoutMs: 1500
        })

        console.log('[check-expo-server] Port check result:', {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr
        })

        // Check if output indicates port is listening
        const isPortOpen = result.stdout.includes('LISTENING') && !result.stdout.includes('NOT_LISTENING')

        if (!isPortOpen) {
          console.log('[check-expo-server] ❌ Port 8081 is NOT listening in sandbox')
          return NextResponse.json({
            isAlive: false,
            reason: 'Port 8081 not listening'
          })
        }

        console.log('[check-expo-server] ✅ Port 8081 is LISTENING in sandbox')

        // Port is listening - the server is alive!
        // Skip the slow HTTP check through ngrok - port check is faster and more reliable
        return NextResponse.json({ isAlive: true })
      } catch (sandboxError) {
        console.error('[check-expo-server] Error checking sandbox port:', sandboxError)
        // Fall back to HTTP check if sandbox check fails
        if (!url) {
          return NextResponse.json({
            isAlive: false,
            reason: 'Sandbox check failed and no URL provided'
          })
        }
      }
    }

    // FALLBACK: HTTP check (legacy approach)
    if (url) {
      console.log('[check-expo-server] Falling back to HTTP check at:', url)

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ExpoHealthCheck/1.0)',
        },
        signal: AbortSignal.timeout(3000),
      })

      const text = await response.text()
      console.log('[check-expo-server] Response status:', response.status)
      console.log('[check-expo-server] Response text preview:', text.substring(0, 200))

      if (!response.ok) {
        console.log('[check-expo-server] ❌ Non-OK status:', response.status)
        return NextResponse.json({
          isAlive: false,
          reason: `HTTP ${response.status}`
        })
      }

      // Check for specific error patterns in the response
      const errorPatterns = [
        'Closed Port Error',
        'Connection refused on port',
        'no service running on port',
        'ERR_NGROK',
        'ngrok error',
        'Tunnel not found',
        'failed to complete tunnel connection'
      ]

      const hasErrorPattern = errorPatterns.some(pattern => text.includes(pattern))
      if (hasErrorPattern) {
        console.log('[check-expo-server] ❌ Detected error pattern in response')
        return NextResponse.json({
          isAlive: false,
          reason: 'Error pattern detected in response'
        })
      }

      // If we get a 200 OK response, the server is alive
      // Note: Expo Web serves HTML pages - this is normal and expected!
      // The old logic incorrectly treated ALL HTML as error pages
      const isHtml = text.trim().startsWith('<!DOCTYPE html>') || text.trim().startsWith('<html')
      if (isHtml) {
        console.log('[check-expo-server] ✅ Expo web server responding with HTML (this is normal)')
      } else {
        console.log('[check-expo-server] ✅ Expo server responding via HTTP')
      }

      return NextResponse.json({ isAlive: true })
    }

    return NextResponse.json({
      isAlive: false,
      reason: 'No check method available'
    })
  } catch (error) {
    console.error('[check-expo-server] Error:', error)
    return NextResponse.json({
      isAlive: false,
      reason: 'Check failed'
    })
  }
}
