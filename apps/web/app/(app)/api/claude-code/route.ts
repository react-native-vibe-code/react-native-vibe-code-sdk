import {
  appOperationSchema,
  hybridSchema,
  isAppOperation,
  convertFragmentToAppOperation,
} from '@/lib/app-schema'
import { ClaudeCodeService } from '@/lib/claude-code-service'
import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { UsageTracker } from '@/lib/usage-tracking'
import { Sandbox } from '@e2b/code-interpreter'
import { connectSandbox } from '@/lib/sandbox-connect'
import { eq, and } from 'drizzle-orm'
import { NextRequest } from 'next/server'

export const maxDuration = 800 // 15 minutes in seconds

interface ClaudeCodeRequest {
  userMessage: string
  messageId?: string
  projectId: string
  userID: string
  teamID?: string
  isFirstMessage?: boolean
  useClaudeCode?: boolean // Flag to determine if we should use Claude Code or fallback to fragments
  images?: string[]
  conversationId?: string
  fileEdition?: string
  selectionData?: any
}

export async function POST(req: NextRequest) {
  try {
    const {
      userMessage,
      messageId,
      projectId,
      userID,
      teamID,
      isFirstMessage = false,
      useClaudeCode = true,
      images = [],
      conversationId,
      sandboxId,
      fileEdition,
      selectionData,
    }: ClaudeCodeRequest & { sandboxId?: string } = await req.json()

    console.log('Claude Code API called with:', {
      projectId,
      userID,
      isFirstMessage,
      useClaudeCode,
      messageLength: userMessage.length,
      sandboxId,
      messageId: messageId || 'no messageId',
    })

    if (!userID) {
      return Response.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Get existing project - resuming logic handled elsewhere
    let project = null
    let sandbox: Sandbox | null = null

    try {
      const existingProjects = await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.userId, userID),
            eq(projects.status, 'active'),
          ),
        )
        .limit(1)

      if (existingProjects.length > 0) {
        project = existingProjects[0]
        console.log(
          `Found existing project: ${project.id} with sandbox: ${project.sandboxId}`,
        )

        // Connect to existing sandbox
        const targetSandboxId = sandboxId || project.sandboxId
        if (targetSandboxId) {
          sandbox = await connectSandbox(targetSandboxId)
          console.log(`[Claude Code API] Using sandbox: ${sandbox.sandboxId}`)
        } else {
          return Response.json(
            {
              success: false,
              error: 'No sandbox ID found. Please create a container first.',
              type: 'sandbox-error',
            },
            { status: 400 },
          )
        }
      } else {
        return Response.json(
          {
            success: false,
            error: 'Project not found. Please create a container first.',
            type: 'project-error',
          },
          { status: 404 },
        )
      }
    } catch (error) {
      console.log('Error checking for existing project:', error)
      return Response.json(
        {
          success: false,
          error: 'Failed to find project or sandbox',
          type: 'error',
        },
        { status: 500 },
      )
    }

    // Create a streaming response
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let hasCompleted = false
        let streamTimeout: NodeJS.Timeout | null = null
        let lastMessageTime = Date.now()
        let messageCount = 0

        // Connection health monitor - check for activity every 30 seconds
        const healthMonitor = setInterval(() => {
          const timeSinceLastMessage = Date.now() - lastMessageTime
          if (timeSinceLastMessage > 30000 && !hasCompleted) {
            console.warn('[Claude Code API] No activity for 30s, sending keepalive')
            try {
              const data = JSON.stringify({
                type: 'keepalive',
                timestamp: new Date().toISOString(),
                messagesSent: messageCount,
              })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            } catch (e) {
              console.error('[Claude Code API] Error sending keepalive:', e)
            }
          }
        }, 30000) // Check every 30 seconds

        // Safety timeout to prevent hanging streams
        streamTimeout = setTimeout(() => {
          if (!hasCompleted) {
            console.error('[Claude Code API] Stream timeout - no completion after 15 minutes')
            clearInterval(healthMonitor)
            const data = JSON.stringify({
              success: false,
              type: 'error',
              error: 'Stream timeout - operation took too long',
            })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            controller.close()
          }
        }, 900000) // 15 minutes

        try {
          console.log('Using Claude Code SDK for all operations')
          const claudeCodeService = new ClaudeCodeService()

          console.log('[Claude Code API] before generateApp')

          // Stream the app generation process
          await claudeCodeService.generateAppStreaming(
            {
              userMessage,
              messageId,
              projectId,
              userId: userID,
              isFirstMessage,
              images,
              fileEdition,
              selectionData,
              sessionId: project.conversationId || undefined, // Pass session ID for resumption
            },
            sandbox,
            {
              onMessage: (message: string) => {
                // Send each message as a streaming chunk
                try {
                  lastMessageTime = Date.now()
                  messageCount++
                  const data = JSON.stringify({
                    type: 'message',
                    content: message,
                    timestamp: new Date().toISOString(),
                  })
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`))
                } catch (err) {
                  console.error('[Claude Code API] Error sending message:', err)
                }
              },
              onComplete: async (result: any) => {
                if (streamTimeout) clearTimeout(streamTimeout)
                clearInterval(healthMonitor)
                hasCompleted = true
                // Scan updated project structure
                // const scanner = new ProjectScanner(sandbox)
                // const updatedStructure = await scanner.scanProject()

                // Track usage for billing - estimate token usage based on message length
                const estimatedTokens = Math.ceil(userMessage.length / 4) + 1000 // Rough estimate
                try {
                  await UsageTracker.trackTokenUsage(
                    userID,
                    estimatedTokens,
                    'claude-3-5-sonnet',
                    projectId,
                  )

                  await UsageTracker.trackCodeGeneration(
                    userID,
                    projectId,
                    result.filesModified?.length || 0,
                    estimatedTokens,
                  )
                } catch (error) {
                  console.error('Failed to track usage:', error)
                }

                // Save session ID to database for resumption
                if (result.conversationId && project) {
                  try {
                    console.log('[Claude Code API] Saving session ID to database:', result.conversationId)
                    await db.update(projects)
                      .set({
                        conversationId: result.conversationId,
                        updatedAt: new Date(),
                      })
                      .where(eq(projects.id, projectId))
                  } catch (error) {
                    console.error('[Claude Code API] Failed to save session ID:', error)
                  }
                }

                const finalResult = {
                  success: true,
                  type: 'completion',
                  sbxId: sandbox.sandboxId,
                  projectId: project!.id,
                  projectTitle: project!.title,
                  template: project!.template || 'react-native-expo',
                  url: `https://${sandbox.getHost(8081)}`,
                  summary: result.summary,
                  filesModified: result.filesModified,
                  conversationId: result.conversationId,
                  // structure: {
                  //   components: updatedStructure.components,
                  //   screens: updatedStructure.screens,
                  //   fileCount: updatedStructure.files.length,
                  // },
                }

                const data = JSON.stringify(finalResult)
                controller.enqueue(encoder.encode(`data: ${data}\n\n`))
                controller.close()
              },
              onError: (error: string) => {
                if (streamTimeout) clearTimeout(streamTimeout)
                clearInterval(healthMonitor)
                hasCompleted = true

                console.error('[Claude Code API] Stream error received from service:', {
                  error,
                  projectId,
                  userID,
                  sandboxId: sandbox?.sandboxId,
                  messagesSent: messageCount,
                  lastMessageTime: new Date(lastMessageTime).toISOString(),
                  timestamp: new Date().toISOString(),
                })

                try {
                  const data = JSON.stringify({
                    success: false,
                    type: 'error',
                    error,
                    context: {
                      projectId,
                      sandboxId: sandbox?.sandboxId,
                      messagesSent: messageCount,
                    },
                  })
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`))
                  controller.close()
                } catch (err) {
                  console.error('[Claude Code API] Error sending error message:', err)
                  controller.close()
                }
              },
            },
          )
        } catch (error) {
          if (streamTimeout) clearTimeout(streamTimeout)
          clearInterval(healthMonitor)
          hasCompleted = true

          console.error('==================== CLAUDE CODE API STREAM ERROR ====================')
          console.error('Error in streaming Claude Code API:', {
            errorType: error?.constructor?.name,
            errorMessage: error instanceof Error ? error.message : 'Internal server error',
            errorStack: error instanceof Error ? error.stack : undefined,
            projectId,
            userID,
            sandboxId: sandbox?.sandboxId,
            messagesSent: messageCount,
            lastMessageTime: new Date(lastMessageTime).toISOString(),
            timestamp: new Date().toISOString(),
          })
          console.error('=====================================================================')

          try {
            const data = JSON.stringify({
              success: false,
              type: 'error',
              error:
                error instanceof Error ? error.message : 'Internal server error',
              context: {
                projectId,
                sandboxId: sandbox?.sandboxId,
                messagesSent: messageCount,
              },
            })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            controller.close()
          } catch (closeErr) {
            console.error('[Claude Code API] Error closing stream:', closeErr)
          }
        } finally {
          // Ensure stream is always closed
          if (!hasCompleted) {
            if (streamTimeout) clearTimeout(streamTimeout)
            clearInterval(healthMonitor)
            try {
              console.warn('[Claude Code API] Stream ended without completion, forcing close')
              const data = JSON.stringify({
                success: false,
                type: 'error',
                error: 'Stream ended unexpectedly',
                context: {
                  messagesSent: messageCount,
                  lastMessageTime: new Date(lastMessageTime).toISOString(),
                },
              })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
              controller.close()
            } catch (err) {
              console.error('[Claude Code API] Error in finally block:', err)
            }
          }
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Error in Claude Code API:', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        type: 'error',
      },
      { status: 500 },
    )
  }
}
