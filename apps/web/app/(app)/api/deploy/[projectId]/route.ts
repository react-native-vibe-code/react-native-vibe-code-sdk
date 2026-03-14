import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq, and, ne, or } from 'drizzle-orm'
import { deployToCloudflare } from '@react-native-vibe-code/publish'

export const maxDuration = 300 // 5 minutes for full deployment

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  try {
    const projectId = params.projectId
    const {
      sandboxId,
      platform = 'web',
      action = 'deploy',
      customDomain,
    } = await request.json()

    console.log('[Deploy] Request received:', {
      projectId,
      sandboxId,
      sandboxIdType: typeof sandboxId,
      platform,
      action,
      customDomain,
    })

    if (!sandboxId) {
      return NextResponse.json(
        { error: 'Sandbox ID is required' },
        { status: 400 }
      )
    }

    // Get project to retrieve app name
    const projectResults = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (projectResults.length === 0) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    const project = projectResults[0]
    // Use customDomain from request, or fall back to project title for new deployments
    const appName = customDomain || project.title || 'my-app'

    // Check for existing Cloudflare project name, or extract from deployedUrl as fallback
    let existingProjectName = project.cloudflareProjectName
    if (!existingProjectName && project.deployedUrl) {
      // Extract project name from URL like "https://my-app-abc1234.pages.dev"
      const match = project.deployedUrl.match(/https?:\/\/([^.]+)\.pages\.dev/)
      if (match) {
        existingProjectName = match[1]
        console.log('[Deploy] Extracted project name from deployedUrl:', existingProjectName)
      }
    }
    const isUpdate = !!existingProjectName

    console.log('[Deploy] Project details:', {
      projectId,
      appName,
      customDomain,
      platform,
      sandboxIdFromRequest: sandboxId,
      sandboxIdFromDB: project.sandboxId,
      usingSandboxId: sandboxId,
      isUpdate,
      existingProjectName,
      existingCustomDomainUrl: project.customDomainUrl,
    })

    // Only support web platform for now
    if (platform !== 'web') {
      return NextResponse.json(
        { error: 'Only web platform deployment is supported' },
        { status: 400 }
      )
    }

    // Sanitize the custom domain from request
    const sanitizedRequestDomain = customDomain
      ? customDomain
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
      : null

    // Determine the effective custom domain to use
    // For new deployments: use the requested customDomain
    // For updates: use requested customDomain if different from existing, otherwise use existing
    let effectiveCustomDomain: string | null = null
    let useExactName = false

    if (isUpdate) {
      // For updates, always use the request domain if provided (user's current input)
      // Only fall back to database if no domain in request
      if (sanitizedRequestDomain) {
        // Check if this domain is different from existing and needs availability check
        if (sanitizedRequestDomain !== project.customDomainUrl &&
            sanitizedRequestDomain !== project.cloudflareProjectName) {
          // User wants a new subdomain - check availability
          const existingProjects = await db
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(
                ne(projects.id, projectId),
                or(
                  eq(projects.cloudflareProjectName, sanitizedRequestDomain),
                  eq(projects.customDomainUrl, sanitizedRequestDomain)
                )
              )
            )
            .limit(1)

          if (existingProjects.length > 0) {
            console.log('[Deploy] Subdomain already taken:', sanitizedRequestDomain)
            return NextResponse.json(
              {
                success: false,
                error: `The subdomain "${sanitizedRequestDomain}" is already taken. Please choose a different name.`,
                code: 'SUBDOMAIN_TAKEN',
              },
              { status: 409 }
            )
          }
          console.log('[Deploy] Update with new custom subdomain:', sanitizedRequestDomain)
        } else {
          console.log('[Deploy] Update with same custom subdomain:', sanitizedRequestDomain)
        }
        // Always use the request domain
        effectiveCustomDomain = sanitizedRequestDomain
      } else {
        // No domain in request, fall back to existing
        effectiveCustomDomain = project.customDomainUrl || null
        console.log('[Deploy] Update with existing custom subdomain from DB:', effectiveCustomDomain)
      }
    } else {
      // New deployment
      if (sanitizedRequestDomain) {
        // Check if this subdomain is already used by another project
        const existingProjects = await db
          .select({ id: projects.id, cloudflareProjectName: projects.cloudflareProjectName })
          .from(projects)
          .where(
            and(
              ne(projects.id, projectId),
              eq(projects.cloudflareProjectName, sanitizedRequestDomain)
            )
          )
          .limit(1)

        if (existingProjects.length > 0) {
          console.log('[Deploy] Subdomain already taken:', sanitizedRequestDomain)
          return NextResponse.json(
            {
              success: false,
              error: `The subdomain "${sanitizedRequestDomain}" is already taken. Please choose a different name.`,
              code: 'SUBDOMAIN_TAKEN',
            },
            { status: 409 }
          )
        }

        // Subdomain is available, use exact name without nanoid suffix
        useExactName = true
        effectiveCustomDomain = sanitizedRequestDomain
        console.log('[Deploy] Custom subdomain is available:', sanitizedRequestDomain)
      }
    }

    // Deploy to Cloudflare Workers
    console.log(`[Deploy] Starting Cloudflare ${isUpdate ? 'update' : 'deployment'}...`)
    const deployResult = await deployToCloudflare({
      sandboxId,
      projectId,
      appName,
      appPath: '/home/user/app',
      existingProjectName: existingProjectName || undefined,
      useExactName,
      // Pass the effective custom domain for both new deployments and updates
      existingCustomDomain: effectiveCustomDomain || undefined,
    })

    if (!deployResult.success) {
      console.error('[Deploy] Deployment failed:', deployResult.error)
      return NextResponse.json(
        {
          success: false,
          error: deployResult.error || 'Deployment failed',
          message: deployResult.message,
        },
        { status: 500 }
      )
    }

    // Update project with deployment URL and project name
    if (deployResult.deploymentUrl) {
      try {
        // Determine the deployedUrl - prioritize custom domain over pages.dev
        // If we have an effective custom domain, use it; otherwise fall back to Cloudflare's result
        let finalDeployedUrl: string
        if (effectiveCustomDomain) {
          finalDeployedUrl = `https://${effectiveCustomDomain}.pages.dev`
        } else if (deployResult.customDomainUrl) {
          finalDeployedUrl = deployResult.customDomainUrl
        } else {
          finalDeployedUrl = deployResult.deploymentUrl || deployResult.pagesDevUrl || ''
        }

        const updateData: {
          deployedUrl: string
          customDomainUrl?: string
          updatedAt: Date
          cloudflareProjectName?: string
        } = {
          deployedUrl: finalDeployedUrl,
          updatedAt: new Date(),
        }

        // Store custom domain subdomain
        // Priority: deployResult.customDomainUrl (from Cloudflare) > effectiveCustomDomain (from request/existing)
        if (deployResult.customDomainUrl) {
          // deployResult.customDomainUrl is full URL like "https://swift-mountain.capsulethis.app"
          // Extract subdomain from URL: "https://swift-mountain.capsulethis.app" -> "swift-mountain"
          const customDomainMatch = deployResult.customDomainUrl.match(/https?:\/\/([^.]+)\./)
          if (customDomainMatch) {
            updateData.customDomainUrl = customDomainMatch[1]
          } else {
            // Fallback: if URL parsing fails, try to use as-is (shouldn't happen)
            updateData.customDomainUrl = deployResult.customDomainUrl
          }
        } else if (effectiveCustomDomain) {
          // Fallback to effectiveCustomDomain if Cloudflare didn't return a custom domain
          // This ensures the user's requested domain is saved even if DNS setup fails
          updateData.customDomainUrl = effectiveCustomDomain
        }

        // Save cloudflareProjectName - this is the Cloudflare Pages project identifier
        // Note: customDomainUrl is the user's chosen subdomain and should NOT be overwritten here
        // It's already set from deployResult.customDomainUrl above if a custom domain was configured
        if (deployResult.deploymentName) {
          updateData.cloudflareProjectName = deployResult.deploymentName
        } else if (!project.cloudflareProjectName && existingProjectName) {
          updateData.cloudflareProjectName = existingProjectName
        }

        await db
          .update(projects)
          .set(updateData)
          .where(eq(projects.id, projectId))

        console.log('[Deploy] Updated project with deployment URL:', deployResult.deploymentUrl)
        if (updateData.customDomainUrl) {
          console.log('[Deploy] Custom domain URL:', updateData.customDomainUrl)
        }
        if (updateData.cloudflareProjectName) {
          console.log('[Deploy] Stored Cloudflare project name:', updateData.cloudflareProjectName)
        }
      } catch (dbError) {
        console.error('[Deploy] Failed to update database:', dbError)
        // Don't fail the deployment if database update fails
      }
    }

    // Determine the final URLs for response
    // Use effectiveCustomDomain if available, otherwise extract from deployResult
    let responseCustomDomainUrl: string | undefined = effectiveCustomDomain || undefined
    if (!responseCustomDomainUrl && deployResult.customDomainUrl) {
      const customDomainMatch = deployResult.customDomainUrl.match(/https?:\/\/([^.]+)\./)
      responseCustomDomainUrl = customDomainMatch ? customDomainMatch[1] : deployResult.customDomainUrl
    }

    // Build the final deployment URL for response
    let responseDeploymentUrl: string
    if (responseCustomDomainUrl) {
      responseDeploymentUrl = `https://${responseCustomDomainUrl}.pages.dev`
    } else {
      responseDeploymentUrl = deployResult.deploymentUrl || deployResult.pagesDevUrl || ''
    }

    console.log('[Deploy] Deployment successful:', {
      deploymentUrl: responseDeploymentUrl,
      customDomainUrl: responseCustomDomainUrl,
      pagesDevUrl: deployResult.pagesDevUrl,
      deploymentName: deployResult.deploymentName,
      isUpdate,
    })

    return NextResponse.json({
      success: true,
      message: isUpdate ? 'Successfully updated Cloudflare deployment' : deployResult.message,
      deploymentUrl: responseDeploymentUrl,
      // Return subdomain only (e.g., "swift-mountain"), not full URL
      customDomainUrl: responseCustomDomainUrl,
      pagesDevUrl: deployResult.pagesDevUrl,
      deploymentName: deployResult.deploymentName,
      buildPath: deployResult.buildPath,
      isUpdate,
    })
  } catch (error: any) {
    console.error('[Deploy] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Deployment failed',
      },
      { status: 500 }
    )
  }
}
