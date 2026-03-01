/**
 * Provider Abstraction Layer
 *
 * Defines interfaces for AI code generation providers. Two modes are supported:
 *
 * - `sandboxed` (default): Runs Claude Agent SDK inside an E2B cloud sandbox.
 *   Suitable for cloud-hosted deployments. Requires ANTHROPIC_API_KEY and E2B_API_KEY.
 *
 * - `local-cli`: Spawns the locally-installed `claude` CLI as a subprocess using
 *   `claude -p "<prompt>" --output-format stream-json`. No sandbox required.
 *   Suitable for local development. Requires a local Claude CLI installation and
 *   an active Claude CLI session (`claude login`). No ANTHROPIC_API_KEY needed.
 *
 * Set the active mode via the CLAUDE_PROVIDER environment variable.
 */

export type ProviderMode = 'sandboxed' | 'local-cli'

/**
 * Incoming request to generate code/text via an AI provider.
 */
export interface ProviderGenerationRequest {
  userMessage: string
  messageId?: string
  projectId: string
  userId: string
  isFirstMessage?: boolean
  images?: string[]
  imageAttachments?: Array<{
    url: string
    contentType: string
    name: string
    size: number
  }>
  fileEdition?: string
  selectionData?: any
  /** Claude SDK session ID for multi-turn conversation resumption */
  sessionId?: string
  /** Model identifier (e.g. 'claude-sonnet-4-5-20250929') */
  claudeModel?: string
  /** Selected skill IDs (e.g. 'anthropic-chat', 'openai-dalle-3') */
  skills?: string[]
  /**
   * Absolute path to the local project directory.
   * Only used by LocalCLIProvider — ignored by SandboxedProvider.
   */
  localProjectPath?: string
}

/**
 * Streaming callbacks used by all providers.
 */
export interface ProviderCallbacks {
  /**
   * Called for each chunk of content as it is streamed.
   * May be a raw JSON string (SDK message) or plain text.
   */
  onMessage: (message: string) => void
  /**
   * Called once when the generation completes successfully.
   */
  onComplete: (result: ProviderCompletionResult) => void
  /**
   * Called if an unrecoverable error occurs.
   */
  onError: (error: string) => void
}

/**
 * Result object passed to onComplete when generation finishes.
 */
export interface ProviderCompletionResult {
  success: boolean
  /** Claude SDK session ID captured from the stream — used to resume multi-turn conversations */
  conversationId?: string
  summary: string
  filesModified?: Array<{
    path: string
    action: 'created' | 'modified' | 'deleted'
    content?: string
  }>
  /**
   * For sandboxed mode: the E2B sandbox ID.
   * For local-cli mode: undefined.
   */
  sandboxId?: string
  /**
   * For sandboxed mode: the preview URL (e.g. https://<sandbox>.e2b.app:8081).
   * For local-cli mode: the local dev server URL (e.g. http://localhost:8081).
   */
  previewUrl?: string
}

/**
 * Core interface that all AI providers must implement.
 */
export interface AIProvider {
  /** Human-readable provider name */
  readonly name: string
  /** The mode this provider operates in */
  readonly mode: ProviderMode
  /**
   * Run code generation, streaming results via callbacks.
   * Implementations must call exactly one of onComplete or onError before resolving.
   */
  generate(
    request: ProviderGenerationRequest,
    callbacks: ProviderCallbacks,
  ): Promise<void>
  /**
   * Returns true if the provider is ready to handle requests
   * (e.g. CLI installed, API key present, sandbox reachable).
   */
  isAvailable(): Promise<boolean>
}
