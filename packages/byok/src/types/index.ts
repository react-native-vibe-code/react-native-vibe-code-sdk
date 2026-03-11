export interface SandboxUsage {
  sessionsUsed: number
  sessionLimit: number
  hoursUsed: number
  hoursLimit: number
}

export interface CanCreateSandboxResult {
  canCreate: boolean
  sessionsUsed: number
  sessionLimit: number
}

export interface ByokValidationResult {
  valid: boolean
  error?: string
}
