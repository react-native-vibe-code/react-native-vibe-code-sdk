'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'

interface NgrokHealthState {
  primaryPort: 8081
  ngrokStatus: {
    [port: number]: 'connected' | 'disconnected' | 'unknown'
  }
  isRecoveryActive: boolean
  isStartingRecovery: boolean
  lastHealthCheck: Date | null
}

interface UseNgrokHealthCheckOptions {
  sandboxId: string | null
  projectId: string | null
  userId: string | null
  ngrokUrl: string | null
  enabled?: boolean
  serverReady?: boolean // Only start health checks after initial server setup is complete
  pollingInterval?: number // Default: 60000ms (60 seconds)
  onBackupServerReady?: (newSandboxUrl: string, newNgrokUrl: string) => void // Callback when backup server starts with new URL
  onExpoError?: (errorMessage: string) => void // Callback when Expo app has a build error
  tunnelMode?: string // 'ngrok-patch' or 'lan'
}

interface UseNgrokHealthCheckReturn {
  healthState: NgrokHealthState
  isNgrokHealthy: boolean
  isBackupActive: boolean
  isStartingBackup: boolean
  isRecoveryActive: boolean
  isInRecoveryCooldown: () => boolean
  checkNgrokHealth: () => Promise<boolean>
  triggerBackupServer: () => Promise<void>
}

const PRIMARY_PORT = 8081
const DEFAULT_POLLING_INTERVAL = 60000 // 60 seconds
const RECOVERY_COOLDOWN_MS = 90000 // 90 seconds

const RECOVERY_TOAST_ID = 'tunnel-recovery'

export function useNgrokHealthCheck({
  sandboxId,
  projectId,
  userId,
  ngrokUrl,
  enabled = true,
  serverReady = false,
  pollingInterval = DEFAULT_POLLING_INTERVAL,
  onBackupServerReady,
  onExpoError,
  tunnelMode = 'ngrok-patch',
}: UseNgrokHealthCheckOptions): UseNgrokHealthCheckReturn {
  const [healthState, setHealthState] = useState<NgrokHealthState>({
    primaryPort: PRIMARY_PORT,
    ngrokStatus: {
      [PRIMARY_PORT]: 'unknown',
    },
    isRecoveryActive: false,
    isStartingRecovery: false,
    lastHealthCheck: null,
  })

  const isCheckingRef = useRef(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const consecutiveFailuresRef = useRef(0)

  // Recovery coordination refs (US-001)
  const recoveryLockRef = useRef(false)
  const lastRecoveryTimestampRef = useRef(0)

  // Stale closure fix refs (US-007) — always read latest URL values
  const ngrokUrlRef = useRef(ngrokUrl)
  const sandboxIdRef = useRef(sandboxId)
  ngrokUrlRef.current = ngrokUrl
  sandboxIdRef.current = sandboxId

  const isDev = process.env.NODE_ENV === 'development'

  const isInRecoveryCooldown = useCallback((): boolean => {
    if (lastRecoveryTimestampRef.current === 0) return false
    return Date.now() - lastRecoveryTimestampRef.current < RECOVERY_COOLDOWN_MS
  }, [])

  const showDevToast = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    if (!isDev) return

    switch (type) {
      case 'success':
        toast.success(message)
        break
      case 'warning':
        toast.warning(message)
        break
      case 'error':
        toast.error(message)
        break
      default:
        toast.info(message)
    }
  }, [isDev])

  const checkNgrokHealth = useCallback(async (): Promise<boolean> => {
    // Use refs to avoid stale closures (US-007)
    const currentNgrokUrl = ngrokUrlRef.current
    const currentSandboxId = sandboxIdRef.current

    if (!currentSandboxId || !currentNgrokUrl || isCheckingRef.current) {
      return true // Assume healthy if we can't check
    }

    // Skip during recovery or cooldown (US-001)
    if (recoveryLockRef.current || isInRecoveryCooldown()) {
      console.log('[useNgrokHealthCheck] Skipping health check — recovery active or in cooldown')
      return true
    }

    isCheckingRef.current = true

    try {
      console.log('[useNgrokHealthCheck] Checking ngrok health...')

      const checkPort = PRIMARY_PORT

      const response = await fetch('/api/check-ngrok-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngrokUrl: currentNgrokUrl,
          sandboxId: currentSandboxId,
          checkPort,
        }),
      })

      const data = await response.json()
      console.log('[useNgrokHealthCheck] Health check result:', data)

      setHealthState(prev => ({
        ...prev,
        lastHealthCheck: new Date(),
        ngrokStatus: {
          ...prev.ngrokStatus,
          [PRIMARY_PORT]: data.tunnelStatus,
        },
      }))

      // If the health check detected an Expo error page, notify the caller
      if (data.expoError && onExpoError) {
        console.log('[useNgrokHealthCheck] Expo error detected:', data.expoError.substring(0, 100))
        onExpoError(data.expoError)
      }

      if (data.isAlive) {
        consecutiveFailuresRef.current = 0
        return true
      } else {
        consecutiveFailuresRef.current++
        return false
      }
    } catch (error) {
      console.error('[useNgrokHealthCheck] Health check failed:', error)
      consecutiveFailuresRef.current++
      return false
    } finally {
      isCheckingRef.current = false
    }
  }, [tunnelMode, onExpoError, isInRecoveryCooldown])

  const triggerBackupServer = useCallback(async () => {
    const currentSandboxId = sandboxIdRef.current
    if (!currentSandboxId || !projectId || !userId) {
      console.error('[useNgrokHealthCheck] Cannot start backup: missing required params')
      return
    }

    // Acquire recovery lock (US-001)
    if (recoveryLockRef.current) {
      console.log('[useNgrokHealthCheck] Recovery already in progress, skipping')
      return
    }
    recoveryLockRef.current = true

    setHealthState(prev => ({ ...prev, isStartingRecovery: true }))

    // Single toast at start of recovery (US-006)
    toast.info('Reconnecting tunnel...', { id: RECOVERY_TOAST_ID })

    try {
      console.log('[useNgrokHealthCheck] Restarting server...')

      const action = healthState.isRecoveryActive ? 'cleanup_and_restart' : 'start_backup'

      const response = await fetch('/api/ngrok-backup-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandboxId: currentSandboxId,
          projectId,
          userId,
          action,
          tunnelMode,
        }),
      })

      const data = await response.json()
      console.log('[useNgrokHealthCheck] Backup server response:', data)

      if (data.success) {
        setHealthState(prev => ({
          ...prev,
          isRecoveryActive: true,
          isStartingRecovery: false,
          ngrokStatus: {
            ...prev.ngrokStatus,
            [PRIMARY_PORT]: 'connected',
          },
        }))
        consecutiveFailuresRef.current = 0

        // Update refs immediately with new URLs (US-007)
        if (data.ngrokUrl) {
          ngrokUrlRef.current = data.ngrokUrl
        }

        // Set recovery timestamp for cooldown (US-001)
        lastRecoveryTimestampRef.current = Date.now()

        // Single success toast (US-006)
        toast.success('Preview reconnected', { id: RECOVERY_TOAST_ID })

        // Call callback with new URLs so parent component can update preview
        if (onBackupServerReady && data.sandboxUrl && data.ngrokUrl) {
          console.log('[useNgrokHealthCheck] Calling onBackupServerReady with new URLs:', data.sandboxUrl, data.ngrokUrl)
          onBackupServerReady(data.sandboxUrl, data.ngrokUrl)
        }
      } else {
        setHealthState(prev => ({ ...prev, isStartingRecovery: false }))

        // Single error toast (US-006)
        toast.error('Recovery failed. Please refresh the page.', { id: RECOVERY_TOAST_ID })
      }
    } catch (error) {
      console.error('[useNgrokHealthCheck] Failed to restart server:', error)
      setHealthState(prev => ({ ...prev, isStartingRecovery: false }))

      toast.error('Recovery failed. Please refresh the page.', { id: RECOVERY_TOAST_ID })
    } finally {
      // Release recovery lock (US-001)
      recoveryLockRef.current = false
    }
  }, [projectId, userId, healthState.isRecoveryActive, onBackupServerReady, tunnelMode])

  // Main polling effect - only starts after serverReady is true
  useEffect(() => {
    // Don't start polling until initial server setup is complete
    // In LAN mode, skip ngrok health checks entirely — there's no ngrok tunnel to monitor
    if (!enabled || !sandboxId || !ngrokUrl || !serverReady || tunnelMode === 'lan') {
      if (tunnelMode === 'lan') {
        console.log('[useNgrokHealthCheck] LAN mode active, skipping ngrok health checks')
      } else if (!serverReady && enabled && sandboxId && ngrokUrl) {
        console.log('[useNgrokHealthCheck] Waiting for initial server setup to complete before starting health checks...')
      }
      return
    }

    const performHealthCheck = async () => {
      const isHealthy = await checkNgrokHealth()

      if (!isHealthy && !healthState.isStartingRecovery) {
        console.log('[useNgrokHealthCheck] Ngrok unhealthy, consecutive failures:', consecutiveFailuresRef.current)

        // Trigger backup after 3 consecutive failures to avoid false positives
        if (consecutiveFailuresRef.current >= 3) {
          await triggerBackupServer()
        }
      }
    }

    // Initial check after server is ready - wait 60 seconds before first check
    // to give the initial ngrok connection time to stabilize
    const initialTimeout = setTimeout(() => {
      console.log('[useNgrokHealthCheck] Initial server setup complete, starting first health check...')
      performHealthCheck()
    }, pollingInterval) // Wait one full polling interval before first check

    // Set up polling interval
    intervalRef.current = setInterval(performHealthCheck, pollingInterval)

    console.log(`[useNgrokHealthCheck] Server ready - started polling every ${pollingInterval}ms (first check in ${pollingInterval}ms)`)

    return () => {
      clearTimeout(initialTimeout)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      console.log('[useNgrokHealthCheck] Stopped polling')
    }
  }, [enabled, sandboxId, ngrokUrl, serverReady, pollingInterval, checkNgrokHealth, triggerBackupServer, healthState.isStartingRecovery, tunnelMode])

  const isNgrokHealthy = healthState.ngrokStatus[PRIMARY_PORT] === 'connected'

  return {
    healthState,
    isNgrokHealthy,
    isBackupActive: healthState.isRecoveryActive,
    isStartingBackup: healthState.isStartingRecovery,
    isRecoveryActive: recoveryLockRef.current || healthState.isStartingRecovery,
    isInRecoveryCooldown,
    checkNgrokHealth,
    triggerBackupServer,
  }
}
