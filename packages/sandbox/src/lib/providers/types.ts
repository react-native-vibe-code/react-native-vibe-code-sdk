/**
 * Sandbox Provider Abstraction Layer
 *
 * Defines the unified interface for sandbox providers (E2B, Daytona, etc.)
 * Provider is selected via the SANDBOX_PROVIDER environment variable:
 *   - 'e2b' (default): Uses @e2b/code-interpreter
 *   - 'daytona': Uses @daytonaio/sdk
 */

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  /** Stop a background command (only available for background commands) */
  stop?: () => Promise<void>
}

export interface CommandOptions {
  timeoutMs?: number
  requestTimeoutMs?: number
  /** Run command in background mode (non-blocking) */
  background?: boolean
  /** Environment variables to set for the command */
  envs?: Record<string, string>
  onStdout?: (data: string) => void
  onStderr?: (data: string) => void
}

export interface FileWatchEvent {
  name?: string
  path?: string
  filename?: string
  type?: string
  eventType?: string
  operation?: string
}

export interface WatchOptions {
  recursive?: boolean
  timeoutMs?: number
}

export interface WatchHandle {
  stop: () => void | Promise<void>
  type?: string
}

export interface ISandboxFiles {
  write(path: string, content: string): Promise<void>
  read(path: string): Promise<string>
  exists(path: string): Promise<boolean>
  makeDir(path: string): Promise<void>
  /** Native file watching (may not be available on all providers - falls back to polling) */
  watchDir?(
    path: string,
    callback: (event: FileWatchEvent) => void,
    options?: WatchOptions,
  ): Promise<WatchHandle>
}

export interface ISandboxCommands {
  run(command: string, options?: CommandOptions): Promise<CommandResult>
}

/**
 * Unified sandbox interface that all providers must implement.
 * Mirrors the E2B Sandbox API for backwards compatibility.
 */
export interface ISandbox {
  /** Unique sandbox/workspace identifier */
  readonly sandboxId: string
  readonly files: ISandboxFiles
  readonly commands: ISandboxCommands
  /**
   * Get the public hostname for a port (sync).
   * For async preview URL resolution use getPreviewUrl() if available.
   */
  getHost(port: number): string
  /** Get public preview URL for a port (may be async for some providers) */
  getPreviewUrl?(port: number): Promise<string>
  /** Set sandbox inactivity timeout in milliseconds */
  setTimeout(ms: number): Promise<void>
  /** Optional: close/cleanup the sandbox connection */
  close?(): Promise<void>
}

export interface SandboxCreateConfig {
  /** E2B template ID (used by E2B provider) */
  templateId?: string
  /** Docker image name (used by Daytona provider) */
  image?: string
  /** Key-value metadata/labels attached to the sandbox */
  metadata?: Record<string, string>
  /** Inactivity timeout in milliseconds */
  timeoutMs?: number
  /** Environment variables to set in the sandbox */
  envs?: Record<string, string>
}

/**
 * Interface for sandbox provider implementations.
 */
export interface ISandboxProvider {
  /** Create a new sandbox instance */
  create(config: SandboxCreateConfig): Promise<ISandbox>
  /** Connect to an existing sandbox by ID */
  connect(sandboxId: string): Promise<ISandbox>
}

/** Supported sandbox provider names */
export type SandboxProviderName = 'e2b' | 'daytona'
