import { NextResponse } from 'next/server'
import { getSandboxProvider } from '@react-native-vibe-code/sandbox/lib'

export async function POST(request: Request) {
  try {
    const { sandboxId } = await request.json()

    if (!sandboxId) {
      return NextResponse.json({ error: 'Sandbox ID is required' }, { status: 400 })
    }

    console.log('[check-sandbox] Checking sandbox container:', sandboxId)

    // Check if the sandbox container is alive using the active provider
    try {
      const sandbox = await getSandboxProvider().connect(sandboxId)
      console.log('[check-sandbox] Sandbox container is alive:', sandboxId)

      // Close connection if supported
      if (sandbox.close) {
        await sandbox.close().catch(() => {})
      }

      return NextResponse.json({ isAlive: true })
    } catch (error) {
      // Sandbox not found is expected behavior for paused/deleted sandboxes - use debug level
      console.debug('[check-sandbox] Sandbox container not found or dead:', sandboxId)
      return NextResponse.json({
        isAlive: false,
        reason: error instanceof Error ? error.message : 'Sandbox container not found or dead'
      })
    }
  } catch (error) {
    console.error('[check-sandbox] Error checking sandbox:', error)

    return NextResponse.json({
      isAlive: false,
      reason: 'Error verifying sandbox status'
    })
  }
}