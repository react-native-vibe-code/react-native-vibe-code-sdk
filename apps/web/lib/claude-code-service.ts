import { pusherServer } from './pusher'
import { Sandbox} from '@e2b/code-interpreter'
import { prompt, getPromptWithCloudStatus } from '@react-native-vibe-code/prompt-engine'
import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'
import { ErrorTracker } from './error-tracker'

export interface ConversationContext {
  projectId: string
  userId: string
  conversationId?: string
  previousMessages: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
  }>
}

export interface AppGenerationRequest {
  userMessage: string
  messageId?: string
  projectId: string
  userId: string
  isFirstMessage?: boolean
  images?: string[]
  imageAttachments?: Array<{ url: string; contentType: string; name: string; size: number }>
  fileEdition?: string
  selectionData?: any
  sessionId?: string  // Claude SDK session ID for resumption
  claudeModel?: string  // Model ID for Claude (e.g., claude-sonnet-4-5-20250929)
  skills?: string[]  // Selected AI skills (e.g., 'anthropic-chat', 'openai-dalle-3')
}

export interface AppGenerationResponse {
  success: boolean
  conversationId?: string
  filesModified: Array<{
    path: string
    action: 'created' | 'modified' | 'deleted'
    content?: string
  }>
  summary: string
  error?: string
}

export interface StreamingCallbacks {
  onMessage: (message: string) => void
  onComplete: (result: AppGenerationResponse) => void
  onError: (error: string) => void
}

export class ClaudeCodeService {
  private conversationCache: Map<string, string> = new Map()

  constructor() {
    // No initialization needed - GitHub commits handled via separate API
  }

  async generateAppStreaming(
    request: AppGenerationRequest,
    sandbox: Sandbox,
    callbacks: StreamingCallbacks,
  ): Promise<void> {
    try {
      // Get conversation context
      const context = await this.getConversationContext(request, sandbox)

      // Build the user message with context and skill testing instructions
      let fullMessage = request.userMessage
      fullMessage += '\n\nCurrent working directory: /home/user'
      if (request.selectionData?.elementId) {
        fullMessage += `\nSelected element: ${request.selectionData.elementId}`
      }

      // If skills are selected, append testing instructions to the prompt
      if (request.skills && request.skills.length > 0) {
        console.log('[Claude Code Service] 🎯 Skills written to sandbox:', request.skills)
        console.log('[Claude Code Service] Skills will be auto-discovered from .claude/skills/ directory')

        // Import skill config to get descriptions
        const { getSkillConfigs } = await import('@/lib/skills/config')
        const skillConfigs = getSkillConfigs(request.skills)

        const skillDescriptions = skillConfigs.map(skill =>
          `- ${skill.name}: ${skill.description}`
        ).join('\n')

        fullMessage += `\n\nTesting Skills:\n${skillDescriptions}\n\nTest Skills by asking questions that match their descriptions.`
      }

      // Execute Claude Code SDK in the sandbox environment
      console.log('[Claude Code Service] Executing Claude Code SDK...')

      console.log('[Claude Code Service] before execution')

      // Escape special characters in message for shell, but preserve newlines
      const escapedMessage = fullMessage
        .replace(/"/g, '\\"')
        .replace(/\$/g, '\\$')
        .replace(/`/g, '\\`')

      let completionDetected = false
      const sdkErrors: string[] = [] // Collect SDK errors, only send after completion
      let capturedSessionId: string | null = null

      // Line buffering to handle partial stdout chunks
      let lineBuffer = ''

      // Track execution context for debugging
      const executionStartTime = Date.now()
      console.log('[Claude Code Service] Starting sandbox execution', {
        sandboxId: sandbox.sandboxId,
        timestamp: new Date().toISOString(),
        messageLength: escapedMessage.length,
        sessionId: request.sessionId || 'new session',
      })

      let execution: any
      let executionError: Error | null = null

      // Track if we receive any output at all
      let receivedAnyOutput = false
      let stdoutChunkCount = 0
      let stderrChunkCount = 0

      try {
        // First, verify the Claude SDK is installed in the sandbox
        console.log('[Claude Code Service] 🔍 Checking Claude SDK installation...')
        const checkCmd = await sandbox.commands.run(
          'ls -la /claude-sdk/ && cat /claude-sdk/package.json | grep start || echo "start script not found"',
          { timeoutMs: 5000 }
        )
        console.log('[Claude Code Service] SDK check result:', {
          exitCode: checkCmd.exitCode,
          stdout: checkCmd.stdout?.substring(0, 500),
          stderr: checkCmd.stderr?.substring(0, 200),
        })

        if (checkCmd.exitCode !== 0) {
          console.error('[Claude Code Service] ❌ Claude SDK check failed!')
          callbacks.onError('Claude SDK is not properly installed in the sandbox. Check sandbox template configuration.')
          return
        }

        // Build command with optional session ID for resumption and model selection
        const sessionArg = request.sessionId ? ` --continue="${request.sessionId}"` : ''
        const modelArg = request.claudeModel ? ` --model="${request.claudeModel}"` : ''

        // Check if cloud (Convex) is enabled for this project
        let cloudEnabled = false
        try {
          const [project] = await db
            .select({ convexProject: projects.convexProject })
            .from(projects)
            .where(eq(projects.id, request.projectId))
            .limit(1)
          cloudEnabled = (project?.convexProject as any)?.kind === 'connected'
          console.log('[Claude Code Service] ☁️ Cloud enabled:', cloudEnabled)
        } catch (dbError) {
          console.error('[Claude Code Service] ❌ Failed to check cloud status:', dbError)
        }

        // Write Claude settings to skip the WebFetch preflight call to claude.ai.
        // Inside an E2B sandbox the preflight request (GET claude.ai/api/web/domain_info)
        // can hang indefinitely when the packet is silently dropped rather than refused.
        // This is a known SDK bug (GitHub #8980, #10075, #11650) with no upstream fix.
        try {
          const claudeSettingsDir = '/root/.claude'
          await sandbox.commands.run(`mkdir -p ${claudeSettingsDir}`, { timeoutMs: 5000 })
          await sandbox.files.write(
            `${claudeSettingsDir}/settings.json`,
            JSON.stringify({ skipWebFetchPreflight: true }, null, 2)
          )
          console.log('[Claude Code Service] ✅ Written skipWebFetchPreflight=true to Claude settings')
        } catch (settingsError) {
          console.error('[Claude Code Service] ❌ Failed to write Claude settings:', settingsError)
        }

        // Write the system prompt to a file in the sandbox (avoids shell escaping issues with large prompts)
        const systemPromptPath = '/claude-sdk/system-prompt.txt'
        const systemPrompt = getPromptWithCloudStatus(cloudEnabled)
        try {
          await sandbox.files.write(systemPromptPath, systemPrompt)
          console.log('[Claude Code Service] ✅ System prompt written to sandbox:', systemPromptPath, '(cloud:', cloudEnabled, ')')
        } catch (writeError) {
          console.error('[Claude Code Service] ❌ Failed to write system prompt:', writeError)
        }
        const systemPromptArg = ` --system-prompt-file="${systemPromptPath}"`

        // Build image URLs argument if attachments are provided
        let imageUrlsArg = ''
        console.log('[Claude Code Service] 🖼️ IMAGE ATTACHMENTS DEBUG:', {
          hasImageAttachments: !!request.imageAttachments,
          imageAttachmentsLength: request.imageAttachments?.length || 0,
          imageAttachments: request.imageAttachments,
        })
        if (request.imageAttachments && request.imageAttachments.length > 0) {
          const imageUrls = request.imageAttachments.map(a => a.url)
          // JSON encode and escape for shell
          const imageUrlsJson = JSON.stringify(imageUrls).replace(/"/g, '\\"')
          imageUrlsArg = ` --image-urls="${imageUrlsJson}"`
          console.log('[Claude Code Service] 🖼️ Adding image URLs to command:', {
            imageCount: imageUrls.length,
            imageUrls,
            imageUrlsArg,
          })
        } else {
          console.log('[Claude Code Service] 📝 No image attachments to add')
        }

        const command = `cd /claude-sdk && bun start -- --prompt="${escapedMessage}"${systemPromptArg}${sessionArg}${modelArg}${imageUrlsArg}`

        console.log('[Claude Code Service] Executing command with session support:', {
          hasSessionId: !!request.sessionId,
          sessionId: request.sessionId,
          hasImages: !!request.imageAttachments?.length,
          imageCount: request.imageAttachments?.length || 0,
          hasSystemPrompt: true,
          commandLength: command.length,
        })

        console.log('[Claude Code Service] ⏳ About to run command in background mode (avoids 120s timeout)...')

        // Use background: true to avoid E2B's internal timeout on foreground commands
        // Background mode returns a command handle that can stream output and wait for completion
        const commandHandle = await sandbox.commands.run(
          command,
          {
            background: true as const,
            envs: {
              ANTHROPIC_API_KEY: globalThis.process.env.ANTHROPIC_API_KEY || '',
            },
            timeoutMs: 0, // No timeout - let it run as long as needed
            onStdout: (data: string) => {
            stdoutChunkCount++
            receivedAnyOutput = true

            // Log first few chunks for debugging
            if (stdoutChunkCount <= 3) {
              console.log(`[Claude Code Service] 📥 stdout chunk #${stdoutChunkCount}:`, data.substring(0, 200))
            } else if (stdoutChunkCount % 50 === 0) {
              console.log(`[Claude Code Service] 📊 stdout chunk count: ${stdoutChunkCount}`)
            }

            // Add incoming data to line buffer
            lineBuffer += data

            // Filter out Expo/Metro dev server errors - these are from the running app, not the SDK
            const isExpoServerError =
              data.includes('Metro') ||
              data.includes('expo') ||
              data.includes('BUNDLE') ||
              data.includes('node_modules') ||
              data.includes('expo-router') ||
              data.includes('react-native') ||
              data.includes('localhost:8081') ||
              data.includes('@react-navigation')

            // Only detect SDK-level errors, not app runtime errors
            const isSdkError =
              !isExpoServerError &&
              (data.includes('Claude Code SDK Error') ||
               data.includes('ANTHROPIC_API_KEY') ||
               data.includes('API request failed') ||
               data.includes('SDK initialization failed') ||
               (data.includes('Error:') && data.includes('/claude-sdk/')) ||
               (data.includes('TypeError:') && data.includes('/claude-sdk/')) ||
               (data.includes('at async') && data.includes('claude-code')))

            if (isSdkError) {
              console.log(
                '[Claude Code Service] SDK ERROR DETECTED (storing for post-completion):',
                data,
              )
              // Store error but don't send yet - wait for task completion
              sdkErrors.push(data)
            } else {
              // Log non-error stdout for debugging
              if (data.trim() && !isExpoServerError) {
                console.log(
                  '[Claude Code Service] Non-error stdout:',
                  data.substring(0, 100) + (data.length > 100 ? '...' : ''),
                )
              }
            }

            // Parse and stream individual messages (slim format — each JSON fits on one line)
            try {
              // Split by newlines and process complete lines only
              const lines = lineBuffer.split('\n')

              // Keep the last incomplete line in the buffer
              lineBuffer = lines.pop() || ''

              for (const line of lines) {
                const trimmedLine = line.trim()

                // Check for completion signal
                if (trimmedLine === 'CLAUDE_CODE_COMPLETE') {
                  console.log('[Claude Code Service] Detected completion signal')
                  completionDetected = true
                  continue
                }

                // Capture session ID from init message
                if (line.includes('"type":"system"') && line.includes('"session_id"')) {
                  try {
                    const jsonMatch = line.match(/Streaming:\s*(\{.+\})/)
                    if (jsonMatch) {
                      const parsed = JSON.parse(jsonMatch[1])
                      if (parsed.session_id && !capturedSessionId) {
                        capturedSessionId = parsed.session_id
                        console.log('[Claude Code Service] Captured session ID:', capturedSessionId)
                      }
                    }
                  } catch (e) {
                    console.warn('[Claude Code Service] Failed to parse session ID from line:', line.substring(0, 100))
                  }
                }

                // Also capture session_id from result messages
                if (line.includes('"type":"result"') && line.includes('"session_id"')) {
                  try {
                    const jsonMatch = line.match(/Streaming:\s*(\{.+\})/)
                    if (jsonMatch) {
                      const parsed = JSON.parse(jsonMatch[1])
                      if (parsed.session_id && !capturedSessionId) {
                        capturedSessionId = parsed.session_id
                        console.log('[Claude Code Service] Captured session ID from result:', capturedSessionId)
                      }
                    }
                  } catch (e) {
                    // ignore
                  }
                }

                if (trimmedLine && line.includes('Streaming:')) {
                  const messageMatch = line.match(/Streaming:\s*(.+)/)
                  if (messageMatch && messageMatch[1]) {
                    const messageContent = messageMatch[1].trim()

                    // Skip heartbeat messages
                    if (messageContent.includes('[Heartbeat')) {
                      continue
                    }

                    // Slim messages are always small and complete — send directly
                    callbacks.onMessage(messageContent)
                  }
                } else if (
                  trimmedLine &&
                  !line.includes('Received message:') &&
                  !line.includes('Streaming:') &&
                  !line.includes('Environment check:') &&
                  !line.includes('Working directory:') &&
                  !line.includes('Raw process.argv:') &&
                  !line.includes('Parsed args:') &&
                  !line.includes('Found arguments:') &&
                  !line.includes('Extracted values:') &&
                  !line.includes('ANTHROPIC_API_KEY exists:') &&
                  !line.includes('Checking target directory:') &&
                  !line.includes('Full path:') &&
                  !line.includes('Directory exists and is accessible') &&
                  !line.includes('[Claude Code Service]') &&
                  !line.includes('Starting Claude Code query...') &&
                  !line.includes('Query completed successfully') &&
                  !line.includes('CLAUDE_CODE_COMPLETE')
                ) {
                  callbacks.onMessage(trimmedLine)
                }
              }
            } catch (error) {
              console.error('[Claude Code Service] Error parsing stdout for streaming:', error)
              callbacks.onMessage(data)
              lineBuffer = ''
            }
            },
            onStderr: (data: string) => {
              stderrChunkCount++
              receivedAnyOutput = true

              console.log(`[Claude Code Service] ⚠️  stderr chunk #${stderrChunkCount}:`, data)
              callbacks.onMessage(`Error: ${data}`)
            },
          }
        )

        // Wait for background command to complete (no timeout limit in background mode)
        execution = await commandHandle.wait()

        console.log('[Claude Code Service] ✅ commandHandle.wait() completed', {
          receivedAnyOutput,
          stdoutChunkCount,
          stderrChunkCount,
          exitCode: execution?.exitCode,
        })
      } catch (execError) {
        executionError = execError instanceof Error ? execError : new Error(String(execError))
        console.log('[Claude Code Service] ❌ Caught execution error:', executionError)
        console.error('[Claude Code Service] Sandbox execution failed:', {
          error: executionError.message,
          type: executionError.constructor.name,
          sandboxId: sandbox.sandboxId,
          receivedAnyOutput,
          stdoutChunkCount,
          stderrChunkCount,
        })
      }

      // Check if we never received any output - this indicates a silent failure
      if (!receivedAnyOutput && !executionError) {
        console.error('[Claude Code Service] 🚨 SILENT FAILURE: Command completed but received NO output')
        console.error('[Claude Code Service] This likely means the Claude SDK failed to start or execute')

        // Treat this as an error and notify the user
        callbacks.onError('Claude SDK failed to produce any output. The SDK may not be properly installed in the sandbox.')
        return
      }

      const executionDuration = Date.now() - executionStartTime

      // Handle execution failure
      // Note: With spawn() we no longer hit the 120-second timeout issue that run() had
      if (executionError) {
        console.error('[Claude Code Service] Execution error detected:', executionError.message)
        callbacks.onError(executionError.message)
        return
      }

      if (!execution) {
        callbacks.onError('Execution failed - no result returned from sandbox')
        return
      }

      const summary = this.extractSummary(execution)

      console.log('[Claude Code Service] after execution', {
        sandboxId: sandbox.sandboxId,
        duration: `${executionDuration}ms`,
        exitCode: execution.exitCode,
        completionDetected,
        sdkErrorsCount: sdkErrors.length,
        stdoutLength: execution.stdout?.length || 0,
        stderrLength: execution.stderr?.length || 0,
      })

      // Log execution details for debugging
      if (execution.exitCode === 0 && !completionDetected) {
        console.warn('[Claude Code Service] Execution completed with exit 0 but no completion signal detected')
        console.log('[Claude Code Service] Last 500 chars of stdout:', execution.stdout?.slice(-500) || 'No stdout')
      }

      // Only send SDK errors to user if task completed and there were actual SDK errors
      if (completionDetected && sdkErrors.length > 0) {
        console.log('[Claude Code Service] Task completed with SDK errors, notifying user')
        try {
          const channelName = `${request.projectId}-errors`
          pusherServer.trigger(channelName, 'error-notification', {
            message: sdkErrors.join('\n\n'),
            timestamp: new Date().toISOString(),
            projectId: request.projectId,
            type: 'sdk-error',
          })
          console.log(`[Claude Code Service] SDK error notification sent to channel: ${channelName}`)
        } catch (pusherError) {
          console.error('[Claude Code Service] Failed to send Pusher notification:', pusherError)
        }
      }

      // Consider it successful if we got the completion signal OR exit code is 0
      if (execution.exitCode !== 0 && !completionDetected) {
        const errorMessage = `Claude Code execution failed with exit code ${execution.exitCode}: ${execution.stderr}`
        console.error('[Claude Code Service] Execution failed:', errorMessage)

        // Trigger GitHub commit for failed execution (fire and forget)
        this.triggerGitHubCommit(
          sandbox.sandboxId,
          request.projectId,
          request.userMessage,
          request.messageId,
          true, // executionFailed = true
        )

        callbacks.onError(errorMessage)
        return
      }

      // Create the response object
      const response: AppGenerationResponse = {
        filesModified: [],
        success: true,
        summary: completionDetected ? summary : 'Task completed successfully',
        conversationId: capturedSessionId || undefined, // Pass session ID for future resumption
      }

      console.log('[Claude Code Service] Calling onComplete with response:', {
        success: response.success,
        summary: response.summary,
        completionDetected,
        sessionId: capturedSessionId,
      })

      // Always call onComplete to properly close the stream FIRST
      // This ensures the client receives the completion message immediately
      callbacks.onComplete(response)

      // Trigger GitHub commit for successful execution (fire and forget)
      this.triggerGitHubCommit(
        sandbox.sandboxId,
        request.projectId,
        request.userMessage,
        request.messageId,
        false, // executionFailed = false
      )

      // Return immediately to close the HTTP stream
      return
    } catch (error) {
      // Enhanced error logging for debugging stream terminations
      const errorDetails = {
        timestamp: new Date().toISOString(),
        sandboxId: sandbox?.sandboxId,
        projectId: request.projectId,
        userId: request.userId,
        messageId: request.messageId,
        errorType: error?.constructor?.name,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        // Extract E2B-specific error details if available
        errorCode: (error as any)?.code,
        errorDetails: (error as any)?.details,
        // Additional context
        requestContext: {
          isFirstMessage: request.isFirstMessage,
          hasImages: !!request.images?.length,
          hasFileEdition: !!request.fileEdition,
          hasSelectionData: !!request.selectionData,
        },
      }

      console.error('==================== SANDBOX EXECUTION ERROR ====================')
      console.error('Error in generateAppStreaming:', JSON.stringify(errorDetails, null, 2))
      console.error('================================================================')

      // Track error with ErrorTracker for debugging
      ErrorTracker.trackSandboxTermination(error, {
        sandboxId: sandbox?.sandboxId,
        projectId: request.projectId,
        userId: request.userId,
        messageId: request.messageId,
        operation: 'generateAppStreaming',
        additionalContext: errorDetails.requestContext,
      })

      // Check for specific error patterns
      if (error instanceof Error) {
        if (error.message.includes('terminated')) {
          console.error('[Claude Code Service] SANDBOX TERMINATED - Possible causes:')
          console.error('  1. Sandbox was killed/paused externally')
          console.error('  2. Connection to E2B was lost')
          console.error('  3. Sandbox ran out of resources (memory/CPU)')
          console.error('  4. Timeout exceeded (current timeout settings):')
          console.error(`     - E2B_SANDBOX_TIMEOUT_MS: ${process.env.E2B_SANDBOX_TIMEOUT_MS || '3600000'}`)
          console.error(`     - E2B_SANDBOX_REQUEST_TIMEOUT_MS: ${process.env.E2B_SANDBOX_REQUEST_TIMEOUT_MS || '3600000'}`)
        } else if (error.message.includes('timeout')) {
          console.error('[Claude Code Service] TIMEOUT ERROR - Command execution took too long')
        } else if (error.message.includes('connection')) {
          console.error('[Claude Code Service] CONNECTION ERROR - Network issue with E2B')
        }
      }

      // Try to notify user via Pusher about the error
      try {
        const channelName = `${request.projectId}-errors`
        await pusherServer.trigger(channelName, 'error-notification', {
          message: `Stream execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
          projectId: request.projectId,
          type: 'execution-error',
          errorDetails,
        })
        console.log(`[Claude Code Service] Error notification sent to channel: ${channelName}`)
      } catch (pusherError) {
        console.error('[Claude Code Service] Failed to send Pusher error notification:', pusherError)
      }

      callbacks.onError(
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  }

  private async getConversationContext(
    request: AppGenerationRequest,
    sandbox: Sandbox,
  ): Promise<ConversationContext> {
    // Load previous conversation history from database if exists
    const previousMessages = await this.loadConversationHistory(
      request.projectId,
    )

    return {
      projectId: request.projectId,
      userId: request.userId,
      previousMessages,
    }
  }


  private async loadConversationHistory(
    projectId: string,
  ): Promise<ConversationContext['previousMessages']> {
    // In a production implementation, load from database
    // For now, return empty array
    return []
  }

  private extractSummary(response: any): string {
    try {
      // Handle different response formats from Claude Code SDK
      let text = ''

      if (typeof response === 'string') {
        text = response
      } else if (response && typeof response === 'object') {
        // Check common response properties
        text =
          response.message ||
          response.content ||
          response.text ||
          response.output ||
          ''

        // If still no text, stringify the object for debugging
        if (!text && response) {
          console.log(
            '[Claude Code Service] response format:',
            typeof response,
            Object.keys(response),
          )
          text = JSON.stringify(response)
        }
      }

      if (!text) {
        return 'Application updated successfully'
      }

      // Extract summary from text
      const lines = text.split('\n')
      const summaryLines = lines.slice(0, 3)
      return summaryLines.join(' ').trim() || 'Application updated successfully'
    } catch (error) {
      console.error('Error extracting summary:', error)
      return 'Application updated successfully'
    }
  }

  // Helper method to get project working directory
  async getProjectWorkingDirectory(projectId: string): Promise<string> {
    return '/home/user' // E2B standard working directory
  }

  // Cleanup method
  async cleanup(projectId: string): Promise<void> {
    this.conversationCache.delete(projectId)
  }

  // GitHub integration - trigger via separate API endpoint (non-blocking)
  private triggerGitHubCommit(
    sandboxId: string,
    projectId: string,
    userMessage: string,
    messageId?: string,
    executionFailed: boolean = false,
  ): void {
    // Fire and forget - don't await, don't block
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
      .then(() => {
        console.log('[Claude Code Service] GitHub commit triggered successfully')
      })
      .catch((error) => {
        console.error('[Claude Code Service] Failed to trigger GitHub commit:', error)
        // Don't throw - this is fire-and-forget
      })
  }
}
