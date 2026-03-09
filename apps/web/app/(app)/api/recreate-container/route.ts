import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { startExpoServer } from '@/lib/server-utils'
import { Sandbox } from '@e2b/code-interpreter'
import { Octokit } from '@octokit/rest'
import { eq, and } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { inngest } from '@/lib/inngest'
import { tunnelMode as tunnelModeFlag } from '@/flags'

export const maxDuration = 300

interface RecreateContainerRequest {
  projectId: string
  userID: string
  teamID?: string
}

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

export async function POST(req: NextRequest) {
  try {
    const { projectId, userID, teamID }: RecreateContainerRequest =
      await req.json()

    console.log('[Recreate Container] Recreate container API called with:', {
      projectId,
      userID,
    })

    if (!userID) {
      return Response.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 })
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
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    const project = existingProjects[0]
    console.log(
      `[Recreate Container] Found project: ${project.id} with sandbox: ${project.sandboxId}`,
    )

    // Create a new sandbox with the same template the project was created with
    let sandbox: Sandbox | null = null
    try {
      const templateId = {
        expo: 'sm3r39vktkmu37lna0qa',
        tamagui: '10aeyh6gcn9lmorirs2z',
        'expo-testing': 'wxe2y93k4kafhbwqg2br',
      }
      // Use the project's stored template to pick the right sandbox image
      const templateSelection: keyof typeof templateId =
        project.template === 'expo-testing' ? 'expo-testing' :
        project.template === 'tamagui' ? 'tamagui' : 'expo'

      console.log(`[Recreate Container] Using template: ${templateSelection} (project.template: ${project.template})`)

      sandbox = await Sandbox.create(templateId[templateSelection], {
        timeoutMs: parseInt(process.env.E2B_SANDBOX_TIMEOUT_MS || '3600000'), // Use env var, default to 1 hour
      })
      console.log(`[Recreate Container] Created new sandbox: ${sandbox.sandboxId}`)

      // Update project with new sandbox ID
      await db
        .update(projects)
        .set({ sandboxId: sandbox.sandboxId })
        .where(eq(projects.id, projectId))
    } catch (error) {
      console.log(`[Recreate Container] Failed to create new sandbox:`, error)
      return Response.json(
        {
          error: 'Failed to create new sandbox',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      )
    }

    // Check if GitHub repository exists for this project
    const repositoryName = `project-${projectId}`
    const owner = process.env.GITHUB_OWNER || 'your-org' // GitHub organization or username
    let hasGitHubRepo = false
    
    try {
      await octokit.repos.get({
        owner,
        repo: repositoryName,
      })
      console.log(`[Recreate Container] GitHub repository ${owner}/${repositoryName} already exists`)
      hasGitHubRepo = true
    } catch (error: any) {
      if (error.status === 404) {
        // Create the repository if it doesn't exist
        try {
          console.log(`[Recreate Container] Creating GitHub repository ${owner}/${repositoryName}`)
          await octokit.repos.createInOrg({
            org: owner,
            name: repositoryName,
            description: `Repository for project ${project.title}`,
            private: true,
            auto_init: true,
          })
          hasGitHubRepo = true
        } catch (createError: any) {
          if (createError.status === 422 && createError.message?.includes('name already exists')) {
            console.log(`[Recreate Container] GitHub repository ${owner}/${repositoryName} already exists (created concurrently)`)
            hasGitHubRepo = true
          } else {
            console.error('[Recreate Container] Error creating GitHub repository:', createError)
          }
        }
      } else {
        console.error('Error checking GitHub repository:', error)
      }
    }

    // Set up git credentials and clone repository in the app directory
    if (hasGitHubRepo) {
      const setupScript = `
#!/bin/bash
set -e

# Configure git
git config --global user.name "E2B User"
git config --global user.email "user@e2b.dev"

# Go to the app directory where the expo project exists
cd /home/user/app

# Initialize git if not already initialized
if [ ! -d ".git" ]; then
  git init
  git remote add origin https://${process.env.GITHUB_TOKEN}@github.com/${owner}/${repositoryName}.git
fi

# Pull latest changes from GitHub repository
git pull origin main || git pull origin master || echo "No remote content to pull"
`

      // Execute setup script in sandbox
      try {
        await sandbox.commands.run(setupScript)
        console.log('[Recreate Container] Successfully set up GitHub in app directory')
      } catch (error) {
        console.error('[Recreate Container] Error setting up GitHub:', error)
      }
    } else {
      console.log('[Recreate Container] GitHub not configured or repository not found, continuing without GitHub integration')
    }

    // Restore Convex environment variables from database
    try {
      console.log('[Recreate Container] Restoring Convex environment variables...')
      const { restoreConvexEnvToSandbox } = await import('@/lib/convex/sandbox-utils')
      await restoreConvexEnvToSandbox(sandbox, projectId)
    } catch (error) {
      console.error('[Recreate Container] Failed to restore Convex env:', error)
      // Don't fail the entire recreation if Convex restore fails
    }

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
          repositoryName,
          url: serverResult.url,
          serverReady: serverResult.serverReady,
          tunnelMode: currentTunnelMode,
        })
      } catch (error) {
        console.log('[Recreate Container] Error starting Expo server:', error)
        return Response.json(
          {
            success: false,
            error: 'Failed to start server',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 },
        )
      }
    }

    return Response.json({
      success: true,
      projectId: project.id,
      projectTitle: project.title,
      sandboxId: sandbox.sandboxId,
      repositoryName,
      url: `https://${sandbox.getHost(8081)}`,
    })
  } catch (error) {
    console.error('Error in Recreate Container API:', error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}