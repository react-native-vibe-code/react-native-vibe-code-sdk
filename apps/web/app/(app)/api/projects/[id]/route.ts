import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { connectSandbox } from '@/lib/sandbox-connect'
import { inngest } from '@/lib/inngest'
import { corsHeaders, handleCorsOptions } from '@/lib/cors'
import { addCustomDomain } from '@react-native-vibe-code/publish'

export async function OPTIONS() {
  return handleCorsOptions()
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { searchParams } = new URL(req.url)
  const userID = searchParams.get('userID')

  if (!userID) {
    return new Response(JSON.stringify({ error: 'User ID is required' }), {
      status: 400,
      headers: corsHeaders,
    })
  }

  try {
    const projectResults = await db
      .select({
        id: projects.id,
        title: projects.title,
        userId: projects.userId,
        teamId: projects.teamId,
        chatId: projects.chatId,
        sandboxId: projects.sandboxId,
        sandboxUrl: projects.sandboxUrl,
        ngrokUrl: projects.ngrokUrl,
        deployedUrl: projects.deployedUrl,
        customDomainUrl: projects.customDomainUrl,
        cloudflareProjectName: projects.cloudflareProjectName,
        serverReady: projects.serverReady,
        serverStatus: projects.serverStatus,
        template: projects.template,
        status: projects.status,
        conversationId: projects.conversationId,
        githubRepo: projects.githubRepo,
        isPublic: projects.isPublic,
        forkedFrom: projects.forkedFrom,
        forkCount: projects.forkCount,
        screenshotMobile: projects.screenshotMobile,
        screenshotDesktop: projects.screenshotDesktop,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(
        and(
          eq(projects.id, params.id),
          eq(projects.userId, userID)
        )
      )
      .limit(1)

    if (projectResults.length === 0) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: corsHeaders,
      })
    }

    const project = projectResults[0]

    // If project is paused and has a sandboxId, try to connect to it
    if (project.status === 'paused' && project.sandboxId) {
      try {
        const sandbox = await connectSandbox(project.sandboxId)
        
        // Update project status
        await db
          .update(projects)
          .set({
            status: 'active',
            updatedAt: new Date(),
          })
          .where(eq(projects.id, project.id))

        // Schedule pause job for 25 minutes from now
        await inngest.send({
          name: 'container/pause.scheduled',
          data: {
            projectId: project.id,
            userID: userID,
            sandboxId: sandbox.sandboxId,
          },
          ts: Date.now() + 25 * 60 * 1000, // 25 minutes from now
        })

        console.log(`Connected to sandbox ${sandbox.sandboxId} for project ${project.id}`)

        return new Response(JSON.stringify({
          project: { ...project, status: 'active' }
        }), { headers: corsHeaders })
      } catch (error) {
        console.error('Failed to connect to sandbox automatically:', error)
        // Return project as-is if connect fails
      }
    }

    return new Response(JSON.stringify({ project: projectResults[0] }), { headers: corsHeaders })
  } catch (error) {
    console.error('Error fetching project:', error)
    return new Response(JSON.stringify({
      error: 'Failed to fetch project',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: corsHeaders,
    })
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await req.json()
    const { title, deployedUrl, customDomainUrl, userID } = body

    if (!userID) {
      return new Response(JSON.stringify({ error: 'User ID is required' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // Validate inputs - at least one field must be provided
    const hasTitle = title && typeof title === 'string' && title.trim().length > 0
    const hasDeployedUrl = deployedUrl && typeof deployedUrl === 'string'
    const hasCustomDomainUrl = customDomainUrl && typeof customDomainUrl === 'string'

    if (!hasTitle && !hasDeployedUrl && !hasCustomDomainUrl) {
      return new Response(JSON.stringify({ error: 'Valid title, deployedUrl, or customDomainUrl is required' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // Check if project exists and belongs to user
    const existingProject = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, params.id),
          eq(projects.userId, userID)
        )
      )
      .limit(1)

    if (existingProject.length === 0) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: corsHeaders,
      })
    }

    // Build update object
    const updateData: any = {
      updatedAt: new Date(),
    }

    if (hasTitle) {
      updateData.title = title.trim()
    }

    if (hasDeployedUrl) {
      updateData.deployedUrl = deployedUrl.trim()
    }

    if (hasCustomDomainUrl) {
      const sanitizedDomain = customDomainUrl
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
      updateData.customDomainUrl = sanitizedDomain

      // Also update deployedUrl if the project has been deployed
      // This ensures "Visit Webapp" shows the correct URL
      if (existingProject[0].cloudflareProjectName || existingProject[0].deployedUrl) {
        updateData.deployedUrl = `https://${sanitizedDomain}.capsulethis.app`
      }
    }

    // Update project
    const updatedProject = await db
      .update(projects)
      .set(updateData)
      .where(
        and(
          eq(projects.id, params.id),
          eq(projects.userId, userID)
        )
      )
      .returning()

    // If customDomainUrl was updated and project has been deployed, update Cloudflare custom domain
    if (hasCustomDomainUrl && existingProject[0].cloudflareProjectName) {
      const sanitizedDomain = customDomainUrl
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

      console.log(`[Project PATCH] Updating custom domain: ${sanitizedDomain} -> ${existingProject[0].cloudflareProjectName}.pages.dev`)

      try {
        // This will create/update DNS record and add custom domain to Pages project
        const domainResult = await addCustomDomain(
          existingProject[0].cloudflareProjectName,
          sanitizedDomain
        )

        if (!domainResult.success) {
          console.warn(`[Project PATCH] Custom domain update failed: ${domainResult.error}`)
          // Don't fail the request - the project was still updated
        } else {
          console.log(`[Project PATCH] Custom domain updated successfully: ${domainResult.customDomain}`)
        }
      } catch (error) {
        console.error('[Project PATCH] Error updating custom domain:', error)
        // Don't fail the request - the project was still updated
      }
    }

    return new Response(JSON.stringify({
      success: true,
      project: updatedProject[0]
    }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('Error updating project:', error)
    return new Response(JSON.stringify({
      error: 'Failed to update project',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: corsHeaders,
    })
  }
}