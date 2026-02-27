import { Sandbox } from '@e2b/code-interpreter'
import * as fs from 'fs'
import * as path from 'path'

export const maxDuration = 60

/**
 * Resolve the path to the agent's standalone bundle.
 * Works whether process.cwd() is the monorepo root or apps/web.
 */
function resolveExecutorPath(): string {
  // Try relative to monorepo root first (turbo/pnpm dev context)
  const fromRoot = path.join(process.cwd(), 'packages/agent/dist/standalone.mjs')
  if (fs.existsSync(fromRoot)) return fromRoot

  // Try relative to apps/web (Next.js standalone context)
  const fromWeb = path.join(process.cwd(), '../../packages/agent/dist/standalone.mjs')
  if (fs.existsSync(fromWeb)) return fromWeb

  // Fallback: resolve from this file's location
  const fromFile = path.resolve(__dirname, '../../../../../../packages/agent/dist/standalone.mjs')
  return fromFile
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sandboxId: string }> }
) {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return new Response(
      JSON.stringify({ error: 'This endpoint is only available in development mode' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { sandboxId } = await params

  if (!sandboxId) {
    return new Response(
      JSON.stringify({ error: 'Sandbox ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  console.log('🔧 [Update Executor] Updating executor in sandbox:', sandboxId)

  try {
    // Read the pre-built standalone executor bundle from the agent package
    const executorPath = resolveExecutorPath()

    if (!fs.existsSync(executorPath)) {
      return new Response(
        JSON.stringify({
          error: 'Executor bundle not found. Run `pnpm build` in packages/agent first.',
          path: executorPath,
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const executorContent = fs.readFileSync(executorPath, 'utf-8')
    console.log('📄 [Update Executor] Read executor bundle, length:', executorContent.length)

    // Connect to the sandbox
    let sbx
    try {
      sbx = await Sandbox.connect(sandboxId)
      console.log('✅ [Update Executor] Connected to sandbox')
    } catch (sandboxError: any) {
      console.error('❌ [Update Executor] Failed to connect:', sandboxError)
      return new Response(
        JSON.stringify({
          error: 'Failed to connect to sandbox',
          details: sandboxError.message || String(sandboxError),
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Write the executor bundle to the sandbox
    const targetPath = '/claude-sdk/executor.mjs'
    await sbx.files.write(targetPath, executorContent)
    console.log('✅ [Update Executor] Wrote executor to', targetPath)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Executor updated successfully',
        sandboxId,
        targetPath,
        contentLength: executorContent.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('💥 [Update Executor] Error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to update executor',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
