import { NextResponse } from 'next/server'
import { connectSandbox } from '@/lib/sandbox-connect'

export async function POST(request: Request) {
  try {
    const { sandboxId } = await request.json()

    if (!sandboxId) {
      return NextResponse.json({ error: 'Sandbox ID is required' }, { status: 400 })
    }

    console.log('[check-sandbox] Checking sandbox container:', sandboxId)

    // Check if the sandbox container is alive using E2B SDK
    // enforceMaxLifetime: true ensures sandboxes are killed after the configured max duration,
    // preventing health check polling from keeping sandboxes alive indefinitely
    try {
      const sandbox = await connectSandbox(sandboxId, { enforceMaxLifetime: true })

      if (!sandbox) {
        console.log('[check-sandbox] Sandbox exceeded max lifetime:', sandboxId)
        return NextResponse.json({
          isAlive: false,
          reason: 'Sandbox exceeded maximum lifetime'
        })
      }

      console.log('[check-sandbox] Sandbox container is alive:', sandboxId)

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
