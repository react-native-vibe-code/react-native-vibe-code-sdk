import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { startExpoServer } from '@/lib/server-utils'
import { Sandbox } from '@e2b/code-interpreter'
import { connectSandbox } from '@/lib/sandbox-connect'
import { eq, and } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { corsHeaders, handleCorsOptions } from '@/lib/cors'
import { tunnelMode as tunnelModeFlag } from '@/flags'
import { getConvexCredentials, startConvexDevServer } from '@/lib/convex/sandbox-utils'

export const maxDuration = 300

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return handleCorsOptions()
}

interface ResumeContainerRequest {
  projectId: string
  userID: string
  teamID?: string
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, userID, teamID }: ResumeContainerRequest =
      await req.json()

    console.log('[Resume Container] Resume container API called with:', {
      projectId,
      userID,
    })

    if (!userID) {
      return Response.json({ error: 'User ID is required' }, { status: 400, headers: corsHeaders })
    }

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400, headers: corsHeaders })
    }

    // Get existing project
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

    if (existingProjects.length === 0) {
      return Response.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders })
    }

    const project = existingProjects[0]
    console.log(
      `[Resume Container] Found project: ${project.id} with sandbox: ${project.sandboxId}, githubRepo: ${project.githubRepo}`,
    )

    if (!project.sandboxId) {
      return Response.json(
        { error: 'No sandbox found for project' },
        { status: 404, headers: corsHeaders },
      )
    }

    let sandbox: Sandbox | null = null

    // Try to connect to the existing sandbox
    try {
      sandbox = await connectSandbox(project.sandboxId)
      console.log(`[Resume Container] Connected to sandbox: ${sandbox.sandboxId}`)

      // Check if project has Convex connected and restart convex dev server
      const convexCredentials = await getConvexCredentials(project.id)
      if (convexCredentials) {
        console.log(`[Resume Container] Convex credentials found, starting convex dev server`)
        const convexStarted = await startConvexDevServer(
          sandbox,
          project.id,
          convexCredentials
        )

        if (convexStarted) {
          // Update convexDevRunning status in database
          await db
            .update(projects)
            .set({
              convexDevRunning: true,
              updatedAt: new Date(),
            })
            .where(eq(projects.id, project.id))
          console.log(`[Resume Container] Convex dev server started successfully`)
        }
      }
    } catch (error) {
      console.log(`[Resume Container] Failed to connect to sandbox ${project.sandboxId}:`, error)

      // If sandbox is deleted, try to recreate it from GitHub repo
      if (project.githubRepo) {
        console.log(`[Resume Container] Attempting to recreate sandbox from GitHub repo: ${project.githubRepo}`)

        try {
          // Import and call the recreate-sandbox logic directly
          const { POST: recreateSandbox } = await import('../recreate-sandbox/route')

          // Create a mock request object
          const mockRequest = new Request('http://localhost/api/recreate-sandbox', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId: project.id,
              userID: userID,
              teamID: teamID,
              repositoryName: project.githubRepo,
            }),
          })

          const recreateResponse = await recreateSandbox(mockRequest as any)

          if (recreateResponse.ok) {
            const recreateResult = await recreateResponse.json()
            console.log('[Resume Container] Sandbox recreated successfully:', recreateResult)
            // Return the recreate result directly with all the new URLs and sandboxId
            return Response.json({
              ...recreateResult,
              recreated: true,
            }, { headers: corsHeaders })
          } else {
            const recreateError = await recreateResponse.json()
            console.error('[Resume Container] Failed to recreate sandbox:', recreateError)
            return Response.json(
              {
                success: false,
                error: 'Failed to recreate sandbox',
                details: recreateError.error || 'Unknown error',
              },
              { status: 500, headers: corsHeaders },
            )
          }
        } catch (recreateError) {
          console.error('[Resume Container] Error calling recreate-sandbox:', recreateError)
          return Response.json(
            {
              success: false,
              error: 'Failed to recreate sandbox',
              details: recreateError instanceof Error ? recreateError.message : 'Unknown error',
            },
            { status: 500, headers: corsHeaders },
          )
        }
      }

      return Response.json(
        {
          success: false,
          error: 'Failed to resume sandbox and no GitHub repo available',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500, headers: corsHeaders },
      )
    }

    // Schedule pause job for 25 minutes from now
    // TODO: Re-enable Inngest when running in production
    // try {
    //   await inngest.send({
    //     name: 'container/pause.scheduled',
    //     data: {
    //       projectId: project.id,
    //       userID: userID,
    //       sandboxId: sandbox.sandboxId,
    //     },
    //     ts: Date.now() + 25 * 60 * 1000, // 25 minutes from now
    //   })
    // } catch (inngestError) {
    //   console.log('[Resume Container] Failed to schedule pause job (Inngest may not be running):', inngestError)
    //   // Continue execution even if Inngest scheduling fails
    // }

    // Start Expo server for React Native projects (both production and testing templates)
    if (project.template === 'react-native-expo' || project.template === 'expo-testing') {
      try {
        const currentTunnelMode = await tunnelModeFlag()
        const serverResult = await startExpoServer(sandbox, project.id, undefined, currentTunnelMode as any)
        return Response.json({
          success: true,
          projectId: project.id,
          projectTitle: project.title,
          sandboxId: sandbox.sandboxId,
          url: serverResult.url,
          ngrokUrl: serverResult.ngrokUrl,
          serverReady: serverResult.serverReady,
          tunnelMode: currentTunnelMode,
        }, { headers: corsHeaders })
      } catch (error) {
        console.log('Error starting Expo server:', error)
        return Response.json(
          {
            success: false,
            error: 'Failed to start server',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500, headers: corsHeaders },
        )
      }
    }

    return Response.json({
      success: true,
      projectId: project.id,
      projectTitle: project.title,
      sandboxId: sandbox.sandboxId,
      url: `https://${sandbox.getHost(8081)}`,
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error in Resume Container API:', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500, headers: corsHeaders },
    )
  }
}
