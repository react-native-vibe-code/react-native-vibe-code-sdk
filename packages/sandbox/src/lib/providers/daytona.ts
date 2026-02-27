/**
 * Daytona Sandbox Provider
 *
 * Adapter that wraps @daytonaio/sdk Workspace to implement ISandbox.
 * Enable by setting SANDBOX_PROVIDER=daytona in your .env file.
 *
 * Required environment variables:
 *   - DAYTONA_API_KEY: Your Daytona API key
 *   - DAYTONA_SERVER_URL: Your Daytona server URL (e.g., https://app.daytona.io)
 *
 * Optional environment variables:
 *   - DAYTONA_IMAGE: Default Docker image (e.g., ubuntu:22.04)
 *   - DAYTONA_TARGET: Target runner (e.g., 'local', 'us')
 *
 * Daytona docs: https://www.daytona.io/docs/
 */

import type {
  ISandbox,
  ISandboxFiles,
  ISandboxCommands,
  ISandboxProvider,
  SandboxCreateConfig,
  CommandOptions,
  CommandResult,
  FileWatchEvent,
  WatchHandle,
  WatchOptions,
} from './types'

// Lazily import Daytona SDK to avoid errors when not using Daytona provider
let DaytonaSDK: any = null
async function getDaytonaSDK() {
  if (!DaytonaSDK) {
    try {
      DaytonaSDK = await import('@daytonaio/sdk')
    } catch {
      throw new Error(
        '[DaytonaProvider] @daytonaio/sdk is not installed. Run: pnpm add @daytonaio/sdk --filter @react-native-vibe-code/sandbox',
      )
    }
  }
  return DaytonaSDK
}

class DaytonaSandboxFiles implements ISandboxFiles {
  constructor(private workspace: any) {}

  async write(path: string, content: string): Promise<void> {
    try {
      const contentBuffer = Buffer.from(content, 'utf-8')
      // Daytona filesystem.uploadFile expects a File object
      const file = new File([contentBuffer], path.split('/').pop() ?? 'file', {
        type: 'text/plain',
      })
      await this.workspace.filesystem.uploadFile(file, path)
    } catch (error) {
      console.error(`[DaytonaSandboxFiles] Error writing file ${path}:`, error)
      throw error
    }
  }

  async read(path: string): Promise<string> {
    try {
      const content = await this.workspace.filesystem.downloadFile(path)
      if (Buffer.isBuffer(content)) {
        return content.toString('utf-8')
      }
      if (content instanceof Uint8Array) {
        return Buffer.from(content).toString('utf-8')
      }
      return String(content)
    } catch (error) {
      console.error(`[DaytonaSandboxFiles] Error reading file ${path}:`, error)
      throw error
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.workspace.filesystem.downloadFile(path)
      return true
    } catch {
      // File or folder doesn't exist
      return false
    }
  }

  async makeDir(path: string): Promise<void> {
    try {
      await this.workspace.filesystem.createFolder(path, '0755')
    } catch (error) {
      // Ignore "already exists" errors
      const msg = error instanceof Error ? error.message : String(error)
      if (!msg.includes('exists') && !msg.includes('exist')) {
        console.error(`[DaytonaSandboxFiles] Error creating directory ${path}:`, error)
        throw error
      }
    }
  }

  /**
   * Daytona does not have native file watching. Returns undefined so that
   * SandboxFileWatcher falls back to its polling implementation.
   */
  watchDir?(
    _path: string,
    _callback: (event: FileWatchEvent) => void,
    _options?: WatchOptions,
  ): Promise<WatchHandle> {
    // Return undefined to trigger polling fallback in SandboxFileWatcher
    return undefined as any
  }
}

/**
 * Daytona sandbox commands implementation.
 *
 * Background commands are emulated using Daytona process sessions.
 * Output is streamed by polling session logs at a regular interval.
 */
class DaytonaSandboxCommands implements ISandboxCommands {
  constructor(private workspace: any) {}

  async run(command: string, options?: CommandOptions): Promise<CommandResult> {
    const timeoutSec = options?.timeoutMs
      ? Math.ceil(options.timeoutMs / 1000)
      : undefined

    if (options?.background) {
      return this._runBackground(command, options, timeoutSec)
    }

    return this._runForeground(command, options, timeoutSec)
  }

  private async _runForeground(
    command: string,
    options?: CommandOptions,
    timeoutSec?: number,
  ): Promise<CommandResult> {
    try {
      const execOptions: Record<string, any> = {}
      if (timeoutSec !== undefined) {
        execOptions.timeout = timeoutSec
      }
      if (options?.envs) {
        execOptions.envVars = options.envs
      }

      const response = await this.workspace.process.executeCommand(
        command,
        undefined, // sessionId
        undefined, // executorName
        execOptions,
      )

      const stdout = response.result ?? response.output ?? ''
      const stderr = response.error ?? response.stderr ?? ''
      const exitCode = response.exitCode ?? 0

      if (stdout && options?.onStdout) {
        options.onStdout(stdout)
      }
      if (stderr && options?.onStderr) {
        options.onStderr(stderr)
      }

      return { stdout, stderr, exitCode }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      options?.onStderr?.(msg)
      return { stdout: '', stderr: msg, exitCode: 1 }
    }
  }

  private async _runBackground(
    command: string,
    options?: CommandOptions,
    timeoutSec?: number,
  ): Promise<CommandResult> {
    const sessionId = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let stopped = false
    let pollTimer: NodeJS.Timeout | null = null

    try {
      // Create a dedicated process session
      await this.workspace.process.createSession(sessionId)

      const execOptions: Record<string, any> = {
        timeout: timeoutSec ?? 0, // 0 = no timeout
      }
      if (options?.envs) {
        execOptions.envVars = options.envs
      }

      // Start the command in the session
      const execResult = await this.workspace.process.executeSessionCommand(
        sessionId,
        { command, ...execOptions },
      )

      const commandId = execResult?.commandId ?? execResult?.id

      // Poll for output to simulate streaming
      let lastOffset = 0
      const poll = async () => {
        if (stopped) return
        try {
          const logs = await this.workspace.process.getSessionCommandLogs(
            sessionId,
            commandId,
          )
          const allOutput = logs?.output ?? logs?.result ?? logs ?? ''
          if (typeof allOutput === 'string' && allOutput.length > lastOffset) {
            const newData = allOutput.slice(lastOffset)
            lastOffset = allOutput.length
            if (newData && options?.onStdout) {
              options.onStdout(newData)
            }
          }
        } catch {
          // Ignore polling errors
        }

        if (!stopped) {
          pollTimer = setTimeout(poll, 500)
        }
      }

      // Start polling output
      poll()

      const stopFn = async () => {
        stopped = true
        if (pollTimer) {
          clearTimeout(pollTimer)
          pollTimer = null
        }
        try {
          await this.workspace.process.deleteSession(sessionId)
        } catch {
          // Ignore cleanup errors
        }
      }

      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
        stop: stopFn,
      }
    } catch (error) {
      stopped = true
      if (pollTimer) {
        clearTimeout(pollTimer)
      }
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[DaytonaSandboxCommands] Error starting background command:', error)
      options?.onStderr?.(msg)
      return { stdout: '', stderr: msg, exitCode: 1 }
    }
  }
}

/**
 * Daytona sandbox instance that wraps a Daytona workspace.
 */
class DaytonaSandboxInstance implements ISandbox {
  readonly files: DaytonaSandboxFiles
  readonly commands: DaytonaSandboxCommands
  private _previewHostCache: Map<number, string> = new Map()

  constructor(
    private workspace: any,
    private serverUrl: string,
  ) {
    this.files = new DaytonaSandboxFiles(workspace)
    this.commands = new DaytonaSandboxCommands(workspace)
  }

  get sandboxId(): string {
    return this.workspace.id
  }

  /**
   * Returns a hostname for the given port.
   *
   * Daytona preview URLs follow the pattern:
   *   {port}-{workspaceId}.{daytona-server-host}
   *
   * If cached from a prior async getPreviewUrl() call, that is used.
   * Otherwise, constructs the URL from the workspace ID and server host.
   */
  getHost(port: number): string {
    if (this._previewHostCache.has(port)) {
      return this._previewHostCache.get(port)!
    }

    // Construct a Daytona preview URL from workspace ID and server host
    const serverHost = this.serverUrl
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')

    return `${port}-${this.workspace.id}.${serverHost}`
  }

  /**
   * Async version of getHost - uses Daytona's native getPreviewLink API
   * when available, caching the result for future sync getHost() calls.
   */
  async getPreviewUrl(port: number): Promise<string> {
    try {
      const previewInfo = await this.workspace.getPreviewLink(port)
      const url = previewInfo?.url ?? previewInfo
      if (url) {
        // Cache the hostname for sync getHost() calls
        const host = String(url).replace(/^https?:\/\//, '').split('/')[0]
        this._previewHostCache.set(port, host)
        return String(url).startsWith('http') ? String(url) : `https://${url}`
      }
    } catch (error) {
      console.warn(
        `[DaytonaSandboxInstance] getPreviewLink failed for port ${port}, using constructed URL:`,
        error,
      )
    }
    return `https://${this.getHost(port)}`
  }

  async setTimeout(ms: number): Promise<void> {
    // Daytona uses auto-stop interval in minutes
    const minutes = Math.ceil(ms / 60000)
    try {
      if (typeof this.workspace.setAutostopInterval === 'function') {
        await this.workspace.setAutostopInterval(minutes)
        console.log(`[DaytonaSandboxInstance] Set auto-stop interval to ${minutes} minutes`)
      }
    } catch (error) {
      console.warn('[DaytonaSandboxInstance] Failed to set auto-stop interval:', error)
    }
  }

  async close(): Promise<void> {
    // Daytona workspaces are managed externally; nothing to close per-connection
  }
}

/**
 * Daytona provider implementation.
 */
export class DaytonaProvider implements ISandboxProvider {
  private clientPromise: Promise<any> | null = null

  private async getClient(): Promise<any> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const sdk = await getDaytonaSDK()
        const { Daytona } = sdk

        const config: Record<string, string> = {}
        if (process.env.DAYTONA_API_KEY) {
          config.apiKey = process.env.DAYTONA_API_KEY
        }
        if (process.env.DAYTONA_SERVER_URL) {
          config.serverUrl = process.env.DAYTONA_SERVER_URL
        }

        return new Daytona(Object.keys(config).length > 0 ? config : undefined)
      })()
    }
    return this.clientPromise
  }

  private getServerUrl(): string {
    return (process.env.DAYTONA_SERVER_URL ?? 'https://app.daytona.io')
      .replace(/\/$/, '')
  }

  async create(config: SandboxCreateConfig): Promise<ISandbox> {
    const client = await this.getClient()

    const image =
      config.image ??
      process.env.DAYTONA_IMAGE ??
      'imbios/bun-node:20-slim'

    const createParams: Record<string, any> = {
      image,
      envVars: config.envs ?? {},
      labels: config.metadata ?? {},
      resources: {
        cpu: 4,
        memory: 4096,
      },
    }

    if (config.timeoutMs) {
      createParams.autoStopInterval = Math.ceil(config.timeoutMs / 60000)
    }

    if (process.env.DAYTONA_TARGET) {
      createParams.target = process.env.DAYTONA_TARGET
    }

    console.log('[DaytonaProvider] Creating workspace with image:', image)
    const workspace = await client.create(createParams)
    console.log('[DaytonaProvider] Created workspace:', workspace.id)

    return new DaytonaSandboxInstance(workspace, this.getServerUrl())
  }

  async connect(sandboxId: string): Promise<ISandbox> {
    const client = await this.getClient()

    console.log('[DaytonaProvider] Connecting to workspace:', sandboxId)
    const workspace = await client.get(sandboxId)
    console.log('[DaytonaProvider] Connected to workspace:', workspace.id)

    return new DaytonaSandboxInstance(workspace, this.getServerUrl())
  }
}
