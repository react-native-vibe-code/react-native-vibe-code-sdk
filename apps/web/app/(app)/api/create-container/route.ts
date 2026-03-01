import { db } from '@/lib/db'
import { projects, convexProjectCredentials } from '@react-native-vibe-code/database'
import { Sandbox } from '@e2b/code-interpreter'
import { Octokit } from '@octokit/rest'
import { GitHubService } from '@/lib/github-service'
import { eq, and } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { generateTitleFromUserMessage } from '@/lib/name-generator'
import { updateAppConfigWithName } from '@react-native-vibe-code/publish'
import type { UIMessage } from 'ai'
import { provisionManagedConvexProject } from '@/lib/convex/management-api'
import { pusherServer } from '@/lib/pusher'
import { restoreConvexEnvToSandbox } from '@/lib/convex/sandbox-utils'

export const maxDuration = 300 // 5 minutes for container creation

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

const githubService = new GitHubService({
  owner: process.env.GITHUB_OWNER || 'capsule-this',
  token: process.env.GITHUB_TOKEN!,
})

// Buffer for accumulating multi-line Convex error messages
const convexErrorBuffers = new Map<string, { buffer: string; timeout: NodeJS.Timeout | null }>()

// Convex-specific error patterns
const CONVEX_ERROR_PATTERNS = [
  /error:/i,
  /Error:/,
  /failed to/i,
  /Unable to/i,
  /Cannot find/i,
  /is not defined/i,
  /Argument .* is not/i,
  /Expected .* but got/i,
  /ValidationError/i,
  /SchemaValidationError/i,
  /ConvexError/i,
  /Uncaught exception/i,
  /TypeError:/i,
  /ReferenceError:/i,
  /SyntaxError:/i,
  /Invalid argument/i,
  /Missing required/i,
  /✖/,  // Convex CLI error indicator
]

/**
 * Send Convex errors to the frontend via Pusher
 */
function sendConvexError(projectId: string, logData: string): void {
  if (!projectId) return

  const hasError = CONVEX_ERROR_PATTERNS.some(pattern => pattern.test(logData))

  // Skip common non-error messages
  if (logData.includes('Convex functions ready') ||
      logData.includes('✔') ||
      logData.includes('Watching for changes') ||
      logData.includes('bunx convex dev')) {
    return
  }

  let bufferData = convexErrorBuffers.get(projectId)
  if (!bufferData) {
    bufferData = { buffer: '', timeout: null }
    convexErrorBuffers.set(projectId, bufferData)
  }

  if (hasError) {
    console.log('[Convex Dev] Error detected:', logData.substring(0, 200))

    if (bufferData.timeout) {
      clearTimeout(bufferData.timeout)
    }

    bufferData.buffer += logData + '\n'

    bufferData.timeout = setTimeout(() => {
      const cleanError = bufferData!.buffer
        .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
        .trim()

      if (cleanError.length > 0) {
        const channelName = `${projectId}-errors`
        pusherServer.trigger(channelName, 'error-notification', {
          message: cleanError,
          timestamp: new Date().toISOString(),
          projectId,
          type: 'convex-error',
          source: 'convex-dev',
        })
        .then(() => {
          console.log(`[Convex Dev] Error notification sent to channel: ${channelName}`)
        })
        .catch((error) => {
          console.error('[Convex Dev] Failed to send error notification:', error)
        })
      }

      bufferData!.buffer = ''
      bufferData!.timeout = null
    }, 500)
  }
}

/**
 * Provision managed Convex project and write EXPO_PUBLIC_CONVEX_URL to sandbox
 */
async function setupConvex(params: {
  projectId: string
  userId: string
  sandbox: Sandbox
  appName: string
}): Promise<void> {
  // Check if Convex is configured
  const teamScopedToken = process.env.CONVEX_TEAM_SCOPED_TOKEN
  const teamSlug = process.env.CONVEX_TEAM_SLUG

  if (!teamScopedToken || !teamSlug) {
    console.log('[Create Container] Convex not configured, skipping')
    return
  }

  // Check if project already has Convex credentials
  const [existingCredentials] = await db
    .select()
    .from(convexProjectCredentials)
    .where(eq(convexProjectCredentials.projectId, params.projectId))
    .limit(1)

  if (existingCredentials) {
    console.log('[Create Container] Convex already connected, using existing credentials')
    // Write existing URL to sandbox env
    await writeConvexUrlToSandbox(params.sandbox, existingCredentials.deploymentUrl)
    // Start dev server with existing credentials
    await startConvexDevServer({
      projectId: params.projectId,
      sandbox: params.sandbox,
      adminKey: existingCredentials.adminKey,
      deploymentUrl: existingCredentials.deploymentUrl,
    })
    return
  }

  try {
    console.log('[Create Container] Provisioning managed Convex project...')

    // Provision managed Convex project
    const convexProjectName = `${params.appName.replace(/[^a-zA-Z0-9-]/g, '-')}-${params.projectId.substring(0, 8)}`
    const convexProject = await provisionManagedConvexProject({
      teamScopedToken,
      teamSlug,
      projectName: convexProjectName,
    })

    console.log('[Create Container] Convex project provisioned:', convexProject.deploymentUrl)

    // Store credentials
    await db.insert(convexProjectCredentials).values({
      projectId: params.projectId,
      userId: params.userId,
      mode: 'managed',
      teamSlug: convexProject.teamSlug,
      projectSlug: convexProject.projectSlug,
      deploymentUrl: convexProject.deploymentUrl,
      deploymentName: convexProject.deploymentName,
      adminKey: convexProject.token,
      accessToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Update project state
    await db
      .update(projects)
      .set({
        convexProject: {
          kind: 'connected',
          projectSlug: convexProject.projectSlug,
          teamSlug: convexProject.teamSlug,
          deploymentUrl: convexProject.deploymentUrl,
          deploymentName: convexProject.deploymentName,
        },
        updatedAt: new Date(),
      })
      .where(eq(projects.id, params.projectId))

    // Write EXPO_PUBLIC_CONVEX_URL to sandbox .env.local
    await writeConvexUrlToSandbox(params.sandbox, convexProject.deploymentUrl)

    // Start Convex dev server
    await startConvexDevServer({
      projectId: params.projectId,
      sandbox: params.sandbox,
      adminKey: convexProject.token,
      deploymentUrl: convexProject.deploymentUrl,
    })

    console.log('[Create Container] Convex setup complete')
  } catch (error) {
    console.error('[Create Container] Failed to setup Convex:', error)
    // Don't fail the entire container creation if Convex fails
  }
}

/**
 * Write EXPO_PUBLIC_CONVEX_URL to sandbox .env.local
 */
async function writeConvexUrlToSandbox(sandbox: Sandbox, deploymentUrl: string): Promise<void> {
  try {
    const { updateSandboxEnvFile } = await import('@/lib/convex/sandbox-utils')
    await updateSandboxEnvFile(sandbox, 'EXPO_PUBLIC_CONVEX_URL', deploymentUrl)
    console.log('[Create Container] Wrote Convex URL to sandbox .env.local')
  } catch (error) {
    console.error('[Create Container] Failed to write to sandbox .env.local:', error)
  }
}

/**
 * Start Convex dev server in the sandbox
 */
async function startConvexDevServer(params: {
  projectId: string
  sandbox: Sandbox
  adminKey: string
  deploymentUrl: string
}): Promise<void> {
  try {
    console.log('[Create Container] Starting Convex dev server...')

    // Start convex dev in background (long-running process)
    // Use --url and --admin-key flags to avoid interactive prompts
    params.sandbox.commands.run(
      `cd /home/user/app && bunx convex dev --url "${params.deploymentUrl}" --admin-key "${params.adminKey}" --typecheck=disable`,
      {
        background: true,
        timeoutMs: 3600000, // 1 hour
        onStdout: (data: string) => {
          console.log('[Convex Dev] stdout:', data)
          sendConvexError(params.projectId, data)
        },
        onStderr: (data: string) => {
          console.log('[Convex Dev] stderr:', data)
          sendConvexError(params.projectId, data)
        },
      }
    )

    // Update project status
    await db
      .update(projects)
      .set({
        convexDevRunning: true,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, params.projectId))

    console.log('[Create Container] Convex dev server started')
  } catch (error) {
    console.error('[Create Container] Failed to start Convex dev server:', error)
    // Don't fail if dev server start fails
  }
}

interface CreateContainerRequest {
  projectId: string
  userID: string
  teamID?: string
  template?: string
  chooseTemplate?: 'expo' | 'tamagui' | 'expo-testing'
  firstMessage?: UIMessage // First user message to generate fantasy name
}

export async function POST(req: NextRequest) {
  try {
    const {
      projectId,
      userID,
      teamID,
      template = 'react-native-expo',
      chooseTemplate,
      firstMessage,
    }: CreateContainerRequest = await req.json()

    console.log('Create Container API called with:', {
      projectId,
      userID,
      template,
      chooseTemplate,
      hasFirstMessage: !!firstMessage,
    })

    if (!userID) {
      return Response.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Check if project already exists with active sandbox
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

        // Try to connect to the existing sandbox
        if (project.sandboxId) {
          try {
            sandbox = await Sandbox.connect(project.sandboxId)
            console.log(`Connected to existing sandbox: ${sandbox.sandboxId}`)

            // Set API Base URL for the sandbox app
            try {
              const { updateSandboxEnvFile } = await import('@/lib/convex/sandbox-utils')
              const apiBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.reactnativevibecode.com'
              await updateSandboxEnvFile(sandbox, 'EXPO_PUBLIC_API_BASE_URL', apiBaseUrl)
              console.log(`[Create Container] Set EXPO_PUBLIC_API_BASE_URL to ${apiBaseUrl}`)
            } catch (error) {
              console.error('[Create Container] Failed to set EXPO_PUBLIC_API_BASE_URL:', error)
            }

            // Restore Convex environment variables from database
            await restoreConvexEnvToSandbox(sandbox, project.id)

            // Schedule pause job for 25 minutes from now
            // await inngest.send({
            //   name: 'container/pause.scheduled',
            //   data: {
            //     projectId: project.id,
            //     userID: userID,
            //     sandboxId: sandbox.sandboxId,
            //   },
            //   ts: Date.now() + 25 * 60 * 1000, // 25 minutes from now
            // })

            return Response.json({
              success: true,
              sandboxId: sandbox.sandboxId,
              projectId: project.id,
              projectTitle: project.title,
              template: project.template,
              isNew: false,
            })
          } catch (error) {
            console.log(`Failed to connect to sandbox ${project.sandboxId}:`, error)
            // Continue to create new sandbox
            sandbox = null
          }
        }
      }
    } catch (error) {
      console.log('Error checking for existing project:', error)
    }

    const templateId = {
      expo: 'sm3r39vktkmu37lna0qa',
      tamagui: '10aeyh6gcn9lmorirs2z',
      'expo-testing': 'wxe2y93k4kafhbwqg2br'
    }
    // Prioritize chooseTemplate from request body, fallback to env var, then default to 'expo'
    const templateSelection: keyof typeof templateId =
      chooseTemplate ||
      (process.env.TEMPLATE_SELECTION as keyof typeof templateId) ||
      'expo'

    console.log(`Using template: ${templateSelection} (ID: ${templateId[templateSelection]})`)

    sandbox = await Sandbox.create(templateId[templateSelection], {

      metadata: {
        template: templateId[templateSelection],
        userID: userID,
        teamID: teamID || '',
        projectId,
      },
      timeoutMs: parseInt(process.env.E2B_SANDBOX_TIMEOUT_MS || '3600000'), // Use env var, default to 1 hour
    })

    console.log(`Created new sandbox: ${sandbox.sandboxId}`)

    // Generate app name from first message
    let appName = 'my-app' // Default fallback
    if (firstMessage) {
      try {
        console.log('Generating app name from first message...')
        appName = await generateTitleFromUserMessage({ message: firstMessage })
        console.log(`Generated app name: ${appName}`)
      } catch (error) {
        console.error('Failed to generate app name:', error)
        // Use fallback name
      }
    }

    // Create GitHub repository for the project
    const repositoryName = `project-${projectId}`

    // Update or create project
    if (project) {
      const updatedProjects = await db
        .update(projects)
        .set({
          sandboxId: sandbox.sandboxId,
          githubRepo: repositoryName,
          title: appName, // Update title with app name
          updatedAt: new Date(),
        })
        .where(eq(projects.id, project.id))
        .returning()

      // Update project object with new values
      if (updatedProjects.length > 0) {
        project = updatedProjects[0]
      }
    } else {
      // Try to create new project, but handle case where it already exists
      try {
        const newProjects = await db
          .insert(projects)
          .values({
            id: projectId,
            title: appName, // Use app name as title
            userId: userID,
            teamId: teamID || null,
            sandboxId: sandbox.sandboxId,
            template: template,
            status: 'active',
            githubRepo: repositoryName,
          })
          .returning()

        project = newProjects[0]
        console.log(`Created new project: ${project.id} with name: ${appName}`)
      } catch (error: any) {
        if (error.code === '23505') {
          // Project already exists, fetch it and update sandbox
          console.log('Project already exists, updating sandbox ID')
          const existingProjects = await db
            .select()
            .from(projects)
            .where(and(eq(projects.id, projectId), eq(projects.userId, userID)))
            .limit(1)

          if (existingProjects.length > 0) {
            project = existingProjects[0]
            // Update with new sandbox ID and title
            const updatedProjects = await db
              .update(projects)
              .set({
                sandboxId: sandbox.sandboxId,
                githubRepo: repositoryName,
                title: appName, // Update title with generated app name
                updatedAt: new Date(),
              })
              .where(eq(projects.id, project.id))
              .returning()

            // Update project object with new values
            if (updatedProjects.length > 0) {
              project = updatedProjects[0]
            }

            console.log(
              `Updated existing project ${project.id} with new sandbox ${sandbox.sandboxId} and title ${appName}`,
            )
          }
        } else {
          throw error
        }
      }
    }

    if (!project) {
      throw new Error('Failed to create or find project')
    }

    // Set API Base URL for the sandbox app
    try {
      const { updateSandboxEnvFile } = await import('@/lib/convex/sandbox-utils')
      const apiBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.reactnativevibecode.com'
      await updateSandboxEnvFile(sandbox, 'EXPO_PUBLIC_API_BASE_URL', apiBaseUrl)
      console.log(`[Create Container] Set EXPO_PUBLIC_API_BASE_URL to ${apiBaseUrl}`)
    } catch (error) {
      console.error('[Create Container] Failed to set EXPO_PUBLIC_API_BASE_URL:', error)
    }

    // Only setup Convex if it was previously enabled (credentials exist)
    // New projects don't get Convex automatically - users enable it via the Cloud button
    const [existingConvexCredentials] = await db
      .select()
      .from(convexProjectCredentials)
      .where(eq(convexProjectCredentials.projectId, project.id))
      .limit(1)

    if (existingConvexCredentials) {
      console.log('[Create Container] Convex credentials found, restoring...')
      await setupConvex({
        projectId: project.id,
        userId: userID,
        sandbox,
        appName,
      })
    } else {
      console.log('[Create Container] No Convex credentials - user can enable via Cloud button')
    }

    // Create GitHub repository for the project
    const owner = process.env.GITHUB_OWNER || 'your-org' // GitHub organization or username
    
    try {
      await octokit.repos.get({
        owner,
        repo: repositoryName,
      })
      console.log(`GitHub repository ${owner}/${repositoryName} already exists`)
    } catch (error: any) {
      if (error.status === 404) {
        // Create the repository if it doesn't exist
        try {
          console.log(`Creating GitHub repository ${owner}/${repositoryName}`)
          await octokit.repos.createInOrg({
            org: owner,
            name: repositoryName,
            description: `Repository for project ${project.title}`,
            private: true,
            auto_init: true,
          })
        } catch (createError: any) {
          if (createError.status === 422 && createError.message?.includes('name already exists')) {
            console.log(`GitHub repository ${owner}/${repositoryName} already exists (created concurrently)`)
          } else {
            console.error('Error creating GitHub repository:', createError)
          }
          // Continue without failing the entire request
        }
      } else {
        console.error('Error checking GitHub repository:', error)
        // Don't fail the entire request if GitHub fails
      }
    }

    // Initialize GitHub repository with initial code in the app directory
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER) {
      try {
        // First ensure the app directory exists and has content
        await sandbox.commands.run('ls -la /home/user/app', { timeoutMs: 5000 })

        await githubService.initializeRepository(
          sandbox,
          projectId,
          repositoryName,
          `Initial commit for project: ${project.title}`
        )
        console.log(`[Create Container] Successfully initialized GitHub repository for project ${projectId}`)
      } catch (error) {
        console.error(`[Create Container] Failed to initialize GitHub repository:`, error)
        // Don't fail the entire request if GitHub initialization fails
      }
    }

    // Update app.json and wrangler.toml with the app name
    try {
      console.log(`[Create Container] Updating app config files with app name: ${appName}`)
      await updateAppConfigWithName(sandbox, appName, '/home/user/app')
      console.log(`[Create Container] Successfully updated app config files`)
    } catch (error) {
      console.error(`[Create Container] Failed to update app config files:`, error)
      // Don't fail the entire request if config update fails
    }

    // Schedule pause job for 25 minutes from now
    // await inngest.send({
    //   name: 'container/pause.scheduled',
    //   data: {
    //     projectId: project.id,
    //     userID: userID,
    //     sandboxId: sandbox.sandboxId,
    //   },
    //   ts: Date.now() + 25 * 60 * 1000, // 25 minutes from now
    // })

    return Response.json({
      success: true,
      sandboxId: sandbox.sandboxId,
      projectId: project.id,
      projectTitle: project.title,
      template: project.template,
      isNew: true,
    })
  } catch (error) {
    console.error('Error in Create Container API:', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}
