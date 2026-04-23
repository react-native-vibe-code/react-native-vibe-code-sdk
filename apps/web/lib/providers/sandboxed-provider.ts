/**
 * SandboxedClaudeProvider
 *
 * Wraps the existing ClaudeCodeService + E2B sandbox approach as an AIProvider.
 * This is the default/production mode and maintains full backwards compatibility.
 *
 * The transport here is:
 *   Next.js API → ClaudeCodeService.generateAppStreaming()
 *     → E2B sandbox subprocess (claude-executor.ts)
 *       → @anthropic-ai/claude-agent-sdk query()
 *         → stdout "Streaming: {...}" lines piped back via onStdout callback
 */

import type {
  AIProvider,
  ProviderCallbacks,
  ProviderGenerationRequest,
  ProviderMode,
} from './types'

export class SandboxedClaudeProvider implements AIProvider {
  readonly name = 'sandboxed-claude'
  readonly mode: ProviderMode = 'sandboxed'

  // The actual generation logic lives in claude-code-service.ts and is invoked
  // through claude-code-handler.ts. This class exists as a typed wrapper so the
  // factory and handler have a uniform interface.
  //
  // Generation is NOT implemented here — the sandboxed handler
  // (handleClaudeCodeGeneration in claude-code-handler.ts) calls ClaudeCodeService
  // directly because it also needs sandbox lifecycle management (connect, skill
  // file writing, bundle building, etc.) that can't be cleanly separated.
  //
  // The generate() method below is therefore a no-op stub that throws to make
  // mis-use obvious. The handler bypasses this and calls ClaudeCodeService directly.
  async generate(
    _request: ProviderGenerationRequest,
    callbacks: ProviderCallbacks,
  ): Promise<void> {
    callbacks.onError(
      'SandboxedClaudeProvider.generate() should not be called directly. ' +
        'Use handleClaudeCodeGeneration() from claude-code-handler.ts instead.',
    )
  }

  /**
   * Returns true when both required credentials are present.
   * Does NOT attempt a live connection to E2B.
   */
  async isAvailable(): Promise<boolean> {
    return !!(process.env.ANTHROPIC_API_KEY && process.env.E2B_API_KEY)
  }
}
