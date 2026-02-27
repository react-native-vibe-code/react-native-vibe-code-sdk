import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

/**
 * Slim message types streamed from the executor.
 * These are small (<1KB) so they never span multiple stdout chunks,
 * eliminating the need for fragile JSON reassembly on the receiving end.
 */

export interface SlimSystemInit {
  type: 'system'
  subtype: 'init'
  model: string
  cwd: string
  tools: string[]
  session_id: string
}

export interface SlimAssistantText {
  type: 'assistant'
  subtype: 'text'
  text: string
}

export interface SlimToolUse {
  type: 'assistant'
  subtype: 'tool_use'
  tool_name: string
  file_path?: string
  pattern?: string
  command_preview?: string
  // Full input preserved only for TodoWrite
  input?: any
}

export interface SlimToolResult {
  type: 'user'
  subtype: 'tool_result'
  success: boolean
}

export interface SlimToolProgress {
  type: 'tool_progress'
  [key: string]: any
}

export interface SlimResult {
  type: 'result'
  subtype: string
  is_error: boolean
  duration_ms?: number
  total_cost_usd?: number
  result?: string
  session_id?: string
}

export type SlimMessage =
  | SlimSystemInit
  | SlimAssistantText
  | SlimToolUse
  | SlimToolResult
  | SlimToolProgress
  | SlimResult

/**
 * Transforms a full SDK message into one or more slim messages for streaming.
 * Returns an array of slim messages, or an empty array to skip the message entirely.
 */
export function slimifyMessage(message: SDKMessage): SlimMessage[] {
  switch (message.type) {
    case 'system': {
      if (message.subtype === 'init') {
        return [{
          type: 'system',
          subtype: 'init',
          model: (message as any).model ?? '',
          cwd: (message as any).cwd ?? '',
          tools: (message as any).tools ?? [],
          session_id: (message as any).session_id ?? '',
        }]
      }
      return []
    }

    case 'assistant': {
      const msg = message as any
      const contentBlocks: any[] = msg.message?.content ?? msg.content ?? []
      const results: SlimMessage[] = []

      for (const block of contentBlocks) {
        if (block.type === 'text' && block.text) {
          results.push({
            type: 'assistant',
            subtype: 'text',
            text: block.text,
          })
        } else if (block.type === 'tool_use') {
          const toolName: string = block.name ?? ''
          const input = block.input ?? {}

          // TodoWrite: keep full input
          if (toolName === 'TodoWrite') {
            results.push({
              type: 'assistant',
              subtype: 'tool_use',
              tool_name: toolName,
              input,
            })
            continue
          }

          const slim: SlimToolUse = {
            type: 'assistant',
            subtype: 'tool_use',
            tool_name: toolName,
          }

          // Extract headline info per tool
          if (toolName === 'Write' || toolName === 'Edit' || toolName === 'Read') {
            slim.file_path = input.file_path ?? undefined
          } else if (toolName === 'Glob') {
            slim.pattern = input.pattern ?? undefined
          } else if (toolName === 'Grep') {
            slim.pattern = input.pattern ?? undefined
          } else if (toolName === 'Bash') {
            const cmd = input.command ?? input.description ?? ''
            slim.command_preview = typeof cmd === 'string' ? cmd.slice(0, 100) : ''
          }

          results.push(slim)
        }
      }

      return results
    }

    case 'user': {
      // Tool results — headline only
      const msg = message as any
      const contentBlocks: any[] = msg.message?.content ?? msg.content ?? []
      let success = true

      for (const block of contentBlocks) {
        if (block.is_error || block.type === 'tool_result' && block.is_error) {
          success = false
          break
        }
        // Check string content for error indicators
        if (typeof block.content === 'string' && block.content.startsWith('Error:')) {
          success = false
          break
        }
      }

      return [{
        type: 'user',
        subtype: 'tool_result',
        success,
      }]
    }

    case 'tool_progress': {
      // Already small — pass through
      return [message as any as SlimToolProgress]
    }

    case 'result': {
      const msg = message as any
      const slim: SlimResult = {
        type: 'result',
        subtype: msg.subtype ?? 'unknown',
        is_error: msg.is_error ?? msg.subtype !== 'success',
        duration_ms: msg.duration_ms,
        total_cost_usd: msg.total_cost_usd,
        session_id: msg.session_id,
      }

      // Include result text (usually small)
      if (typeof msg.result === 'string') {
        slim.result = msg.result
      }

      return [slim]
    }

    // Skip these message types entirely — not used by frontend
    case 'stream_event' as any:
    case 'compact_boundary' as any:
    case 'hook_response' as any:
    case 'auth_status' as any:
    case 'status' as any:
      return []

    default:
      return []
  }
}
