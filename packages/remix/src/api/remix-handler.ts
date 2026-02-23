import { Sandbox } from '@e2b/code-interpreter'
import { Octokit } from '@octokit/rest'
import { eq, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { startExpoServer } from '@react-native-vibe-code/sandbox/lib'
import { setupConvexForRemix } from '../lib/convex-helpers'
import type { RemixResponse, ApiError } from '../types'

export const maxDuration = 300 // 5 minutes for remixing

/**
 * Create a remix of a public project
 */
export async function createRemix(params: {
  sourceProjectId: string
  userId: string
  db: any
  projects: any
  subscriptions: any
  chat: any
  message: any
  convexProjectCredentials: any
}): Promise<{ success: true; data: RemixResponse } | { success: false; error: ApiError; status: number }> {
  const {
    sourceProjectId,
    userId,
    db,
    projects,
    subscriptions,
    chat,
    message,
    convexProjectCredentials,
  } = params

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  })

  try {
    // Fetch source project and verify it's public
    const sourceProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.id, sourceProjectId))
      .limit(1)

    if (sourceProjects.length === 0) {
      return {
        success: false,
        error: { error: 'Source project not found' },
        status: 404,
      }
    }

    const sourceProject = sourceProjects[0]

    // Verify project is public
    if (!sourceProject.isPublic) {
      return {
        success: false,
        error: { error: 'This project is not public and cannot be remixed' },
        status: 403,
      }
    }

    // Check user's subscription to determine default visibility
    const userSubscription = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1)

    const isFreeUser =
      userSubscription.length === 0 ||
      userSubscription[0].currentPlan === 'free' ||
      userSubscription[0].status !== 'active'

    // Create new project ID
    const newProjectId = uuidv4()
    const repositoryName = `project-${newProjectId}`

    console.log(`[Remix] User ${userId} remixing project ${sourceProjectId} to ${newProjectId}`)

    // Create sandbox first
    let sandbox: Sandbox | null = null
    try {
      const templateId = {
        expo: 'sm3r39vktkmu37lna0qa',
        tamagui: '10aeyh6gcn9lmorirs2z',
      }
      const templateSelection: keyof typeof templateId =
        (process.env.TEMPLATE_SELECTION as keyof typeof templateId) || 'expo'

      sandbox = await Sandbox.create(templateId[templateSelection], {
        metadata: {
          template: sourceProject.template,
          userID: userId,
          projectId: newProjectId,
          forkedFrom: sourceProjectId,
        },
        timeoutMs: parseInt(process.env.E2B_SANDBOX_TIMEOUT_MS || '3600000'),
      })

      console.log(`[Remix] Created sandbox: ${sandbox.sandboxId}`)
    } catch (error) {
      console.error('[Remix] Failed to create sandbox:', error)
      return {
        success: false,
        error: {
          error: 'Failed to create sandbox',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        status: 500,
      }
    }

    // Clone chat and messages if source project has them
    let newChatId: string | null = null
    if (sourceProject.chatId) {
      try {
        console.log(`[Remix] Cloning chat from source project`)

        // Fetch source chat
        const sourceChats = await db
          .select()
          .from(chat)
          .where(eq(chat.id, sourceProject.chatId))
          .limit(1)

        if (sourceChats.length > 0) {
          const sourceChat = sourceChats[0]

          // Create new chat for remixed project
          const newChats = await db
            .insert(chat)
            .values({
              title: `${sourceChat.title} (Remix)`,
              userId: userId,
              visibility: 'private', // Remixed chats are always private
              createdAt: new Date(),
            })
            .returning()

          newChatId = newChats[0].id
          console.log(`[Remix] Created new chat: ${newChatId}`)

          // Fetch and clone all messages from source chat
          const sourceMessages = await db
            .select()
            .from(message)
            .where(eq(message.chatId, sourceProject.chatId))

          if (sourceMessages.length > 0) {
            console.log(`[Remix] Cloning ${sourceMessages.length} messages`)

            // Insert all messages in bulk
            await db.insert(message).values(
              sourceMessages.map((msg: any) => ({
                chatId: newChatId!,
                role: msg.role,
                parts: msg.parts,
                attachments: msg.attachments,
                createdAt: msg.createdAt,
              }))
            )

            console.log(`[Remix] Successfully cloned messages`)
          }
        }
      } catch (error) {
        console.error('[Remix] Error cloning chat/messages:', error)
        // Non-critical, continue with project creation
      }
    }

    // Create new project in database
    let newProject
    try {
      const newProjects = await db
        .insert(projects)
        .values({
          id: newProjectId,
          title: `${sourceProject.title} (Remix)`,
          userId: userId,
          sandboxId: sandbox.sandboxId,
          chatId: newChatId, // Link to cloned chat
          template: sourceProject.template,
          status: 'active',
          githubRepo: repositoryName,
          isPublic: isFreeUser, // Free users get public projects by default
          forkedFrom: sourceProject.id,
          forkCount: '0',
        })
        .returning()

      newProject = newProjects[0]
      console.log(`[Remix] Created project: ${newProject.id}`)
    } catch (error) {
      console.error('[Remix] Failed to create project:', error)
      // Clean up sandbox if project creation fails
      try {
        await sandbox.kill()
      } catch (cleanupError) {
        console.error('[Remix] Failed to clean up sandbox:', cleanupError)
      }
      return {
        success: false,
        error: {
          error: 'Failed to create project',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        status: 500,
      }
    }

    // Increment fork count on source project
    try {
      await db
        .update(projects)
        .set({
          forkCount: sql`CAST(COALESCE(NULLIF(${projects.forkCount}, ''), '0') AS INTEGER) + 1`,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, sourceProject.id))
    } catch (error) {
      console.error('[Remix] Failed to increment fork count:', error)
      // Non-critical, continue
    }

    // Ensure source project's code is in GitHub before attempting to clone from it
    const owner = process.env.GITHUB_OWNER || 'capsule-this'
    let sourceRepoExistsAndHasCode = false

    if (sourceProject.githubRepo && process.env.GITHUB_TOKEN && sourceProject.sandboxId) {
      try {
        console.log(
          `[Remix] Checking if source project's GitHub repo exists: ${owner}/${sourceProject.githubRepo}`
        )

        // Check if source repo exists
        await octokit.repos.get({
          owner,
          repo: sourceProject.githubRepo,
        })
        console.log(`[Remix] Source project's GitHub repo exists`)

        // Check if repo has any commits (has code)
        try {
          await octokit.repos.listCommits({
            owner,
            repo: sourceProject.githubRepo,
            per_page: 1,
          })
          console.log(`[Remix] Source project's GitHub repo has commits`)
          sourceRepoExistsAndHasCode = true
        } catch (commitError: any) {
          console.log(`[Remix] Source project's GitHub repo exists but has no commits`)
          sourceRepoExistsAndHasCode = false
        }
      } catch (error: any) {
        if (error.status === 404) {
          console.log(`[Remix] Source project's GitHub repo doesn't exist`)
          sourceRepoExistsAndHasCode = false
        } else {
          console.error('[Remix] Error checking source repo:', error)
          sourceRepoExistsAndHasCode = false
        }
      }

      // If source repo doesn't exist or has no commits, create it and push code from sandbox
      if (!sourceRepoExistsAndHasCode) {
        try {
          console.log(`[Remix] Creating source repo and pushing code from sandbox...`)

          // Create the source project's GitHub repo if it doesn't exist
          try {
            await octokit.repos.createInOrg({
              org: owner,
              name: sourceProject.githubRepo,
              description: sourceProject.title,
              private: true,
              auto_init: false,
            })
            console.log(`[Remix] Created source project's GitHub repository`)
          } catch (createError: any) {
            if (createError.status === 422 && createError.message?.includes('name already exists')) {
              console.log(`[Remix] Source repo already exists, will push to it`)
            } else {
              throw createError
            }
          }

          // Connect to source sandbox and push its code to GitHub
          const sourceSandbox = await Sandbox.connect(sourceProject.sandboxId)
          console.log(`[Remix] Connected to source sandbox to push code`)

          const pushSourceScript = `#!/bin/bash
set -e
cd /home/user/app

# Configure git
git config --global user.name "Capsule User"
git config --global user.email "user@capsule.dev"

# Initialize git if not already initialized
if [ ! -d ".git" ]; then
  git init
fi

# Add remote if not exists
git remote remove origin 2>/dev/null || true
git remote add origin https://${process.env.GITHUB_TOKEN}@github.com/${owner}/${sourceProject.githubRepo}.git

# Add all files and commit
git add .
git commit -m "Initial commit from ${sourceProject.title}" || true
git branch -M main
git push -u origin main --force

echo "SUCCESS: Pushed source project code to GitHub"
`

          const pushResult = await sourceSandbox.commands.run(pushSourceScript, {
            timeoutMs: 90000,
          })

          if (pushResult.error || !pushResult.stdout?.includes('SUCCESS')) {
            console.error(`[Remix] Failed to push source project code:`, pushResult.stderr)
            sourceRepoExistsAndHasCode = false
          } else {
            console.log(`[Remix] Successfully pushed source project code to GitHub`)
            sourceRepoExistsAndHasCode = true
          }
        } catch (repoError: any) {
          console.error('[Remix] Error creating source repo or pushing code:', repoError)
          sourceRepoExistsAndHasCode = false
        }
      }
    }

    // Create GitHub repository for the remixed project
    let forkRepoCreated = false

    if (process.env.GITHUB_TOKEN) {
      try {
        await octokit.repos.createInOrg({
          org: owner,
          name: repositoryName,
          description: `Remix of ${sourceProject.title}`,
          private: true,
          auto_init: false,
        })
        console.log(`[Remix] Created GitHub repository: ${repositoryName}`)
        forkRepoCreated = true
      } catch (repoError: any) {
        if (repoError.status === 422 && repoError.message?.includes('name already exists')) {
          console.log(`[Remix] Repository ${repositoryName} already exists, continuing...`)
          forkRepoCreated = true
        } else {
          console.error('[Remix] Error creating GitHub repository:', repoError)
        }
      }
    }

    // Clone code from source project
    let codeCloned = false

    // Option 1: Clone from source GitHub repo if it exists and has code
    if (sourceRepoExistsAndHasCode && forkRepoCreated) {
      try {
        console.log(`[Remix] Cloning from GitHub repo: ${owner}/${sourceProject.githubRepo}`)

        const cloneScript = `#!/bin/bash
set -e

cd /home/user/app

# Configure git
git config --global user.name "Capsule User"
git config --global user.email "user@capsule.dev"

# Clone from source repository
echo "Attempting to clone repository..."
git clone https://${process.env.GITHUB_TOKEN}@github.com/${owner}/${sourceProject.githubRepo}.git temp-clone || {
  echo "ERROR: Failed to clone source repository"
  exit 1
}

# Verify clone was successful
if [ ! -d "temp-clone" ]; then
  echo "ERROR: Clone directory not found"
  exit 1
fi

# Count files in cloned repo (excluding .git)
FILE_COUNT=$(find temp-clone -type f ! -path "*/\\.git/*" | wc -l)
echo "Cloned $FILE_COUNT files from source repository"

if [ "$FILE_COUNT" -lt 1 ]; then
  echo "ERROR: No files found in cloned repository"
  exit 1
fi

# Copy files from cloned repo
echo "Copying files..."
cp -r temp-clone/* . || true
cp -r temp-clone/.* . 2>/dev/null || true

# Clean up
rm -rf temp-clone

# Remove old git history
rm -rf .git

# Initialize new git repo
git init
git remote add origin https://${process.env.GITHUB_TOKEN}@github.com/${owner}/${repositoryName}.git

echo "SUCCESS: Cloned and initialized repository"
`

        const result = await sandbox.commands.run(cloneScript, {
          timeoutMs: 90000,
        })

        // Check if clone was successful
        if (result.error || !result.stdout?.includes('SUCCESS')) {
          throw new Error(`Clone failed: ${result.error || result.stderr || 'Unknown error'}`)
        }

        console.log(`[Remix] Successfully cloned code from source project`)
        codeCloned = true

        // Push to new repo
        try {
          const pushScript = `#!/bin/bash
cd /home/user/app
git add .
git commit -m "Remixed from ${sourceProject.title}" || true
git branch -M main
git push -u origin main --force || true
`
          await sandbox.commands.run(pushScript, {
            timeoutMs: 60000,
          })
          console.log(`[Remix] Pushed code to new repository`)
        } catch (pushError) {
          console.error('[Remix] Error pushing to repository:', pushError)
        }
      } catch (error) {
        console.error('[Remix] Error cloning from GitHub:', error)
        codeCloned = false
        // Try direct sandbox copy as fallback
      }
    }

    // Option 2: Copy directly from source sandbox if GitHub clone failed or unavailable
    if (!codeCloned && sourceProject.sandboxId) {
      try {
        console.log(
          `[Remix] Attempting to copy files from source sandbox: ${sourceProject.sandboxId}`
        )

        // Connect to source sandbox
        const sourceSandbox = await Sandbox.connect(sourceProject.sandboxId)

        console.log(`[Remix] Connected to source sandbox`)

        // Create a tarball of the source app directory
        const tarScript = `#!/bin/bash
set -e
cd /home/user
tar -czf app-backup.tar.gz app/
echo "Tarball created"
`
        await sourceSandbox.commands.run(tarScript, { timeoutMs: 30000 })

        // Download the tarball
        console.log(`[Remix] Downloading files from source sandbox...`)
        const fileContent = await sourceSandbox.files.read('/home/user/app-backup.tar.gz')

        // Upload to new sandbox
        console.log(`[Remix] Uploading files to new sandbox...`)
        await sandbox.files.write('/home/user/app-backup.tar.gz', fileContent)

        // Extract the tarball
        const extractScript = `#!/bin/bash
set -e
cd /home/user
tar -xzf app-backup.tar.gz
rm app-backup.tar.gz

# Count files
FILE_COUNT=$(find app -type f | wc -l)
echo "Extracted $FILE_COUNT files"

if [ "$FILE_COUNT" -lt 1 ]; then
  echo "ERROR: No files found after extraction"
  exit 1
fi

cd app

# Remove the source project's git history so the remixed project
# starts with a clean repository. Without this, the source .git
# directory (included in the tarball) keeps the wrong remote URL,
# causing subsequent git commits to target the source project's repo.
rm -rf .git
git init
echo "SUCCESS: Files copied successfully"
`
        const result = await sandbox.commands.run(extractScript, {
          timeoutMs: 30000,
        })

        if (result.error || !result.stdout?.includes('SUCCESS')) {
          throw new Error(
            `Extraction failed: ${result.error || result.stderr || 'Unknown error'}`
          )
        }

        console.log(`[Remix] Successfully copied files from source sandbox`)
        codeCloned = true

        // Create GitHub repo for the remixed project
        if (process.env.GITHUB_TOKEN) {
          try {
            await octokit.repos.createInOrg({
              org: owner,
              name: repositoryName,
              description: `Remix of ${sourceProject.title}`,
              private: true,
              auto_init: false,
            })
            console.log(`[Remix] Created GitHub repository: ${repositoryName}`)

            // Initialize git and push
            const pushScript = `#!/bin/bash
cd /home/user/app
git config --global user.name "Capsule User"
git config --global user.email "user@capsule.dev"
git remote add origin https://${process.env.GITHUB_TOKEN}@github.com/${owner}/${repositoryName}.git || true
git add .
git commit -m "Remixed from ${sourceProject.title}" || true
git branch -M main
git push -u origin main --force || true
`
            await sandbox.commands.run(pushScript, { timeoutMs: 60000 })
            console.log(`[Remix] Pushed code to GitHub`)
          } catch (repoError: any) {
            console.error('[Remix] Error with GitHub repo:', repoError)
            // Non-critical
          }
        }
      } catch (error) {
        console.error('[Remix] Error copying from source sandbox:', error)
        codeCloned = false
      }
    }

    if (!codeCloned) {
      console.warn('[Remix] Could not clone code - will use fresh template instead')
    }

    // Setup Convex for remixed project if source project had Convex enabled
    // This provisions a NEW Convex project, stores credentials, and starts the dev server
    try {
      console.log('[Remix] Setting up Convex for remixed project...')
      await setupConvexForRemix(
        {
          projectId: newProject.id,
          userId: userId,
          sandbox,
          appName: sourceProject.title || 'remix',
          sourceProjectId: sourceProject.id,
        },
        db,
        projects,
        convexProjectCredentials
      )
    } catch (error) {
      console.error('[Remix] Failed to setup Convex:', error)
      // Don't fail the remix if Convex setup fails
    }

    // Start the Expo server (try even if code wasn't cloned - fresh template should work)
    let serverUrls: { sandboxUrl?: string; ngrokUrl?: string } = {}
    try {
      console.log(`[Remix] Starting Expo server for remixed project`)

      await startExpoServer(sandbox, newProject.id)

      // startExpoServer already updates the database with URLs and serverReady
      // Just update the serverStatus
      await db
        .update(projects)
        .set({
          serverStatus: 'running',
          updatedAt: new Date(),
        })
        .where(eq(projects.id, newProject.id))

      console.log(`[Remix] Expo server started successfully`)

      // Fetch the updated project to get the URLs that startExpoServer set
      const updatedProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.id, newProject.id))
        .limit(1)

      if (updatedProjects.length > 0) {
        const updatedProject = updatedProjects[0]
        serverUrls = {
          sandboxUrl: updatedProject.sandboxUrl || undefined,
          ngrokUrl: updatedProject.ngrokUrl || undefined,
        }
        console.log(`[Remix] Retrieved URLs from database:`, serverUrls)
      }
    } catch (error) {
      console.error('[Remix] Failed to start Expo server:', error)
      // Non-critical, but log the issue - user can restart server manually
    }

    // Return response with warnings if there were issues
    const response: RemixResponse = {
      success: true,
      projectId: newProject.id,
      sandboxId: sandbox.sandboxId,
      message: 'Project remixed successfully',
      codeCloned,
      ...serverUrls, // Include the URLs in the response (may be empty if server failed)
    }

    // Add warnings for any issues
    const warnings: string[] = []

    if (!codeCloned) {
      warnings.push('Code could not be cloned from source project. Starting with fresh template.')
      console.warn(`[Remix] Warning: Code was not cloned for project ${newProject.id}`)
    }

    if (!serverUrls.sandboxUrl && !serverUrls.ngrokUrl) {
      warnings.push('Server did not start automatically. You may need to restart it manually.')
      console.warn(`[Remix] Warning: No server URLs available for project ${newProject.id}`)
    }

    if (warnings.length > 0) {
      response.warning = warnings.join(' ')
      response.warnings = warnings
    }

    console.log(`[Remix] Returning response:`, response)

    return { success: true, data: response }
  } catch (error) {
    console.error('[Remix] Error in fork API:', error)
    return {
      success: false,
      error: {
        error: 'Failed to remix project',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      status: 500,
    }
  }
}
