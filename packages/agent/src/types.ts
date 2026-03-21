import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

/**
 * Arguments passed to the agent executor via CLI
 */
export interface ExecutorArgs {
  /** The user prompt to execute */
  prompt: string
  /** Optional system prompt to append to Claude Code preset */
  systemPrompt?: string
  /** Working directory for the agent */
  cwd?: string
  /** Model to use (e.g., claude-opus-4-5-20251101, claude-sonnet-4-5-20250929) */
  model?: string
  /** Array of image URLs to attach to the prompt */
  imageUrls?: string[]
  /** Session ID to resume a previous conversation */
  sessionId?: string
}

/**
 * Configuration for the agent executor
 */
export interface ExecutorConfig {
  /** Default working directory if not specified in args */
  defaultCwd?: string
  /** Path to .env file for loading environment variables */
  envPath?: string
  /** Directory to store downloaded images */
  imagesDir?: string
  /** Heartbeat interval in milliseconds (default: 30000) */
  heartbeatInterval?: number
}

/**
 * Hook function type for session events
 */
export type SessionHook = (
  input: { hook_event_name: string; cwd: string },
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<{ continue: boolean }>

/**
 * Hooks configuration for the agent
 */
export interface ExecutorHooks {
  /** Hooks to run when the session ends */
  onSessionEnd?: SessionHook[]
  /** Hooks to run after a tool is used (e.g., after Write/Edit) */
  onPostToolUse?: SessionHook[]
}

/**
 * Result from the executor run
 */
export interface ExecutorResult {
  success: boolean
  messages: SDKMessage[]
  error?: string
}

/**
 * Options for running the executor
 */
export interface RunOptions {
  args: ExecutorArgs
  config?: ExecutorConfig
  hooks?: ExecutorHooks
}

export type { SDKMessage }
