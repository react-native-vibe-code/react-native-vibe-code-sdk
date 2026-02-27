/**
 * E2B Sandbox Provider
 *
 * Adapter that wraps @e2b/code-interpreter Sandbox to implement ISandbox.
 * This is the default provider.
 */

import { Sandbox } from '@e2b/code-interpreter'
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

class E2BSandboxFiles implements ISandboxFiles {
  constructor(private sandbox: Sandbox) {}

  async write(path: string, content: string): Promise<void> {
    await this.sandbox.files.write(path, content)
  }

  async read(path: string): Promise<string> {
    return this.sandbox.files.read(path)
  }

  async exists(path: string): Promise<boolean> {
    return this.sandbox.files.exists(path)
  }

  async makeDir(path: string): Promise<void> {
    await this.sandbox.files.makeDir(path)
  }

  async watchDir(
    path: string,
    callback: (event: FileWatchEvent) => void,
    options?: WatchOptions,
  ): Promise<WatchHandle> {
    // E2B native file watching
    const handle = await this.sandbox.files.watchDir(
      path,
      callback as any,
      options as any,
    )
    return handle as unknown as WatchHandle
  }
}

class E2BSandboxCommands implements ISandboxCommands {
  constructor(private sandbox: Sandbox) {}

  async run(command: string, options?: CommandOptions): Promise<CommandResult> {
    const result = await this.sandbox.commands.run(command, options as any)
    return {
      stdout: (result as any).stdout ?? '',
      stderr: (result as any).stderr ?? '',
      exitCode: (result as any).exitCode ?? 0,
    }
  }
}

class E2BSandboxInstance implements ISandbox {
  readonly files: E2BSandboxFiles
  readonly commands: E2BSandboxCommands

  constructor(private _sandbox: Sandbox) {
    this.files = new E2BSandboxFiles(_sandbox)
    this.commands = new E2BSandboxCommands(_sandbox)
  }

  get sandboxId(): string {
    return this._sandbox.sandboxId
  }

  getHost(port: number): string {
    return this._sandbox.getHost(port)
  }

  async getPreviewUrl(port: number): Promise<string> {
    return `https://${this._sandbox.getHost(port)}`
  }

  async setTimeout(ms: number): Promise<void> {
    await this._sandbox.setTimeout(ms)
  }

  async close(): Promise<void> {
    await this._sandbox.close()
  }
}

export class E2BProvider implements ISandboxProvider {
  async create(config: SandboxCreateConfig): Promise<ISandbox> {
    if (!config.templateId) {
      throw new Error('[E2BProvider] templateId is required to create an E2B sandbox')
    }

    const sandbox = await Sandbox.create(config.templateId, {
      metadata: config.metadata,
      timeoutMs: config.timeoutMs,
      envs: config.envs,
    } as any)

    console.log(`[E2BProvider] Created sandbox: ${sandbox.sandboxId}`)
    return new E2BSandboxInstance(sandbox)
  }

  async connect(sandboxId: string): Promise<ISandbox> {
    const sandbox = await Sandbox.connect(sandboxId)
    console.log(`[E2BProvider] Connected to sandbox: ${sandbox.sandboxId}`)
    return new E2BSandboxInstance(sandbox)
  }
}
