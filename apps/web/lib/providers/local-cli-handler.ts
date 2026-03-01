/**
 * Local CLI Handler
 *
 * Handles Claude Code generation when CLAUDE_PROVIDER=local-cli.
 *
 * This is the local-mode counterpart of claude-code-handler.ts.
 * It skips all E2B sandbox logic and instead:
 *   1. Loads the project record from the database (for session ID resumption).
 *   2. Resolves the project's local working directory.
 *   3. Delegates to LocalCLIProvider, which spawns `claude -p ...` as a subprocess.
 *   4. On completion, persists the new session ID back to the database.
 *
 * ## What is intentionally NOT done in local-cli mode
 *
 *   - No sandbox creation / connection (skips E2B entirely).
 *   - No skill file writing via sandbox.files.write() — skills are written to the
 *     local filesystem directly by LocalCLIProvider.writeSkillFiles().
 *   - No static bundle build (bundle building is sandbox-specific).
 *   - No GitHub commit triggering (add separately if needed).
 *   - No usage tracking by token count (tokens aren't exposed by the CLI).
 *     Code-generation tracking is still done so the usage dashboard remains useful.
 */

import { db } from '@/lib/db'
import { projects } from '@react-native-vibe-code/database'
import { eq, and } from 'drizzle-orm'
import { UsageTracker } from '@/lib/usage-tracking'
import { LocalCLIProvider } from './local-cli-provider'
import type { ClaudeCodeHandlerRequest, ClaudeCodeStreamCallbacks } from '../claude-code-handler'
import type { ProviderGenerationRequest } from './types'

const provider = new LocalCLIProvider()

/**
 * Entry point for local-cli mode — mirrors the signature of
 * handleClaudeCodeGeneration() so the chat route can call either transparently.
 */
export async function handleLocalCLIGeneration(
  request: ClaudeCodeHandlerRequest,
  callbacks: ClaudeCodeStreamCallbacks,
): Promise<void> {
  console.log('[LocalCLI Handler] Starting generation:', {
    projectId: request.projectId,
    userID: request.userID,
    messageLength: request.userMessage.length,
    messageId: request.messageId,
  })

  if (!request.userID) {
    callbacks.onError('User ID is required')
    return
  }

  if (!request.projectId) {
    callbacks.onError('Project ID is required')
    return
  }

  // Check that the CLI is actually available before proceeding
  const available = await provider.isAvailable()
  if (!available) {
    callbacks.onError(
      'Claude CLI not found or not installed. ' +
        'Install it from https://claude.ai/download and run "claude login" to authenticate. ' +
        'To use cloud sandboxes instead, set CLAUDE_PROVIDER=sandboxed.',
    )
    return
  }

  // Load project record from database to get the session ID for multi-turn resumption
  let project: any = null
  try {
    const rows = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, request.projectId),
          eq(projects.userId, request.userID),
        ),
      )
      .limit(1)
    project = rows[0] ?? null
  } catch (err) {
    console.error('[LocalCLI Handler] Failed to load project:', err)
    // Non-fatal — proceed without session resumption
  }

  if (!project) {
    console.warn('[LocalCLI Handler] Project not found in database — starting fresh conversation')
  }

  const generationRequest: ProviderGenerationRequest = {
    userMessage: request.userMessage,
    messageId: request.messageId,
    projectId: request.projectId,
    userId: request.userID,
    isFirstMessage: request.isFirstMessage,
    images: request.images,
    imageAttachments: request.imageAttachments,
    fileEdition: request.fileEdition,
    selectionData: request.selectionData,
    sessionId: request.conversationId || project?.conversationId || undefined,
    claudeModel: request.claudeModel,
    skills: request.skills,
  }

  await provider.generate(generationRequest, {
    onMessage: callbacks.onMessage,

    onComplete: async (result) => {
      // Track code generation for billing dashboard (no token data in local mode)
      try {
        await UsageTracker.trackCodeGeneration(
          request.userID,
          request.projectId,
          result.filesModified?.length ?? 0,
          0, // token count unknown in local-cli mode
        )
      } catch (err) {
        console.error('[LocalCLI Handler] Failed to track usage:', err)
      }

      // Persist the new session ID so the next turn can resume the conversation
      if (result.conversationId && project) {
        try {
          console.log('[LocalCLI Handler] Saving session ID:', result.conversationId)
          await db
            .update(projects)
            .set({ conversationId: result.conversationId, updatedAt: new Date() })
            .where(eq(projects.id, request.projectId))
        } catch (err) {
          console.error('[LocalCLI Handler] Failed to save session ID:', err)
        }
      }

      callbacks.onComplete({
        success: result.success,
        type: 'completion',
        projectId: request.projectId,
        projectTitle: project?.title ?? 'Local Project',
        // In local mode there's no sandbox — the user runs the app locally
        url: result.previewUrl ?? 'http://localhost:8081',
        summary: result.summary,
        filesModified: result.filesModified,
        conversationId: result.conversationId,
        provider: 'local-cli',
      })
    },

    onError: (error) => {
      console.error('[LocalCLI Handler] Provider error:', error)
      callbacks.onError(error)
    },
  })
}
