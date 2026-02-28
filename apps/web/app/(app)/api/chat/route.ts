import { saveProjectMessages } from '@/lib/db'
import { streamText, UIMessage } from 'ai'
import { canUserSendMessage, incrementMessageUsage } from '@/lib/message-usage'
import { corsHeaders, handleCorsOptions } from '@/lib/cors'
import { handleClaudeCodeGeneration } from '@/lib/claude-code-handler'

type ClaudeCodeResponse = {
  type: 'message' | 'completion' | 'error'
  content?: string
  summary?: string
  error?: string
}

export const maxDuration = 799 // 15 minutes in seconds

export async function OPTIONS() {
  return handleCorsOptions()
}

export async function POST(req: Request) {
  const {
    messages,
    projectId,
    userId,
    claudeModel,
    fileEdition,
    selectionData,
    imageAttachments,
    skills,
  }: {
    messages: UIMessage[]
    projectId: string
    userId: string
    claudeModel?: string
    fileEdition?: string
    selectionData?: any
    imageAttachments?: Array<{ url: string; contentType: string; name: string; size: number }>
    skills?: string[]
  } = await req.json()

  // Get the last user message to send to claude-code
  const lastUserMessageObj = messages.filter((m: UIMessage) => m.role === 'user').pop()
  const lastUserMessage = lastUserMessageObj?.content || ''
  const lastUserMessageId = lastUserMessageObj?.id || ''

  // Get imageAttachments from request body or from the message's data field
  const messageData = (lastUserMessageObj as any)?.data
  const finalImageAttachments = imageAttachments || messageData?.imageAttachments

  console.log('[Chat Route] Received request with:', {
    messagesCount: messages.length,
    projectId,
    userId,
    hasFileEdition: !!fileEdition,
    hasSelectionData: !!selectionData,
    imageAttachmentsFromBody: imageAttachments?.length || 0,
    imageAttachmentsFromMessageData: messageData?.imageAttachments?.length || 0,
    finalImageAttachmentsCount: finalImageAttachments?.length || 0,
    skillsCount: skills?.length || 0,
    skills: skills,
  })

  console.log('[Chat Route] All messages:', messages.map(m => ({
    id: m.id,
    role: m.role,
    contentLength: m.content?.length || 0,
    createdAt: m.createdAt,
    data: (m as any).data,
  })))

  console.log('[Chat Route] last message object:', lastUserMessageObj)
  console.log('[Chat Route] lastUserMessage:', lastUserMessage)
  console.log('[Chat Route] lastUserMessageId:', lastUserMessageId)

  // Check message usage limits before processing
  if (userId && lastUserMessage) {
    console.log('[Chat Route] Checking message usage limits for user:', userId)
    const usageCheck = await canUserSendMessage(userId)

    if (!usageCheck.canSend) {
      console.log('[Chat Route] Message limit exceeded:', usageCheck.reason)

      // Create a structured message for rate limit that frontend can recognize
      const rateLimitData = {
        type: 'RATE_LIMIT_EXCEEDED',
        reason: usageCheck.reason,
        usageCount: usageCheck.usage.usageCount,
        messageLimit: usageCheck.usage.messageLimit,
      }

      const limitExceededMessage = `__RATE_LIMIT_CARD__${JSON.stringify(rateLimitData)}__RATE_LIMIT_CARD__`

      const result = await streamText({
        model: {
          specificationVersion: 'v1',
          doStream: async () => {
            const chunks = limitExceededMessage.split(' ')
            let index = 0

            return {
              stream: new ReadableStream({
                async start(controller) {
                  const sendChunk = () => {
                    if (index < chunks.length) {
                      const chunk = chunks[index] + (index < chunks.length - 1 ? ' ' : '')
                      controller.enqueue({ type: 'text-delta', textDelta: chunk })
                      index++
                      setTimeout(sendChunk, 50)
                    } else {
                      controller.enqueue({
                        type: 'finish',
                        finishReason: 'stop',
                        usage: {
                          promptTokens: 0,
                          completionTokens: limitExceededMessage.split(' ').length,
                          totalTokens: limitExceededMessage.split(' ').length,
                        },
                      })
                      controller.close()
                    }
                  }
                  sendChunk()
                },
              }),
            }
          },
        } as any,
        messages: ([
          ...messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: limitExceededMessage,
            metadata: {
              type: 'rate_limit',
              rateLimitData,
            },
          },
        ] as any),
      })

      return result.toDataStreamResponse({
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'none',
          ...corsHeaders,
        },
      })
    }

    console.log('[Chat Route] Usage check passed. Remaining messages:', usageCheck.usage.remainingMessages)
  }

  if (!projectId || !userId || !lastUserMessage) {
    const fallbackMessage = 'Please provide a message with valid project and user information.'

    const result = await streamText({
      model: {
        specificationVersion: 'v1',
        doStream: async () => {
          const chunks = fallbackMessage.split(' ')
          let index = 0

          return {
            stream: new ReadableStream({
              async start(controller) {
                const sendChunk = () => {
                  if (index < chunks.length) {
                    const chunk = chunks[index] + (index < chunks.length - 1 ? ' ' : '')
                    controller.enqueue({ type: 'text-delta', textDelta: chunk })
                    index++
                    setTimeout(sendChunk, 50)
                  } else {
                    controller.enqueue({
                      type: 'finish',
                      finishReason: 'stop',
                      usage: {
                        promptTokens: 0,
                        completionTokens: fallbackMessage.split(' ').length,
                        totalTokens: fallbackMessage.split(' ').length,
                      },
                    })
                    controller.close()
                  }
                }
                sendChunk()
              },
            }),
          }
        },
      } as any,
      messages: ([
        ...messages,
        {
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: fallbackMessage,
        },
      ] as any),
    })

    return result.toDataStreamResponse({
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'none',
      }
    })
  }

  // Increment message usage count before processing
  console.log('[Chat Route] Incrementing message usage for user:', userId)
  const usageResult = await incrementMessageUsage(userId)

  if (!usageResult.success) {
    console.error('[Chat Route] Failed to increment message usage')
    return new Response('Failed to track message usage', { status: 500 })
  }

  console.log('[Chat Route] Message usage incremented. New count:', usageResult.newUsageCount, 'Remaining:', usageResult.remainingMessages)

  // Call claude-code handler directly to get the streaming response
  let claudeCodeResult: ClaudeCodeResponse | null = null
  let messagesSavedToDb = false

  if (projectId && userId && lastUserMessage) {
    try {
      console.log('[Chat Route] Calling Claude Code handler directly with:', {
        finalImageAttachmentsCount: finalImageAttachments?.length || 0,
        finalImageAttachments,
      })

      // Create a streaming response using AI SDK v4.3
      const result = streamText({
        model: {
          specificationVersion: 'v1',
          // Custom streaming model that handles Claude Code streaming
          doStream: async ({ prompt }) => {
            return {
              stream: new ReadableStream({
                async start(controller) {
                  let fullContent = ''
                  let hasReceivedCompletion = false
                  let lastActivityTime = Date.now()
                  let isStreamClosed = false
                  let messageCount = 0
                  let isClosing = false // Mutex-like flag to prevent concurrent close attempts

                  // Safe stream close helper - prevents race conditions
                  const safeCloseStream = (
                    finishReason: 'stop' | 'length' | 'error' = 'stop',
                    finalMessage?: string
                  ) => {
                    // Double-check with mutex pattern
                    if (isStreamClosed || isClosing) {
                      console.log('[Chat Route] Stream already closed or closing, skipping')
                      return false
                    }
                    isClosing = true

                    try {
                      if (finalMessage) {
                        controller.enqueue({
                          type: 'text-delta',
                          textDelta: finalMessage,
                        })
                      }
                      controller.enqueue({
                        type: 'finish',
                        finishReason,
                        usage: {
                          promptTokens: 0,
                          completionTokens: fullContent.split(' ').length,
                          totalTokens: fullContent.split(' ').length,
                        },
                      })
                      controller.close()
                      isStreamClosed = true
                      return true
                    } catch (e) {
                      console.error('[Chat Route] Error in safeCloseStream:', e)
                      isStreamClosed = true // Mark as closed even on error to prevent retries
                      return false
                    }
                  }

                  // Safe enqueue helper - checks stream state before enqueueing
                  const safeEnqueue = (data: any): boolean => {
                    if (isStreamClosed || isClosing) {
                      console.log('[Chat Route] Stream closed, dropping message')
                      return false
                    }
                    try {
                      controller.enqueue(data)
                      return true
                    } catch (e) {
                      console.error('[Chat Route] Error enqueueing:', e)
                      isStreamClosed = true // Mark as closed if enqueue fails
                      return false
                    }
                  }

                  // Helper to save messages to database - prevents loss on stream break
                  const saveMessagesToDatabase = async (content: string, source: string) => {
                    if (messagesSavedToDb) {
                      console.log(`[Chat Route] saveMessagesToDatabase(${source}): already saved, skipping`)
                      return
                    }
                    if (!projectId || !userId || !content) {
                      console.log(`[Chat Route] saveMessagesToDatabase(${source}): missing projectId/userId/content, skipping`)
                      return
                    }
                    messagesSavedToDb = true
                    try {
                      console.log(`[Chat Route] saveMessagesToDatabase(${source}): saving ${content.length} chars`)
                      const assistantMessageId = crypto.randomUUID()
                      const finalAssistantMessage: UIMessage = {
                        id: assistantMessageId,
                        role: 'assistant' as const,
                        content,
                        createdAt: new Date(),
                        parts: [{ type: 'text', text: content }],
                        metadata: claudeCodeResult ? { claudeCodeResult } : undefined,
                      } as any

                      const updatedMessages: UIMessage[] = [...messages, finalAssistantMessage]
                      const messagesForDb = updatedMessages.map(msg => ({
                        ...msg,
                        createdAt: msg.createdAt
                          ? (typeof msg.createdAt === 'string' ? new Date(msg.createdAt) : msg.createdAt)
                          : new Date()
                      }))

                      await saveProjectMessages(projectId, userId, messagesForDb)
                      console.log(`[Chat Route] saveMessagesToDatabase(${source}): saved successfully`)
                    } catch (error) {
                      console.error(`[Chat Route] saveMessagesToDatabase(${source}): failed:`, error)
                      messagesSavedToDb = false // Allow retry from another path
                    }
                  }

                  // Heartbeat timer to detect stale streams
                  const heartbeatInterval = setInterval(async () => {
                    const timeSinceActivity = Date.now() - lastActivityTime
                    // If no activity for 90 seconds, consider stream stale
                    if (timeSinceActivity > 90000 && !isStreamClosed && !isClosing && !hasReceivedCompletion) {
                      console.warn('[Chat Route] Stream appears stale, no activity for 90s')
                      clearInterval(heartbeatInterval)
                      const timeoutContent = fullContent + '\n\n⚠️ Stream timeout - connection may have been interrupted'
                      await saveMessagesToDatabase(timeoutContent, 'heartbeat-timeout')
                      safeCloseStream('length', '\n\n⚠️ Stream timeout - connection may have been interrupted')
                    }
                  }, 10000) // Check every 10 seconds

                  try {
                    // Call the handler module directly - no HTTP, no timeout issues!
                    await handleClaudeCodeGeneration(
                      {
                        userMessage: lastUserMessage,
                        messageId: lastUserMessageId,
                        projectId,
                        userID: userId,
                        isFirstMessage: messages.length === 1,
                        fileEdition,
                        selectionData,
                        claudeModel,
                        imageAttachments: finalImageAttachments,
                        skills,
                      },
                      {
                        onMessage: (message: string) => {
                          // Stream content immediately
                          lastActivityTime = Date.now()
                          messageCount++

                          const content = message + '\n'
                          fullContent += content

                          safeEnqueue({
                            type: 'text-delta',
                            textDelta: content,
                          })
                        },
                        onComplete: async (result: any) => {
                          clearInterval(heartbeatInterval)
                          hasReceivedCompletion = true

                          // Store final result for database saving
                          claudeCodeResult = {
                            type: 'completion',
                            summary: result.summary,
                            content: fullContent,
                          }

                          // Add final summary
                          const summaryContent = `\n\n✅ ${result.summary}`
                          fullContent += summaryContent

                          // Save to DB BEFORE closing the stream
                          await saveMessagesToDatabase(fullContent, 'onComplete')

                          // Use safe helpers for final message and close
                          safeEnqueue({
                            type: 'text-delta',
                            textDelta: summaryContent,
                          })
                          safeCloseStream('stop')

                          console.log('[Chat Route] Stream completed successfully. Messages sent:', messageCount)
                        },
                        onError: async (error: string) => {
                          clearInterval(heartbeatInterval)
                          console.error('[Chat Route] Handler error:', error)

                          const errorContent = `\n❌ Error: ${error}`
                          fullContent += errorContent

                          // Save to DB BEFORE closing the stream
                          await saveMessagesToDatabase(fullContent, 'onError')

                          safeCloseStream('error', errorContent)
                        },
                      }
                    )
                  } catch (error) {
                    console.error('==================== CHAT STREAM ERROR ====================')
                    console.error('[Chat Route] Error in streaming:', {
                      errorType: error?.constructor?.name,
                      errorMessage: error instanceof Error ? error.message : 'Streaming error',
                      errorStack: error instanceof Error ? error.stack : undefined,
                      projectId,
                      userId,
                      hasReceivedCompletion,
                      fullContentLength: fullContent.length,
                      messagesSent: messageCount,
                      timestamp: new Date().toISOString(),
                    })
                    console.error('===========================================================')

                    clearInterval(heartbeatInterval)

                    const errorMessage = error instanceof Error ? error.message : 'Streaming error'
                    const errorContent = fullContent + `\n❌ Error: ${errorMessage}`

                    // Save to DB BEFORE closing the stream
                    await saveMessagesToDatabase(errorContent, 'catch')

                    safeCloseStream('error', `\n❌ Error: ${errorMessage}`)
                  }
                },
              }),
              rawCall: { rawPrompt: prompt, rawSettings: {} },
              warnings: [],
            }
          },
        } as any,
        messages: (messages as any),
        onFinish: async ({ text }) => {
          // Fallback: only save if no earlier path (onComplete/onError/catch) already saved
          if (!messagesSavedToDb && projectId && userId) {
            console.log('[Chat Route] onFinish fallback: saving messages (text length:', text.length, ')')
            try {
              const assistantMessageId = crypto.randomUUID()
              const finalAssistantMessage: UIMessage = {
                id: assistantMessageId,
                role: 'assistant' as const,
                content: text,
                createdAt: new Date(),
                parts: [{ type: 'text', text }],
                metadata: claudeCodeResult ? { claudeCodeResult } : undefined,
              } as any

              const updatedMessages: UIMessage[] = [...messages, finalAssistantMessage]
              const messagesForDb = updatedMessages.map(msg => ({
                ...msg,
                createdAt: msg.createdAt
                  ? (typeof msg.createdAt === 'string' ? new Date(msg.createdAt) : msg.createdAt)
                  : new Date()
              }))

              await saveProjectMessages(projectId, userId, messagesForDb)
              messagesSavedToDb = true
              console.log('[Chat Route] onFinish fallback: messages saved successfully')
            } catch (error) {
              console.error('[Chat Route] onFinish fallback: failed to save messages:', error)
            }
          } else {
            console.log('[Chat Route] onFinish: messages already saved, skipping')
          }
        },
      })

      return result.toDataStreamResponse({
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'none',
          ...corsHeaders,
        },
      })
    } catch (error) {
      console.error('[Chat Route] Failed to call claude-code API:', error)
      console.error('[Chat Route] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      })
      return new Response('Internal error', { status: 500 })
    }
  }
}
