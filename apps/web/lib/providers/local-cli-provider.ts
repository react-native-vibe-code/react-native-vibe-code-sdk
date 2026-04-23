/**
 * LocalCLIProvider
 *
 * Runs AI code generation by spawning the locally-installed `claude` CLI as a
 * subprocess, skipping the E2B cloud sandbox entirely.
 *
 * ## Transport
 *
 * Uses `claude -p "<prompt>" --output-format stream-json [options]` which:
 *   1. Sends the prompt non-interactively via the `-p` / `--print` flag.
 *   2. Streams responses as newline-delimited JSON on stdout
 *      (one JSON object per line, format: `--output-format stream-json`).
 *   3. Exits with code 0 on success, non-zero on failure.
 *
 * Each stdout line is one of:
 *   - `{"type":"system","subtype":"init","session_id":"...","tools":[...],...}`
 *   - `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."},...],...}}`
 *   - `{"type":"result","subtype":"success","cost_usd":0.0,"is_error":false,...,"result":"..."}`
 *   - `{"type":"result","subtype":"error_during_execution",...,"is_error":true}`
 *
 * ## Authentication
 *
 * Uses the user's local `~/.claude/` session. No ANTHROPIC_API_KEY required.
 * The user must have run `claude login` beforehand.
 *
 * ## Working Directory
 *
 * By default each project lives at `{LOCAL_PROJECTS_PATH}/{projectId}`.
 * The directory is created automatically on first use.
 *
 * ## Multi-turn Conversations
 *
 * The CLI flag `--resume <session-id>` resumes a previous conversation.
 * The session ID is captured from the `system/init` message and persisted
 * in the projects table (same field used by the sandboxed provider).
 */

import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type {
  AIProvider,
  ProviderCallbacks,
  ProviderCompletionResult,
  ProviderGenerationRequest,
  ProviderMode,
} from './types'

// ---------------------------------------------------------------------------
// Internal message types from `claude --output-format stream-json`
// ---------------------------------------------------------------------------

interface CLISystemMessage {
  type: 'system'
  subtype: 'init'
  session_id: string
  tools: string[]
  mcp_servers: unknown[]
}

interface CLIAssistantMessage {
  type: 'assistant'
  message: {
    id: string
    type: 'message'
    role: 'assistant'
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: unknown }
    >
    model: string
    stop_reason: string | null
    stop_sequence: string | null
    usage: { input_tokens: number; output_tokens: number }
  }
}

interface CLIResultMessage {
  type: 'result'
  subtype: 'success' | 'error_during_execution' | string
  cost_usd: number
  is_error: boolean
  duration_ms: number
  duration_api_ms: number
  session_id: string
  result: string
  total_cost?: number
  num_turns?: number
}

type CLIStreamMessage = CLISystemMessage | CLIAssistantMessage | CLIResultMessage

// ---------------------------------------------------------------------------
// LocalCLIProvider
// ---------------------------------------------------------------------------

export class LocalCLIProvider implements AIProvider {
  readonly name = 'local-cli'
  readonly mode: ProviderMode = 'local-cli'

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async generate(
    request: ProviderGenerationRequest,
    callbacks: ProviderCallbacks,
  ): Promise<void> {
    const projectDir = this.resolveProjectDir(request)

    // Ensure the project directory exists before launching the CLI
    try {
      fs.mkdirSync(projectDir, { recursive: true })
    } catch (err) {
      callbacks.onError(
        `Failed to create project directory ${projectDir}: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }

    // Write system prompt to a temp file inside the project dir so we can
    // pass it via --system-prompt-file (avoids shell escaping headaches with
    // long prompts containing quotes/backticks).
    let systemPromptFilePath: string | undefined
    try {
      const { getPromptWithCloudStatus } = await import('@react-native-vibe-code/prompt-engine')
      const systemPrompt = getPromptWithCloudStatus(false)
      systemPromptFilePath = path.join(projectDir, '.claude-system-prompt.txt')
      fs.writeFileSync(systemPromptFilePath, systemPrompt, 'utf8')
    } catch (err) {
      console.warn('[LocalCLIProvider] Could not write system prompt file:', err)
      // Non-fatal — proceed without a system prompt file
    }

    // Write skill SKILL.md files into the project's .claude/skills/ directory
    if (request.skills && request.skills.length > 0) {
      await this.writeSkillFiles(request.skills, projectDir)
    }

    const args = this.buildArgs(request, systemPromptFilePath)

    console.log('[LocalCLIProvider] Spawning claude CLI:', {
      cwd: projectDir,
      args: args.map((a, i) => (i === 1 ? a.substring(0, 80) + '...' : a)), // truncate prompt in logs
      sessionId: request.sessionId || 'new session',
    })

    return new Promise<void>((resolve) => {
      let capturedSessionId: string | null = null
      let lineBuffer = ''
      let completionResult: ProviderCompletionResult | null = null
      let hasResolved = false

      const done = (result: ProviderCompletionResult | null, error?: string) => {
        if (hasResolved) return
        hasResolved = true
        if (systemPromptFilePath) {
          try {
            fs.unlinkSync(systemPromptFilePath!)
          } catch {
            // Best-effort cleanup
          }
        }
        if (error) {
          callbacks.onError(error)
        } else {
          callbacks.onComplete(
            result ?? {
              success: true,
              conversationId: capturedSessionId || undefined,
              summary: 'Task completed via local Claude CLI',
              previewUrl: 'http://localhost:8081',
            },
          )
        }
        resolve()
      }

      const proc = spawn('claude', args, {
        cwd: projectDir,
        // Inherit env so the CLI can locate ~/.claude/
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      // -----------------------------------------------------------------------
      // stdout — parse newline-delimited JSON from --output-format stream-json
      // -----------------------------------------------------------------------
      proc.stdout.on('data', (chunk: Buffer) => {
        lineBuffer += chunk.toString('utf8')
        const lines = lineBuffer.split('\n')
        // Keep the last (potentially incomplete) line in the buffer
        lineBuffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          let msg: CLIStreamMessage
          try {
            msg = JSON.parse(trimmed) as CLIStreamMessage
          } catch {
            // Not valid JSON — forward as plain text (may be CLI warnings, etc.)
            callbacks.onMessage(trimmed)
            continue
          }

          this.handleStreamMessage(
            msg,
            callbacks,
            (sid) => {
              capturedSessionId = sid
            },
            (result) => {
              completionResult = result
            },
          )
        }
      })

      // -----------------------------------------------------------------------
      // stderr — log locally, forward as error message to UI
      // -----------------------------------------------------------------------
      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8').trim()
        if (text) {
          console.error('[LocalCLIProvider] stderr:', text)
          // Don't surface every stderr line to the user — many are benign debug
          // lines printed by the CLI itself. Only surface lines that look like
          // real errors.
          if (
            text.toLowerCase().includes('error') ||
            text.toLowerCase().includes('failed') ||
            text.toLowerCase().includes('not found')
          ) {
            callbacks.onMessage(`⚠️ ${text}`)
          }
        }
      })

      // -----------------------------------------------------------------------
      // Process exit
      // -----------------------------------------------------------------------
      proc.on('close', (code) => {
        // Flush any remaining buffered content
        if (lineBuffer.trim()) {
          try {
            const msg = JSON.parse(lineBuffer.trim()) as CLIStreamMessage
            this.handleStreamMessage(msg, callbacks, (sid) => { capturedSessionId = sid }, (r) => { completionResult = r })
          } catch {
            callbacks.onMessage(lineBuffer.trim())
          }
        }

        if (code !== 0 && !completionResult) {
          done(null, `Claude CLI exited with code ${code}. Is 'claude' installed and authenticated? Run 'claude login' to set up.`)
          return
        }

        done(completionResult ?? {
          success: code === 0,
          conversationId: capturedSessionId || undefined,
          summary: 'Task completed via local Claude CLI',
          previewUrl: 'http://localhost:8081',
        })
      })

      proc.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          done(
            null,
            'Claude CLI not found. Install it from https://claude.ai/download and run "claude login" to authenticate.',
          )
        } else {
          done(null, `Failed to spawn Claude CLI: ${err.message}`)
        }
      })
    })
  }

  /**
   * Returns true if the `claude` binary is on the PATH and exits cleanly.
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('claude', ['--version'], { stdio: 'ignore' })
      proc.on('close', (code) => resolve(code === 0))
      proc.on('error', () => resolve(false))
    })
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Builds the argument list for the `claude` CLI subprocess.
   *
   * Key flags used:
   *   -p / --print             Non-interactive mode; sends prompt and exits.
   *   --output-format stream-json  Emit one JSON object per line as it streams.
   *   --system-prompt-file     Load system prompt from a file.
   *   --model                  Override the model.
   *   --resume                 Resume a specific conversation by session ID.
   *   --allowedTools           Grant tool access without interactive prompt.
   */
  private buildArgs(
    request: ProviderGenerationRequest,
    systemPromptFilePath?: string,
  ): string[] {
    // Build user message, appending context as the sandboxed provider does
    let message = request.userMessage
    message += '\n\nCurrent working directory: .'
    if (request.selectionData?.elementId) {
      message += `\nSelected element: ${request.selectionData.elementId}`
    }

    const args: string[] = [
      '-p', message,
      '--output-format', 'stream-json',
      // Allow all tools without interactive permission prompts.
      // This mirrors the sandboxed provider's `permissionMode: 'bypassPermissions'`.
      '--allowedTools', 'all',
    ]

    if (systemPromptFilePath) {
      args.push('--system-prompt-file', systemPromptFilePath)
    }

    if (request.claudeModel) {
      args.push('--model', request.claudeModel)
    }

    if (request.sessionId) {
      // --resume continues a specific session; falls back to --continue for the
      // most recent session if no explicit ID is provided.
      args.push('--resume', request.sessionId)
    }

    return args
  }

  /**
   * Dispatches a parsed CLI stream-json message to the appropriate callback.
   */
  private handleStreamMessage(
    msg: CLIStreamMessage,
    callbacks: ProviderCallbacks,
    onSessionId: (id: string) => void,
    onResult: (result: ProviderCompletionResult) => void,
  ): void {
    switch (msg.type) {
      case 'system': {
        // Capture session ID for multi-turn resumption
        const sysMsg = msg as CLISystemMessage
        if (sysMsg.session_id) {
          onSessionId(sysMsg.session_id)
          console.log('[LocalCLIProvider] Session ID captured:', sysMsg.session_id)
        }
        // Forward the raw system message so the frontend can handle it the same
        // way it handles system messages from the sandboxed provider
        callbacks.onMessage(JSON.stringify(msg))
        break
      }

      case 'assistant': {
        const assistMsg = msg as CLIAssistantMessage
        for (const block of assistMsg.message?.content ?? []) {
          if (block.type === 'text') {
            // Forward plain text content directly — matches what the sandboxed
            // provider does when it sends parsed text messages
            callbacks.onMessage(JSON.stringify({ type: 'text', text: block.text }))
          } else if (block.type === 'tool_use') {
            // Forward tool use blocks so the frontend can render them
            callbacks.onMessage(
              JSON.stringify({
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: block.input,
              }),
            )
          }
        }
        break
      }

      case 'result': {
        const resultMsg = msg as CLIResultMessage
        const isError = resultMsg.is_error || resultMsg.subtype !== 'success'

        if (isError) {
          console.error('[LocalCLIProvider] CLI reported error result:', resultMsg.result)
          // Don't call onError here — let the process exit handler do it so we
          // don't call done() twice if there's both a result message and a non-0
          // exit code.
        }

        onResult({
          success: !isError,
          conversationId: resultMsg.session_id || undefined,
          summary: isError
            ? `Error: ${resultMsg.result}`
            : resultMsg.result || 'Task completed via local Claude CLI',
          previewUrl: 'http://localhost:8081',
        })

        // Also update session ID from result message (may be the only place it appears)
        if (resultMsg.session_id) {
          onSessionId(resultMsg.session_id)
        }
        break
      }

      default:
        // Forward unknown message types as raw JSON for future compatibility
        callbacks.onMessage(JSON.stringify(msg))
    }
  }

  /**
   * Resolves the working directory for this project in local mode.
   *
   * Priority:
   *   1. `request.localProjectPath` if explicitly set
   *   2. `{LOCAL_PROJECTS_PATH}/{projectId}` where LOCAL_PROJECTS_PATH defaults
   *      to `~/local-projects` (relative to the user's home directory)
   */
  private resolveProjectDir(request: ProviderGenerationRequest): string {
    if (request.localProjectPath) {
      return request.localProjectPath
    }

    const baseDir =
      process.env.LOCAL_PROJECTS_PATH ||
      path.join(os.homedir(), 'local-projects')

    return path.join(baseDir, request.projectId)
  }

  /**
   * Writes skill SKILL.md files to `.claude/skills/{skillId}/SKILL.md` inside
   * the local project directory (mirrors what the sandboxed handler writes into
   * the E2B sandbox).
   */
  private async writeSkillFiles(
    skillIds: string[],
    projectDir: string,
  ): Promise<void> {
    const { getSkillTemplate, getSkillFilePath } = await import('@/lib/skills/templates')
    const prodUrl = process.env.NEXT_PUBLIC_PROD_URL || 'https://capsulethis.com'

    for (const skillId of skillIds) {
      const content = getSkillTemplate(skillId, prodUrl)
      if (!content) {
        console.warn(`[LocalCLIProvider] No template found for skill: ${skillId}`)
        continue
      }

      // getSkillFilePath returns an absolute sandbox path like /home/user/app/.claude/...
      // We strip that and build a local path relative to projectDir instead.
      const relativePath = getSkillFilePath(skillId)
        .replace(/^\/home\/user\/app\//, '')
        .replace(/^\//, '')

      const fullPath = path.join(projectDir, relativePath)
      try {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, content, 'utf8')
        console.log(`[LocalCLIProvider] Wrote skill file: ${fullPath}`)
      } catch (err) {
        console.error(`[LocalCLIProvider] Failed to write skill ${skillId}:`, err)
      }
    }
  }
}
