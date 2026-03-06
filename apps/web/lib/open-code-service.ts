/**
 * OpenCode Service — mirrors ClaudeCodeService but communicates with
 * OpenCode's HTTP server + SSE event stream running inside the E2B sandbox.
 *
 * OpenCode runs as `opencode serve --port 4096` and exposes:
 *   POST /session                  — create session
 *   POST /session/:id/prompt_async — send message (async, returns 204)
 *   POST /session/:id/message      — send message (sync, blocks until done)
 *   GET  /global/event              — global SSE event stream
 *   GET  /global/health            — health check
 */

import { Sandbox } from '@e2b/code-interpreter'
import { getPromptWithCloudStatus } from '@react-native-vibe-code/prompt-engine'
import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'
import { translateOpenCodeEvent, parseSSELine } from './open-code-events'
import type { AppGenerationRequest, AppGenerationResponse, StreamingCallbacks } from './claude-code-service'

const OPENCODE_PORT = 4096

/** Converts 'anthropic/claude-opus-4-5' to { providerID: 'anthropic', modelID: 'claude-opus-4-5' } */
function parseModelId(modelStr?: string): { providerID: string; modelID: string } {
  const m = modelStr || 'anthropic/claude-opus-4-5'
  const slashIdx = m.indexOf('/')
  if (slashIdx > 0) {
    return { providerID: m.slice(0, slashIdx), modelID: m.slice(slashIdx + 1) }
  }
  return { providerID: 'anthropic', modelID: m }
}
const HEALTH_POLL_INTERVAL = 1000
const HEALTH_TIMEOUT = 60_000
const SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes

export class OpenCodeService {
  /**
   * Writes the opencode.json config to the sandbox and starts
   * `opencode serve` if it isn't already running.
   */
  async ensureServerRunning(sandbox: Sandbox, model?: string): Promise<string> {
    // Get the host URL for port forwarding
    const host = sandbox.getHost(OPENCODE_PORT)
    const baseUrl = `https://${host}`

    // Check if server is already running
    const isRunning = await this.checkHealth(baseUrl)
    if (isRunning) {
      console.log('[OpenCode Service] Server already running at', baseUrl)
      return baseUrl
    }

    console.log('[OpenCode Service] Starting OpenCode server...')

    // Resolve the opencode binary path — it may not be in the default PATH
    const opencodeBin = await this.resolveOpenCodeBinary(sandbox)
    console.log('[OpenCode Service] Using opencode binary at:', opencodeBin)

    // Write opencode config
    // Note: OpenCode auto-detects ANTHROPIC_API_KEY from env vars,
    // but we also set it explicitly in the provider options for reliability.
    const config = {
      $schema: 'https://opencode.ai/config.json',
      provider: {
        anthropic: {
          options: {
            apiKey: process.env.ANTHROPIC_API_KEY || '',
          },
        },
      },
      model: model || 'anthropic/claude-opus-4-5',
      permission: { '*': 'allow' },
      server: { port: OPENCODE_PORT, hostname: '0.0.0.0' },
    }

    await sandbox.files.write('/home/user/opencode.json', JSON.stringify(config, null, 2))
    console.log('[OpenCode Service] Config written to /home/user/opencode.json')

    // Ensure git is configured in the app directory (same setup as Claude Agent SDK)
    try {
      await sandbox.commands.run(
        `cd /home/user/app && git config user.name "E2B Sandbox" && git config user.email "sandbox@e2b.dev"`,
        { timeoutMs: 5_000 },
      )
      // Initialize git if not already done (e.g. sandbox was recreated without full init)
      const gitCheck = await sandbox.commands.run(
        'cd /home/user/app && git rev-parse --is-inside-work-tree 2>/dev/null',
        { timeoutMs: 5_000 },
      )
      if (gitCheck.exitCode !== 0) {
        console.log('[OpenCode Service] Git not initialized in /home/user/app, initializing...')
        await sandbox.commands.run(
          'cd /home/user/app && git init && git add . && git commit -m "Initial commit" --allow-empty',
          { timeoutMs: 15_000 },
        )
      }
      console.log('[OpenCode Service] Git configured in /home/user/app')
    } catch (e) {
      console.warn('[OpenCode Service] Failed to configure git:', e)
    }

    // Start opencode serve in the app directory (where the git repo lives)
    await sandbox.commands.run(
      `cd /home/user/app && OPENCODE_CONFIG=/home/user/opencode.json ANTHROPIC_API_KEY="${process.env.ANTHROPIC_API_KEY || ''}" ${opencodeBin} serve --port ${OPENCODE_PORT} > /tmp/opencode.log 2>&1 &`,
      {
        background: true as const,
        timeoutMs: 10_000,
        envs: {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
          OPENCODE_CONFIG: '/home/user/opencode.json',
        },
      },
    )

    // Poll health endpoint until ready
    const startTime = Date.now()
    while (Date.now() - startTime < HEALTH_TIMEOUT) {
      await new Promise(resolve => setTimeout(resolve, HEALTH_POLL_INTERVAL))
      const ready = await this.checkHealth(baseUrl)
      if (ready) {
        console.log(`[OpenCode Service] Server ready after ${Date.now() - startTime}ms`)
        return baseUrl
      }
    }

    // Grab logs to help debug the failure
    try {
      const logResult = await sandbox.commands.run('cat /tmp/opencode.log 2>/dev/null || echo "No log file found"', { timeoutMs: 5_000 })
      console.error('[OpenCode Service] Server startup logs:', logResult.stdout)
    } catch { /* ignore */ }

    throw new Error(`OpenCode server failed to start within ${HEALTH_TIMEOUT / 1000}s`)
  }

  /**
   * Finds the opencode binary in the sandbox, installing it if necessary.
   * The Dockerfile installs as root so the binary may be in /root/.local/bin
   * which isn't on the user's PATH.
   */
  private async resolveOpenCodeBinary(sandbox: Sandbox): Promise<string> {
    // Common locations where opencode might be installed
    const candidates = [
      'opencode',                        // already in PATH
      '/root/.local/bin/opencode',       // installed by install.sh as root
      '/usr/local/bin/opencode',         // global install
      '/home/user/.local/bin/opencode',  // installed as user
    ]

    for (const bin of candidates) {
      try {
        const result = await sandbox.commands.run(`${bin} version`, { timeoutMs: 5_000 })
        if (result.exitCode === 0) {
          console.log(`[OpenCode Service] Found opencode at: ${bin} (${result.stdout.trim()})`)
          return bin
        }
      } catch {
        // try next candidate
      }
    }

    // Not found — install it at runtime
    console.log('[OpenCode Service] opencode not found in sandbox, installing...')
    try {
      // Try npm global install first (most reliable in the sandbox environment)
      const installResult = await sandbox.commands.run(
        'npm i -g opencode-ai@latest 2>&1 || bun install -g opencode-ai@latest 2>&1',
        { timeoutMs: 120_000 },
      )
      console.log('[OpenCode Service] Install output:', installResult.stdout)
      if (installResult.stderr) {
        console.log('[OpenCode Service] Install stderr:', installResult.stderr)
      }

      // After install, check the common paths again
      for (const bin of ['opencode', '/usr/local/bin/opencode', '/root/.local/bin/opencode', '/home/user/.local/bin/opencode']) {
        try {
          const result = await sandbox.commands.run(`${bin} version`, { timeoutMs: 5_000 })
          if (result.exitCode === 0) {
            console.log(`[OpenCode Service] After install, found opencode at: ${bin}`)
            return bin
          }
        } catch {
          // try next
        }
      }

      // Fallback: try curl installer (note: no .sh suffix)
      console.log('[OpenCode Service] npm install did not work, trying curl installer...')
      const curlResult = await sandbox.commands.run(
        'curl -fsSL https://opencode.ai/install | bash 2>&1',
        { timeoutMs: 60_000 },
      )
      console.log('[OpenCode Service] Curl install output:', curlResult.stdout)

      for (const bin of ['opencode', '/usr/local/bin/opencode', '/root/.local/bin/opencode', '/home/user/.local/bin/opencode']) {
        try {
          const result = await sandbox.commands.run(`${bin} version`, { timeoutMs: 5_000 })
          if (result.exitCode === 0) {
            console.log(`[OpenCode Service] After curl install, found opencode at: ${bin}`)
            return bin
          }
        } catch {
          // try next
        }
      }
    } catch (error) {
      console.error('[OpenCode Service] Failed to install opencode:', error)
    }

    // Last resort — return bare name and let it fail with a clear error
    console.error('[OpenCode Service] Could not find or install opencode binary')
    return 'opencode'
  }

  private async checkHealth(baseUrl: string): Promise<boolean> {
    try {
      const resp = await fetch(`${baseUrl}/global/health`, {
        signal: AbortSignal.timeout(3000),
      })
      return resp.ok
    } catch {
      // Fallback: try legacy /health endpoint
      try {
        const resp = await fetch(`${baseUrl}/health`, {
          signal: AbortSignal.timeout(3000),
        })
        return resp.ok
      } catch {
        return false
      }
    }
  }

  /**
   * Main streaming method — mirrors ClaudeCodeService.generateAppStreaming()
   *
   * Flow:
   * 1. Create session via POST /session
   * 2. Inject system prompt via POST /session/:id/message (sync, noReply)
   * 3. Subscribe to global SSE stream at GET /event
   * 4. Send user message via POST /session/:id/prompt_async (returns 204)
   * 5. Process SSE events until message.completed is received
   */
  async generateAppStreaming(
    request: AppGenerationRequest,
    sandbox: Sandbox,
    callbacks: StreamingCallbacks,
  ): Promise<void> {
    try {
      // Write AGENTS.md to the sandbox before starting the server.
      // OpenCode auto-reads this file from the working directory.
      let cloudEnabled = false
      try {
        const [project] = await db
          .select({ convexProject: projects.convexProject })
          .from(projects)
          .where(eq(projects.id, request.projectId))
          .limit(1)
        cloudEnabled = (project?.convexProject as any)?.kind === 'connected'
      } catch (e) {
        console.error('[OpenCode Service] Failed to check cloud status:', e)
      }

      const systemPrompt = getPromptWithCloudStatus(cloudEnabled)
      await sandbox.files.write('/home/user/app/AGENTS.md', systemPrompt)
      console.log('[OpenCode Service] AGENTS.md written to sandbox')

      const baseUrl = await this.ensureServerRunning(sandbox, request.claudeModel)
      console.log('[OpenCode Service] Server URL:', baseUrl)

      // Build the user message with context (same as ClaudeCodeService)
      let fullMessage = request.userMessage
      fullMessage += '\n\nCurrent working directory: /home/user/app'

      // Include visual edit selection context
      if (request.selectionData) {
        const sel = request.selectionData
        fullMessage += '\n\n--- VISUAL EDIT SELECTION ---'
        if (sel.elementId && sel.elementId !== 'No ID') {
          fullMessage += `\nElement ID (file reference): ${sel.elementId}`
        }
        if (request.fileEdition) {
          fullMessage += `\nFile to edit: ${request.fileEdition}`
        }
        if (sel.tagName) fullMessage += `\nElement type: <${sel.tagName}>`
        if (sel.content && sel.content !== 'No content') fullMessage += `\nElement content: "${sel.content}"`
        if (sel.className && sel.className !== 'No class') fullMessage += `\nCSS classes: ${sel.className}`
        if (sel.dataAt) fullMessage += `\nSource location (data-at): ${sel.dataAt}`
        if (sel.dataIn) fullMessage += `\nComponent (data-in): ${sel.dataIn}`
        if (sel.path) fullMessage += `\nDOM path: ${sel.path}`
        fullMessage += '\n\nThe user selected this element visually. Make changes to this specific element in the referenced file and location above.'
        fullMessage += '\n--- END VISUAL EDIT SELECTION ---'
      }

      let sessionId = request.sessionId

      // Create or resume session
      if (!sessionId) {
        console.log('[OpenCode Service] Creating new session...')
        const createResp = await fetch(`${baseUrl}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(10_000),
        })

        if (!createResp.ok) {
          throw new Error(`Failed to create OpenCode session: ${createResp.status} ${await createResp.text()}`)
        }

        const sessionData = await createResp.json()
        sessionId = sessionData.id || sessionData.sessionId
        console.log('[OpenCode Service] Session created:', sessionId)
      }

      // Emit init message (no prefix — raw JSON for the UI parser)
      callbacks.onMessage(JSON.stringify({
        type: 'system',
        subtype: 'init',
        model: request.claudeModel || 'anthropic/claude-opus-4-5',
        cwd: '/home/user/app',
        tools: [],
        session_id: sessionId,
      }))

      // Subscribe to global SSE events BEFORE sending the message
      const abortController = new AbortController()
      const timeout = setTimeout(() => abortController.abort(), SESSION_TIMEOUT)

      let completionDetected = false
      let capturedSessionId = sessionId

      const ssePromise = this.consumeSSEStream(
        `${baseUrl}/global/event`,
        abortController.signal,
        sessionId!,
        (event) => {
          const slimMessages = translateOpenCodeEvent(event)
          for (const msg of slimMessages) {
            if (msg.type === 'result') {
              completionDetected = true
              capturedSessionId = (msg as any).session_id || capturedSessionId
              // Abort SSE stream since we got the completion
              abortController.abort()
            }
            // Emit raw JSON (no prefix) so the UI parser can split by newlines
            callbacks.onMessage(JSON.stringify(msg))
          }
        },
        () => {
          if (!completionDetected) {
            completionDetected = true
          }
        },
      )

      // Send the actual user message ASYNC (returns 204 immediately)
      console.log('[OpenCode Service] Sending user message (async)...')
      const messageResp = await fetch(`${baseUrl}/session/${sessionId}/prompt_async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: [{ type: 'text', text: fullMessage }],
          model: parseModelId(request.claudeModel),
        }),
        signal: AbortSignal.timeout(30_000),
      })

      if (!messageResp.ok && messageResp.status !== 204) {
        const errText = await messageResp.text().catch(() => 'unknown error')
        throw new Error(`Failed to send message: ${messageResp.status} ${errText}`)
      }
      console.log('[OpenCode Service] Message sent, status:', messageResp.status)

      // Wait for SSE to finish (agent done processing, signaled by session.idle)
      await ssePromise
      clearTimeout(timeout)

      console.log('[OpenCode Service] Generation complete', {
        completionDetected,
        sessionId: capturedSessionId,
      })

      const response: AppGenerationResponse = {
        filesModified: [],
        success: true,
        summary: 'Task completed successfully',
        conversationId: capturedSessionId || undefined,
      }

      await callbacks.onComplete(response)

      // Trigger GitHub commit (fire and forget)
      this.triggerGitHubCommit(
        sandbox.sandboxId,
        request.projectId,
        request.userMessage,
        request.messageId,
        false,
      )
    } catch (error) {
      console.error('[OpenCode Service] Error:', error)
      await callbacks.onError(
        error instanceof Error ? error.message : 'OpenCode execution failed',
      )
    }
  }

  /**
   * Consumes the global SSE stream, filtering events for our session.
   */
  private async consumeSSEStream(
    url: string,
    signal: AbortSignal,
    sessionId: string,
    onEvent: (event: any) => void,
    onEnd: () => void,
  ): Promise<void> {
    try {
      const resp = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
        signal,
      })

      if (!resp.ok || !resp.body) {
        console.error('[OpenCode Service] SSE connection failed:', resp.status)
        onEnd()
        return
      }

      console.log('[OpenCode Service] SSE stream connected')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const event = parseSSELine(line)
          if (event) {
            // Log all non-heartbeat events for debugging
            if (event.type !== 'server.heartbeat') {
              console.log('[OpenCode Service] SSE event:', event.type, JSON.stringify(event).slice(0, 200))
            }

            // Filter: only process events for our session
            const eventSessionId =
              event.properties?.sessionID ??
              event.properties?.sessionId ??
              event.properties?.session_id ??
              event.sessionID ??
              event.sessionId

            if (eventSessionId && eventSessionId !== sessionId) {
              continue
            }

            onEvent(event)
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const event = parseSSELine(buffer)
        if (event) onEvent(event)
      }
    } catch (error) {
      if (signal.aborted) {
        console.log('[OpenCode Service] SSE stream ended (completion detected)')
      } else {
        console.error('[OpenCode Service] SSE stream error:', error)
      }
    } finally {
      onEnd()
    }
  }

  private triggerGitHubCommit(
    sandboxId: string,
    projectId: string,
    userMessage: string,
    messageId?: string,
    executionFailed: boolean = false,
  ): void {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3210'

    fetch(`${baseUrl}/api/github-commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sandboxId,
        projectId,
        userMessage,
        messageId,
        executionFailed,
      }),
    })
      .then(() => console.log('[OpenCode Service] GitHub commit triggered'))
      .catch((error) => console.error('[OpenCode Service] GitHub commit failed:', error))
  }
}
