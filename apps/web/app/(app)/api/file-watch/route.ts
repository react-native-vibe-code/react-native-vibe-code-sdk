import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq } from 'drizzle-orm'
import { globalFileWatcher } from '@/lib/sandbox-file-watcher'
import { NextRequest } from 'next/server'
import { connectSandbox } from '@/lib/sandbox-connect'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')
  
  if (!projectId) {
    return new Response('Project ID is required', { status: 400 })
  }

  // console.log(`📡 [FileWatch SSE] New file watcher connection for project: ${projectId}`)

  const encoder = new TextEncoder()
  let fileWatcherStarted = false
  let connectionClosed = false

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      const initialData = encoder.encode(`data: {"type":"watcher_connecting","projectId":"${projectId}"}\n\n`)
      controller.enqueue(initialData)

      try {
        // Look up project in database to get sandbox ID
        // console.log(`🔍 [FileWatch SSE] Looking up project in database: ${projectId}`)
        const project = await db
          .select({ sandboxId: projects.sandboxId })
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1)

        if (!project.length || !project[0].sandboxId) {
          const errorData = encoder.encode(`data: {"type":"error","message":"Project not found or no active sandbox"}\n\n`)
          controller.enqueue(errorData)
          controller.close()
          return
        }

        const sandboxId = project[0].sandboxId
        // console.log(`✅ [FileWatch SSE] Found sandbox ID: ${sandboxId}`)

        // Connect to existing sandbox
        // console.log(`🔌 [FileWatch SSE] Attempting to connect to sandbox: ${sandboxId}`)
        const sbx = await connectSandbox(sandboxId)
        if (!sbx) throw new Error('Sandbox expired')
        // console.log(`✅ [FileWatch SSE] Successfully connected to sandbox`)

        // Send sandbox connected message
        const connectedData = encoder.encode(`data: {"type":"sandbox_connected","projectId":"${projectId}","sandboxId":"${sandboxId}"}\n\n`)
        controller.enqueue(connectedData)

        // Start file watcher
        // console.log(`🔍 [FileWatch SSE] Starting file watcher for project ${projectId}`)
        await globalFileWatcher.startWatching(
          projectId,
          sbx,
          (event) => {
            if (connectionClosed) return
            
            // console.log(`📝 [FileWatch SSE] 🚨 FILE CHANGE DETECTED for project ${projectId}:`, event)
            // console.log(`📝 [FileWatch SSE] 🚨 SENDING TO FRONTEND:`, event)
            try {
              const eventData = JSON.stringify(event)
              const sseData = encoder.encode(`data: ${eventData}\n\n`)
              controller.enqueue(sseData)
              // console.log(`📝 [FileWatch SSE] ✅ EVENT SENT TO FRONTEND`)
            } catch (error) {
              // console.error('❌ [FileWatch SSE] Error sending file change event:', error)
            }
          }
        )

        fileWatcherStarted = true
        // console.log(`✅ [FileWatch SSE] File watcher started for project ${projectId}`)

        // Send watcher started message
        const startedData = encoder.encode(`data: {"type":"watcher_started","projectId":"${projectId}"}\n\n`)
        controller.enqueue(startedData)

        // Send periodic heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          if (connectionClosed) {
            clearInterval(heartbeatInterval)
            return
          }
          try {
            const heartbeatData = encoder.encode(`data: {"type":"heartbeat","timestamp":"${new Date().toISOString()}"}\n\n`)
            controller.enqueue(heartbeatData)
          } catch (error) {
            // console.error('❌ [FileWatch SSE] Error sending heartbeat:', error)
            clearInterval(heartbeatInterval)
          }
        }, 30000) // Every 30 seconds

        // Store cleanup function
        const cleanup = () => {
          connectionClosed = true
          clearInterval(heartbeatInterval)
          if (fileWatcherStarted) {
            globalFileWatcher.stopWatching(projectId).catch(err => 
              console.error('Error stopping file watcher:', err)
            )
          }
        }

        // Handle connection close
        const originalClose = controller.close.bind(controller)
        controller.close = () => {
          cleanup()
          originalClose()
        }

        // Handle connection error
        const originalError = controller.error.bind(controller)
        controller.error = (reason?: any) => {
          cleanup()
          originalError(reason)
        }

      } catch (error) {
        // console.error(`❌ [FileWatch SSE] Error setting up file watcher for project ${projectId}:`, error)
        const errorData = encoder.encode(`data: {"type":"error","message":"${error instanceof Error ? error.message : 'Unknown error'}"}\n\n`)
        controller.enqueue(errorData)
        controller.close()
      }
    },
    
    cancel() {
      // console.log(`📡 [FileWatch SSE] Connection cancelled for project ${projectId}`)
      connectionClosed = true
      if (fileWatcherStarted) {
        globalFileWatcher.stopWatching(projectId).catch(err => 
          console.error('Error stopping file watcher on cancel:', err)
        )
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  })
}