// Commit types
export interface Commit {
  hash: string
  shortHash: string
  message: string
  displayMessage?: string
  author: string
  email: string
  date: string
  timestamp: string
  messageId?: string
}

// Git Commits API types
export interface GitCommitsRequest {
  projectId: string
  userID: string
  sandboxId: string
}

export interface GitCommitsResponse {
  success: boolean
  commits: Commit[]
  projectId?: string
  sandboxId?: string
  message?: string
  error?: string
  details?: string
}

// Git Restore API types
export interface GitRestoreRequest {
  projectId: string
  userID: string
  messageId: string
  sandboxId: string
}

export interface GitRestoreResponse {
  success: boolean
  message: string
  messageId: string
  branchName: string
  currentCommit: string
  currentBranch: string
  projectId: string
  sandboxId: string
  serverRestarted: boolean
  serverUrl?: string
  ngrokUrl?: string
  cacheCleared: boolean
  filesRefreshed: boolean
  messagesDeleted: boolean
  deletedMessagesCount: number
  shouldReloadChat: boolean
  shouldRefreshPreview: boolean
  error?: string
  details?: string
}

// GitHub Commit API types
export interface GitHubCommitRequest {
  sandboxId: string
  projectId: string
  userMessage: string
  messageId?: string
  executionFailed?: boolean
}

export interface GitHubCommitResponse {
  success: boolean
  skipped?: boolean
  message?: string
  repository?: string
  commitMessage?: string
  error?: string
}

// GitHub Service types
export interface GitHubConfig {
  owner: string
  token: string
}

export interface GitHubServiceOptions {
  owner: string
  token: string
}

// Server restart result
export interface ServerRestartResult {
  url: string
  serverReady: boolean
  ngrokUrl?: string
}

// Project type (minimal for restore)
export interface RestoreProject {
  id: string
  userId: string
  sandboxId: string | null
  chatId: string | null
  sandboxUrl: string | null
  ngrokUrl: string | null
  status: 'active' | 'archived' | 'deleted'
}

// History Panel props
export interface HistoryPanelProps {
  projectId?: string
  sandboxId?: string
  userId?: string
  onChatReload?: () => Promise<void>
  onPreviewRefresh?: (urls: { url: string; ngrokUrl?: string }) => void
}

// Restore Confirmation Modal props
export interface RestoreConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commit: Commit | null
  onConfirm: (commit: Commit) => Promise<void>
}

// Hook return types
export interface UseCommitHistoryResult {
  commits: Commit[]
  error: Error | null
  isLoading: boolean
  isFetching: boolean
  refetch: () => Promise<void>
}

export interface UseRestoreCommitOptions {
  projectId?: string
  sandboxId?: string
  userId?: string
  onChatReload?: () => Promise<void>
  onPreviewRefresh?: (urls: { url: string; ngrokUrl?: string }) => void
}

export interface UseRestoreCommitResult {
  restoreCommit: (commit: Commit) => Promise<void>
  isRestoring: boolean
  error: Error | null
}
