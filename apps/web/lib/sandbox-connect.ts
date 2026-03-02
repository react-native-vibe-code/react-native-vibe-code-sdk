import { Sandbox } from '@e2b/code-interpreter'

/**
 * Configured sandbox timeout from environment variable.
 * This is the maximum allowed lifetime for a sandbox.
 */
export const sandboxTimeout = parseInt(
  process.env.E2B_SANDBOX_TIMEOUT_MS || '3600000',
)

/**
 * Connect to an E2B sandbox with proper timeout management.
 *
 * The E2B SDK defaults `Sandbox.connect()` to a 5-minute timeout (DEFAULT_SANDBOX_TIMEOUT_MS = 300000),
 * which RESETS the sandbox timeout on every call. If frontend health checks poll every 60 seconds,
 * each call resets the 5-minute countdown, keeping the sandbox alive indefinitely.
 *
 * This utility:
 * 1. Passes the configured timeout to prevent the 5-minute default reset
 * 2. Optionally enforces a maximum absolute lifetime by checking the sandbox's startedAt time
 *
 * When enforceMaxLifetime is true, returns null if the sandbox has exceeded its max lifetime.
 * Otherwise, always returns a valid Sandbox instance (or throws if the sandbox doesn't exist).
 */
export async function connectSandbox(
  sandboxId: string,
  opts?: { enforceMaxLifetime?: boolean },
): Promise<Sandbox | null> {
  const sandbox = await Sandbox.connect(sandboxId, {
    timeoutMs: sandboxTimeout,
  })

  if (opts?.enforceMaxLifetime) {
    try {
      const info = await sandbox.getInfo()
      const startedAt = new Date(info.startedAt).getTime()
      const elapsed = Date.now() - startedAt

      if (elapsed >= sandboxTimeout) {
        console.log(
          `[sandbox-connect] Sandbox ${sandboxId} exceeded max lifetime (${Math.round(elapsed / 60000)}min > ${Math.round(sandboxTimeout / 60000)}min). Killing.`,
        )
        await sandbox.kill()
        return null
      }

      // Correct timeout to remaining time so it doesn't extend beyond original max
      const remaining = sandboxTimeout - elapsed
      await sandbox.setTimeout(remaining)
    } catch (error) {
      console.error(
        `[sandbox-connect] Error checking sandbox lifetime for ${sandboxId}:`,
        error,
      )
    }
  }

  return sandbox
}
