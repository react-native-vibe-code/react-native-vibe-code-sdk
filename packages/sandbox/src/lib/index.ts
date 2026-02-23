// Sandbox library exports

// Provider abstraction layer
export {
  getSandboxProvider,
  resetSandboxProvider,
  E2BProvider,
  DaytonaProvider,
  type ISandbox,
  type ISandboxFiles,
  type ISandboxCommands,
  type ISandboxProvider,
  type SandboxCreateConfig,
  type CommandResult,
  type CommandOptions,
  type FileWatchEvent,
  type WatchHandle,
  type WatchOptions,
  type SandboxProviderName,
} from './providers'

// File watcher
export {
  SandboxFileWatcher,
  globalFileWatcher,
  type FileChangeEvent,
} from './sandbox-file-watcher'

// GitHub service
export { GitHubService, type GitHubConfig } from './github-service'

// Error tracking (re-exported from @react-native-vibe-code/error-manager for backwards compatibility)
export {
  ErrorTracker,
  extractErrorDetails,
} from '@react-native-vibe-code/error-manager/server'
export type { SandboxErrorContext } from '@react-native-vibe-code/error-manager/shared'

// Bundle builder
export {
  buildStaticBundle,
  getLatestCommitSHA,
} from './bundle-builder'

// Manifest generation
export {
  generateManifest,
  validateManifest,
} from './generate-manifest'

// Server utilities
export { startExpoServer } from './server-utils'
