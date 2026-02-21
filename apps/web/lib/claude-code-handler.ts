import { ClaudeCodeService } from '@/lib/claude-code-service'
import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { UsageTracker } from '@/lib/usage-tracking'
import { Sandbox } from '@e2b/code-interpreter'
import { eq, and } from 'drizzle-orm'
import { getSkillTemplate, getSkillFilePath } from '@/lib/skills/templates'
import { validateSkillIds } from '@/lib/skills'
import { isLocalCLIMode } from '@/lib/providers/factory'
import { handleLocalCLIGeneration } from '@/lib/providers/local-cli-handler'

export interface ClaudeCodeHandlerRequest {
  userMessage: string
  messageId?: string
  projectId: string
  userID: string
  teamID?: string
  isFirstMessage?: boolean
  images?: string[]
  imageAttachments?: Array<{ url: string; contentType: string; name: string; size: number }>
  conversationId?: string
  fileEdition?: string
  selectionData?: any
  sandboxId?: string
  claudeModel?: string
  skills?: string[]
}

export interface ClaudeCodeStreamCallbacks {
  onMessage: (message: string) => void
  onComplete: (result: any) => void
  onError: (error: string) => void
}

/**
 * Handles Claude Code generation by directly invoking the service.
 * This avoids intermediate fetch() calls and their timeout issues.
 *
 * Routes to one of two implementations based on CLAUDE_PROVIDER env var:
 *   - "sandboxed" (default): E2B cloud sandbox + Claude Agent SDK
 *   - "local-cli": locally-installed claude CLI subprocess, no sandbox
 */
export async function handleClaudeCodeGeneration(
  request: ClaudeCodeHandlerRequest,
  callbacks: ClaudeCodeStreamCallbacks
): Promise<void> {
  // Route to the local-cli handler when CLAUDE_PROVIDER=local-cli
  if (isLocalCLIMode()) {
    console.log('[Claude Code Handler] Routing to local-cli provider (CLAUDE_PROVIDER=local-cli)')
    return handleLocalCLIGeneration(request, callbacks)
  }
  console.log('[Claude Code Handler] Called with:', {
    projectId: request.projectId,
    userID: request.userID,
    isFirstMessage: request.isFirstMessage,
    messageLength: request.userMessage.length,
    sandboxId: request.sandboxId,
    messageId: request.messageId || 'no messageId',
    hasImageAttachments: !!request.imageAttachments,
    imageAttachmentsCount: request.imageAttachments?.length || 0,
    imageAttachments: request.imageAttachments,
  })

  if (!request.userID) {
    callbacks.onError('User ID is required')
    return
  }

  if (!request.projectId) {
    callbacks.onError('Project ID is required')
    return
  }

  // Get existing project
  let project: any = null
  let sandbox: Sandbox | null = null

  // Helper function to fetch project from database
  const fetchProject = async () => {
    const existingProjects = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, request.projectId),
          eq(projects.userId, request.userID),
          eq(projects.status, 'active'),
        ),
      )
      .limit(1)
    return existingProjects[0] || null
  }

  try {
    project = await fetchProject()

    if (!project) {
      // Project doesn't exist yet - poll for it (up to 30 seconds)
      console.log('[Claude Code Handler] Project not found, waiting for it to be created...')
      const maxWaitTime = 30000 // 30 seconds
      const pollInterval = 1000 // 1 second
      const startTime = Date.now()

      while (!project && Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval))
        project = await fetchProject()
        if (project) {
          console.log(`[Claude Code Handler] Project found after ${Date.now() - startTime}ms`)
        }
      }

      if (!project) {
        callbacks.onError('Project not found after waiting. Please try again.')
        return
      }
    }

    console.log(
      `[Claude Code Handler] Found project: ${project.id} with sandbox: ${project.sandboxId}`,
    )

    // Get sandboxId - poll if not available yet
    let targetSandboxId = request.sandboxId || project.sandboxId

    if (!targetSandboxId) {
      // Sandbox not ready yet - poll for it (up to 60 seconds)
      console.log('[Claude Code Handler] Sandbox not ready, waiting for container to be created...')
      const maxWaitTime = 60000 // 60 seconds
      const pollInterval = 1500 // 1.5 seconds
      const startTime = Date.now()

      while (!targetSandboxId && Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval))
        project = await fetchProject()
        targetSandboxId = project?.sandboxId
        if (targetSandboxId) {
          console.log(`[Claude Code Handler] Sandbox ready after ${Date.now() - startTime}ms: ${targetSandboxId}`)
        }
      }

      if (!targetSandboxId) {
        callbacks.onError('Container is still being created. Please wait a moment and try again.')
        return
      }
    }

    // Connect to sandbox
    sandbox = await Sandbox.connect(targetSandboxId)
    console.log(`[Claude Code Handler] Connected to sandbox: ${sandbox.sandboxId}`)
  } catch (error) {
    console.error('[Claude Code Handler] Error checking for existing project:', error)
    callbacks.onError('Failed to find project or sandbox')
    return
  }

  try {
    console.log('[Claude Code Handler] Using Claude Code SDK for all operations')
    const claudeCodeService = new ClaudeCodeService()

    // Write skill files to sandbox if skills are selected
    if (request.skills && request.skills.length > 0 && sandbox) {
      console.log('[Claude Code Handler] 📝 Received skill IDs from request:', request.skills)

      // Validate skill IDs
      const invalidSkills = validateSkillIds(request.skills)
      if (invalidSkills.length > 0) {
        console.error('[Claude Code Handler] ❌ Invalid skill IDs received:', invalidSkills)
        console.error('[Claude Code Handler] Valid skill IDs can be found in lib/skills/config.ts')
      }

      const prodUrl = process.env.NEXT_PUBLIC_PROD_URL || 'https://capsulethis.com'

      for (const skillId of request.skills) {
        console.log(`[Claude Code Handler] Processing skill ID: "${skillId}"`)
        const skillContent = getSkillTemplate(skillId, prodUrl)
        if (skillContent) {
          const skillPath = getSkillFilePath(skillId)
          console.log(`[Claude Code Handler] Skill template found, writing to: ${skillPath}`)

          // Extract skill name from template frontmatter for verification
          const nameMatch = skillContent.match(/^name:\s*(.+)$/m)
          const skillName = nameMatch ? nameMatch[1].trim() : 'unknown'
          console.log(`[Claude Code Handler] Skill name from template frontmatter: "${skillName}"`)

          try {
            // Create the directory structure
            const dirPath = skillPath.substring(0, skillPath.lastIndexOf('/'))
            await sandbox.files.makeDir(dirPath)
            // Write the skill file
            await sandbox.files.write(skillPath, skillContent)
            console.log(`[Claude Code Handler] ✅ Written skill "${skillName}" to ${skillPath}`)
          } catch (err) {
            console.error(`[Claude Code Handler] ❌ Error writing skill file ${skillPath}:`, err)
          }
        } else {
          console.error(`[Claude Code Handler] ❌ No template found for skill: ${skillId}`)
        }
      }
    }

    console.log('[Claude Code Handler] before generateApp')

    // Stream the app generation process
    await claudeCodeService.generateAppStreaming(
      {
        userMessage: request.userMessage,
        messageId: request.messageId,
        projectId: request.projectId,
        userId: request.userID,
        isFirstMessage: request.isFirstMessage,
        images: request.images,
        imageAttachments: request.imageAttachments,
        fileEdition: request.fileEdition,
        selectionData: request.selectionData,
        sessionId: project.conversationId || undefined, // Pass session ID for resumption
        claudeModel: request.claudeModel,
        skills: request.skills,
      },
      sandbox,
      {
        onMessage: callbacks.onMessage,
        onComplete: async (result: any) => {
          // Track usage for billing
          const estimatedTokens = Math.ceil(request.userMessage.length / 4) + 1000
          try {
            await UsageTracker.trackTokenUsage(
              request.userID,
              estimatedTokens,
              'claude-3-5-sonnet',
              request.projectId,
            )

            await UsageTracker.trackCodeGeneration(
              request.userID,
              request.projectId,
              result.filesModified?.length || 0,
              estimatedTokens,
            )
          } catch (error) {
            console.error('[Claude Code Handler] Failed to track usage:', error)
          }

          // Save session ID to database for resumption
          if (result.conversationId && project) {
            try {
              console.log('[Claude Code Handler] Saving session ID to database:', result.conversationId)
              await db.update(projects)
                .set({
                  conversationId: result.conversationId,
                  updatedAt: new Date(),
                })
                .where(eq(projects.id, request.projectId))
            } catch (error) {
              console.error('[Claude Code Handler] Failed to save session ID:', error)
            }
          }

          // Trigger static bundle build for mobile app (async, don't wait)
          if (sandbox && project) {
            try {
              console.log('[Claude Code Handler] Triggering static bundle build for mobile...')

              // Import dynamically to avoid circular dependencies
              const { buildStaticBundle, getLatestCommitSHA } = await import('@/lib/bundle-builder')

              // Get commit SHA
              const commitId = await getLatestCommitSHA(sandbox)

              // Trigger bundle build in background (don't await)
              buildStaticBundle(
                sandbox.sandboxId,
                request.projectId,
                commitId,
                request.userMessage
              ).then((buildResult) => {
                if (buildResult.success) {
                  console.log('[Claude Code Handler] Static bundle built successfully:', buildResult.manifestUrl)
                } else {
                  console.error('[Claude Code Handler] Static bundle build failed:', buildResult.error)
                }
              }).catch((error) => {
                console.error('[Claude Code Handler] Error building static bundle:', error)
              })
            } catch (error) {
              console.error('[Claude Code Handler] Failed to trigger bundle build:', error)
              // Don't fail the whole request if bundle build fails
            }
          }

          const finalResult = {
            success: true,
            type: 'completion',
            sbxId: sandbox!.sandboxId,
            projectId: project!.id,
            projectTitle: project!.title,
            template: project!.template || 'react-native-expo',
            url: `https://${sandbox!.getHost(8081)}`,
            summary: result.summary,
            filesModified: result.filesModified,
            conversationId: result.conversationId,
          }

          callbacks.onComplete(finalResult)
        },
        onError: (error: string) => {
          console.error('[Claude Code Handler] Stream error received from service:', {
            error,
            projectId: request.projectId,
            userID: request.userID,
            sandboxId: sandbox?.sandboxId,
            timestamp: new Date().toISOString(),
          })
          callbacks.onError(error)
        },
      },
    )
  } catch (error) {
    console.error('==================== CLAUDE CODE HANDLER ERROR ====================')
    console.error('[Claude Code Handler] Error:', {
      errorType: error?.constructor?.name,
      errorMessage: error instanceof Error ? error.message : 'Internal server error',
      errorStack: error instanceof Error ? error.stack : undefined,
      projectId: request.projectId,
      userID: request.userID,
      sandboxId: sandbox?.sandboxId,
      timestamp: new Date().toISOString(),
    })
    console.error('===================================================================')

    callbacks.onError(error instanceof Error ? error.message : 'Internal server error')
  }
}
