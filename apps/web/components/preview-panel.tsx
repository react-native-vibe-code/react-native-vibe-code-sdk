'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Monitor,
  RefreshCw,
  Loader2,
  Copy,
  Smartphone,
  Zap,
  Eye,
  Code,
  SmartphoneIcon,
} from 'lucide-react'
import { useQRCode } from 'next-qrcode'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/use-mobile.tsx'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { Tabs, Tab } from '@heroui/tabs'
import { ExpoGoModal } from '@/components/expo-go-modal'
import { useDevMode } from '@/context/dev-mode-context'
import { useViewMode } from '@/context/view-mode-context'
import { CodePanel } from '@/components/code-panel'
import { ProjectHeaderActions } from '@/components/project-header-actions'
import { Session } from '@/lib/auth'

type ViewMode = 'mobile' | 'desktop' | 'both' | 'mobile-qr'

interface PreviewPanelProps {
  code?: string
  previewUrl?: string
  isGenerating?: boolean
  appData?: any
  result?: any
  sandboxId?: string
  projectId?: string
  viewMode?: ViewMode
  onToggleViewMode?: () => void
  userId?: string
  currentProject?: any
  onProjectUpdate?: (project: any) => void
  mobileView?: 'native' | 'web' // New prop to control mobile view
  // Props for embedded CodePanel
  currentFile?: string
  onCodeChange?: (code: string) => void
  onFileSelect?: (fileName: string) => void
  // Content mode: preview (default) or code editor
  contentMode?: 'preview' | 'code'
  onContentModeChange?: (mode: 'preview' | 'code') => void
  // Props for ProjectHeaderActions
  projectTitle?: string
  session?: Session | null
}

export function PreviewPanel({
  code,
  previewUrl,
  isGenerating,
  appData,
  result,
  sandboxId,
  projectId,
  viewMode = 'mobile-qr',
  onToggleViewMode,
  userId,
  currentProject,
  onProjectUpdate,
  mobileView = 'native',
  currentFile,
  onCodeChange,
  onFileSelect,
  contentMode: externalContentMode,
  onContentModeChange,
  // Props for ProjectHeaderActions
  projectTitle,
  session,
}: PreviewPanelProps) {
  const isMobile = useIsMobile()
  const { isDevMode } = useDevMode()
  const { setViewMode } = useViewMode()
  const [internalViewMode, setInternalViewMode] = useState<'desktop' | 'tablet' | 'mobile'>(
    'mobile',
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSandboxDown, setIsSandboxDown] = useState(false)
  const [isServerDown, setIsServerDown] = useState(false)
  const [isRestartingServer, setIsRestartingServer] = useState(false)
  const [isSandboxInitializing, setIsSandboxInitializing] = useState(false)
  const [isRecreatingSandbox, setIsRecreatingSandbox] = useState(false)
  const [recreationFailed, setRecreationFailed] = useState(false) // Stops retries after max attempts
  const recreationAttemptsRef = useRef(0)
  const isRecreatingSandboxRef = useRef(false) // Ref to avoid stale closures in health check
  const maxRecreationRetries = 3
  const [isIframeLoading, setIsIframeLoading] = useState(true)
  const [iframeKey, setIframeKey] = useState(0) // Key to force iframe remount
  const [connectionRetryCount, setConnectionRetryCount] = useState(0)
  const maxConnectionRetries = 3
  // Set initial tab based on mobile view prop - on mobile devices, default to web if mobileView is 'web'
  const [selectedTab, setSelectedTab] = useState<'native-mobile' | 'web'>(
    isMobile && mobileView === 'web' ? 'web' : 'native-mobile'
  )
  const [hasTriggeredScreenshots, setHasTriggeredScreenshots] = useState(false)
  const screenshotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { Canvas } = useQRCode()

  // Track if user has seen Expo Go modal
  const [hasSeenExpoGoModal, setHasSeenExpoGoModal] = useLocalStorage('hasSeenExpoGoModal', false)
  const [showExpoGoModal, setShowExpoGoModal] = useState(false)

  // Content mode: preview (default) or code editor
  // Use external state if provided, otherwise use internal state
  const [internalContentMode, setInternalContentMode] = useState<'preview' | 'code'>('preview')
  const contentMode = externalContentMode ?? internalContentMode
  const setContentMode = onContentModeChange ?? setInternalContentMode

  // Update selectedTab when mobileView prop changes on mobile devices
  useEffect(() => {
    if (isMobile) {
      setSelectedTab(mobileView === 'web' ? 'web' : 'native-mobile')
    }
  }, [isMobile, mobileView])

  // Handle tab selection and show modal on first native-mobile selection
  const handleTabChange = (key: string | number) => {
    const newTab = key as 'native-mobile' | 'web'
    setSelectedTab(newTab)

    // Show modal when user clicks native-mobile for the first time
    if (newTab === 'native-mobile' && !hasSeenExpoGoModal) {
      setShowExpoGoModal(true)
      setHasSeenExpoGoModal(true)
    }
  }

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  const handlePageRefresh = () => {
    window.location.reload()
  }

  const handleRestartServer = async () => {
    if (!projectId || !sandboxId || isRestartingServer) return

    // console.log('[PreviewPanel] Restarting server for sandbox:', sandboxId)
    setIsRestartingServer(true)

    try {
      const userID = localStorage.getItem('userId')

      const response = await fetch('/api/restart-server', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          userID,
          sandboxId,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // console.log('[PreviewPanel] Server restarted successfully')
        toast.success('Server restarted successfully')
        setIsServerDown(false)

        // Reload the iframe after a short delay
        setTimeout(() => {
          const iframes = document.querySelectorAll('iframe')
          iframes.forEach(iframe => {
            if (iframe.src.includes(sandboxId)) {
              iframe.src = iframe.src
            }
          })
        }, 2000)
      } else {
        console.error('[PreviewPanel] Failed to restart server:', data.error)
        // toast.error(`Failed to restart server: ${data.error}`)
      }
    } catch (error) {
      console.error('[PreviewPanel] Error restarting server:', error)
      // toast.error('Failed to restart server')
    } finally {
      setIsRestartingServer(false)
    }
  }

  // Handle sandbox recreation when sandbox container is gone
  const handleRecreateSandbox = async () => {
    if (!projectId || !userId || isRecreatingSandboxRef.current) return

    // Check if we've exceeded max retries
    if (recreationAttemptsRef.current >= maxRecreationRetries) {
      console.log(`[PreviewPanel] Max recreation attempts (${maxRecreationRetries}) reached, stopping auto-retry`)
      setRecreationFailed(true)
      setIsSandboxInitializing(false)
      return
    }

    recreationAttemptsRef.current++
    const attempt = recreationAttemptsRef.current
    console.log(`[PreviewPanel] Recreating sandbox for project: ${projectId} (attempt ${attempt}/${maxRecreationRetries})`)

    setIsRecreatingSandbox(true)
    isRecreatingSandboxRef.current = true
    setIsSandboxInitializing(true)

    try {
      const response = await fetch('/api/resume-container', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          userID: userId,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        console.log('[PreviewPanel] Sandbox recreated successfully:', data)
        toast.success('Sandbox recreated successfully')
        setIsSandboxDown(false)
        setIsServerDown(false)
        recreationAttemptsRef.current = 0
        setRecreationFailed(false)

        // Reload the page to get fresh URLs and state
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        console.error(`[PreviewPanel] Failed to recreate sandbox (attempt ${attempt}/${maxRecreationRetries}):`, data.error)
        if (attempt >= maxRecreationRetries) {
          toast.error('Failed to recreate sandbox after multiple attempts. Please try refreshing the page.')
          setRecreationFailed(true)
        } else {
          toast.error(`Failed to recreate sandbox (attempt ${attempt}/${maxRecreationRetries})`)
        }
      }
    } catch (error) {
      console.error(`[PreviewPanel] Error recreating sandbox (attempt ${attempt}/${maxRecreationRetries}):`, error)
      if (attempt >= maxRecreationRetries) {
        toast.error('Failed to recreate sandbox after multiple attempts. Please try refreshing the page.')
        setRecreationFailed(true)
      } else {
        toast.error(`Failed to recreate sandbox (attempt ${attempt}/${maxRecreationRetries})`)
      }
    } finally {
      setIsRecreatingSandbox(false)
      isRecreatingSandboxRef.current = false
      setIsSandboxInitializing(false)
    }
  }

  // Calculate preview URL early
  const hasContent = code || appData?.code || result?.url
  let basePreviewUrl = result?.url || previewUrl
  // basePreviewUrl = 'http://localhost:8081' // DEV: testing expo local

  // Add sandboxId as query parameter if available
  const actualPreviewUrl =
    basePreviewUrl && sandboxId
      ? `${basePreviewUrl}${basePreviewUrl.includes('?') ? '&' : '?'}sandboxId=${sandboxId}`
      : basePreviewUrl

  const displayCode = code || appData?.code

  // Reset iframe loading state when URL changes
  useEffect(() => {
    if (actualPreviewUrl) {
      // console.log('[PreviewPanel] Preview URL changed, setting iframe to loading state')
      setIsIframeLoading(true)
    }
  }, [actualPreviewUrl])

  // Handler for when iframe finishes loading
  const handleIframeLoad = () => {
    console.log('[PreviewPanel] Iframe finished loading')
    setIsIframeLoading(false)
  }

  // Check if the preview URL is accessible and retry if connection was reset
  const checkConnectionAndRetry = async () => {
    if (!actualPreviewUrl || connectionRetryCount >= maxConnectionRetries || !sandboxId) return

    try {
      // Use server-side check which is more reliable than client-side fetch
      const response = await fetch('/api/check-expo-server', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: actualPreviewUrl,
          sandboxId: sandboxId
        }),
      })

      const data = await response.json()

      if (data.isAlive) {
        // Connection is fine - reset retry count
        if (connectionRetryCount > 0) {
          console.log('[PreviewPanel] Connection restored, resetting retry count')
          setConnectionRetryCount(0)
        }
      } else {
        // Connection failed - likely "connection was reset" scenario
        throw new Error('Server not responding')
      }
    } catch (error) {
      console.log('[PreviewPanel] Connection check failed, retrying iframe...', error)

      if (connectionRetryCount < maxConnectionRetries) {
        const nextRetryCount = connectionRetryCount + 1
        setConnectionRetryCount(nextRetryCount)
        setIsIframeLoading(true)
        // Toggle the key to force iframe remount
        setIframeKey(prev => prev + 1)
        toast.info(`Reconnecting to preview... (attempt ${nextRetryCount}/${maxConnectionRetries})`)
      } else {
        console.log('[PreviewPanel] Max retries reached, stopping auto-retry')
      }
    }
  }

  // Monitor iframe load and check connection after it loads
  useEffect(() => {
    if (!isIframeLoading && actualPreviewUrl && !isSandboxDown && sandboxId) {
      // Wait a bit after iframe "loads" to verify connection is actually working
      const checkTimeout = setTimeout(() => {
        checkConnectionAndRetry()
      }, 3000) // Check 3 seconds after iframe reports load

      return () => clearTimeout(checkTimeout)
    }
  }, [isIframeLoading, actualPreviewUrl, isSandboxDown, connectionRetryCount, sandboxId])

  // Reset retry count when URL changes
  useEffect(() => {
    setConnectionRetryCount(0)
    setIframeKey(0)
  }, [actualPreviewUrl])

  // Trigger screenshots when project data is available and iframe has loaded
  // This useEffect handles the timing issue where iframe loads before project data
  useEffect(() => {
    console.log('[PreviewPanel] currentProject:', currentProject)
    console.log('[PreviewPanel] Screenshot check:', {
      hasTriggeredScreenshots,
      isIframeLoading,
      projectId: currentProject?.id,
      userId,
      projectUserId: currentProject?.userId,
      isPublic: currentProject?.isPublic,
    })

    // Only trigger if:
    // - Not already triggered in this session
    // - Iframe has finished loading
    // - User owns the project
    // - Project is public (for remix page display)
    // - No timeout already scheduled
    if (
      !hasTriggeredScreenshots &&
      !isIframeLoading &&
      currentProject?.id &&
      userId &&
      currentProject.userId === userId &&
      currentProject.isPublic &&
      !screenshotTimeoutRef.current
    ) {
      console.log('[PreviewPanel] Scheduling screenshot capture in 60 seconds for public project...')
      setHasTriggeredScreenshots(true)

      // Store project data in closure to avoid stale references
      const projectId = currentProject.id
      const currentUserId = userId

      screenshotTimeoutRef.current = setTimeout(async () => {
        console.log('[PreviewPanel] Triggering automatic screenshot capture for project:', projectId)

        try {
          const response = await fetch(`/api/projects/${projectId}/screenshots`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userID: currentUserId,
            }),
          })

          if (response.ok) {
            const data = await response.json()
            console.log('[PreviewPanel] Screenshots captured successfully:', data.screenshots)

            // Update current project with new screenshot URLs
            if (data.project && onProjectUpdate) {
              onProjectUpdate(data.project)
            }
          } else {
            const error = await response.json()
            console.error('[PreviewPanel] Failed to capture screenshots:', error)
          }
        } catch (error) {
          console.error('[PreviewPanel] Error triggering screenshots:', error)
        } finally {
          screenshotTimeoutRef.current = null
        }
      }, 60000) // 60 seconds - wait for app to fully initialize
    }
  }, [hasTriggeredScreenshots, isIframeLoading, currentProject, userId, onProjectUpdate])

  // Cleanup timeout on unmount only
  useEffect(() => {
    return () => {
      if (screenshotTimeoutRef.current) {
        clearTimeout(screenshotTimeoutRef.current)
        screenshotTimeoutRef.current = null
      }
    }
  }, [])

  // Show loading if:
  // 1. isGenerating is true (container is being created/resumed)
  // 2. isSandboxInitializing is true (sandbox is starting up)
  // 3. result?.recreated is true (sandbox was just recreated)
  // Note: We show loading even if we have a URL because it might be stale
  let isLoading = isGenerating || isSandboxInitializing || result?.recreated
  // isLoading = false // DEV: testing expo local

  // Clear the recreated flag after some time
  useEffect(() => {
    if (result?.recreated) {
      const timeout = setTimeout(() => {
        // After 30 seconds, assume sandbox should be ready
        // This will be overridden if we detect it's ready earlier
        // console.log('[PreviewPanel] Clearing recreated flag after timeout')
      }, 30000)

      return () => clearTimeout(timeout)
    }
  }, [result?.recreated])

  const pingSandbox = async (): Promise<boolean> => {
    try {
      if (!sandboxId) {
        // console.error('[PreviewPanel] No sandbox ID available')
        return false
      }

      // Check if the sandbox container is alive using the E2B SDK
      const response = await fetch('/api/check-sandbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sandboxId }),
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      return data.isAlive
    } catch (error) {
      // console.error('[PreviewPanel] Error checking sandbox:', error)
      return false
    }
  }

  const checkExpoServer = async (ngrokUrl: string): Promise<boolean> => {
    try {
      // console.log('[PreviewPanel] Checking Expo server at:', ngrokUrl, 'with sandboxId:', sandboxId)

      const response = await fetch('/api/check-expo-server', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: ngrokUrl,
          sandboxId: sandboxId  // Pass sandboxId for direct port check in sandbox
        }),
      })

      if (!response.ok) {
        // console.log('[PreviewPanel] API request failed')
        return false
      }

      const data = await response.json()
      // console.log('[PreviewPanel] Expo server check result:', data)
      return data.isAlive
    } catch (error) {
      // console.error('[PreviewPanel] Error checking Expo server:', error)
      return false
    }
  }

  // CONSOLIDATED HEALTH CHECK - Single polling mechanism for all checks
  useEffect(() => {
    if (!actualPreviewUrl || !sandboxId) return

    let checkCount = 0
    let abortController: AbortController | null = null

    const checkHealth = async () => {
      checkCount++

      // Abort any pending requests
      if (abortController) {
        abortController.abort()
      }
      abortController = new AbortController()

      try {
        // 1. Check if sandbox container is alive
        const isAlive = await pingSandbox()
        setIsSandboxDown(!isAlive)

        if (!isAlive && sandboxId) {
          // Sandbox is down - trigger automatic recreation (with retry limit)
          console.log('[PreviewPanel] Sandbox is down, checking if recreation should be attempted')

          // Only trigger if not already recreating AND haven't exceeded max retries
          if (!isRecreatingSandboxRef.current && projectId && userId && recreationAttemptsRef.current < maxRecreationRetries) {
            handleRecreateSandbox()
          } else if (recreationAttemptsRef.current >= maxRecreationRetries) {
            console.log('[PreviewPanel] Skipping recreation - max retries exceeded')
          }
        } else if (isAlive) {
          setIsSandboxInitializing(false)
          // Sandbox came back - reset recreation state
          if (recreationAttemptsRef.current > 0) {
            recreationAttemptsRef.current = 0
            setRecreationFailed(false)
          }

          // 2. Check Expo server if we have ngrokUrl
          const ngrokUrl = (result as any)?.ngrokUrl
          if (ngrokUrl) {
            const expoServerAlive = await checkExpoServer(ngrokUrl)

            if (!expoServerAlive && !isServerDown) {
              setIsServerDown(true)
              // Auto-restart only on first detection
              if (!isRestartingServer && projectId && sandboxId) {
                handleRestartServer()
              }
            } else if (expoServerAlive && isServerDown) {
              setIsServerDown(false)
            }
          }
        }
      } catch (error) {
        // Ignore errors during health checks
      }
    }

    // Initial check after iframe has time to load
    const initialTimeout = setTimeout(checkHealth, 2000)

    // Smart polling with exponential backoff
    // Check frequently at first, then slow down
    const getInterval = () => {
      if (checkCount < 3) return 10000  // First 3 checks: every 10s
      if (checkCount < 6) return 30000  // Next 3 checks: every 30s
      return 60000                       // After that: every 60s
    }

    let interval: ReturnType<typeof setInterval>
    const scheduleNext = () => {
      interval = setInterval(() => {
        checkHealth()
        // Reschedule with new interval if needed
        if (checkCount === 3 || checkCount === 6) {
          clearInterval(interval)
          scheduleNext()
        }
      }, getInterval())
    }

    scheduleNext()

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
      if (abortController) {
        abortController.abort()
      }
    }
    // Note: isRecreatingSandbox intentionally excluded - using ref instead to prevent
    // the effect from re-triggering (which was causing an infinite retry loop)
  }, [actualPreviewUrl, sandboxId, result, projectId, userId, isRestartingServer, isServerDown])

  const testToast = () => {
    toast.success('Sonner is working!', {
      duration: 3000,
      position: 'bottom-right',
    })

    // Test error toast too
    setTimeout(() => {
      toast.error('This is a test error notification', {
        duration: 5000,
        position: 'bottom-right',
        style: {
          maxWidth: '500px',
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
          fontSize: '12px',
        },
        dismissible: true,
        closeButton: true,
      })
    }, 1000)
  }

  const testPusherNotification = async () => {
    if (!projectId) {
      toast.error('No project ID available for testing')
      return
    }

    console.log(
      '[PreviewPanel] Testing Pusher error notification with projectId:',
      projectId,
    )

    // Create a realistic error message for testing
    const testErrorMessage = `Error: Cannot find module 'react-native-gesture-handler'
Require stack:
- /home/user/app/(tabs)/index.tsx
- /home/user/node_modules/expo-router/build/qualified-entry.js
- /home/user/node_modules/expo/AppEntry.js

Call Stack:
  Module._resolveFilename (node:internal/modules/cjs/loader:1075:15)
  Module._load (node:internal/modules/cjs/loader:920:27)
  Module.require (node:internal/modules/cjs/loader:1141:19)
  require (node:internal/modules/cjs/helpers:119:18)
  Object.<anonymous> (/home/user/app/(tabs)/index.tsx:5:1)
  Module._compile (node:internal/modules/cjs/loader:1254:14)
  Object.Module._extensions..js (node:internal/modules/cjs/loader:1308:10)
  Module.load (node:internal/modules/cjs/loader:1117:32)
  Function.Module._load (node:internal/modules/cjs/loader:958:12)
  Module.require (node:internal/modules/cjs/loader:1141:19)

Possible solution: 
Run 'npm install react-native-gesture-handler' or 'yarn add react-native-gesture-handler'`

    try {
      const response = await fetch('/api/test-error-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: projectId,
          errorMessage: testErrorMessage
        }),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Test error notification sent! Check bottom-right for the error toast.')
      } else {
        toast.error(`Failed to send test notification: ${result.error}`)
      }
    } catch (error) {
      console.error('[PreviewPanel] Error sending test notification:', error)
      toast.error('Failed to send test notification')
    }
  }

  const getPreviewDimensions = (isMobileView = false) => {
    if (viewMode === 'desktop') {
      return 'w-full h-full'
    }
    if (viewMode === 'both') {
      return isMobileView ? 'w-80 h-[600px]' : 'w-full h-full'
    }
    // mobile mode
    switch (internalViewMode) {
      case 'mobile':
        return 'w-80 h-[600px]'
      case 'tablet':
        return 'w-[600px] h-[800px]'
      default:
        return 'w-full h-full'
    }
  }

  const getViewModeIcon = () => {
    switch (viewMode) {
      case 'mobile':
        return <Smartphone className="h-4 w-4" />
      case 'mobile-qr':
        return <Smartphone className="h-4 w-4" />
      case 'desktop':
        return <Monitor className="h-4 w-4" />
      case 'both':
        return (
          <div className="flex items-center space-x-1">
            <Smartphone className="h-3 w-3" />
            <Monitor className="h-3 w-3" />
          </div>
        )
      default:
        return <Smartphone className="h-4 w-4" />
    }
  }

  return (
    <div className={`flex flex-col h-full border-l ${viewMode === 'desktop' || viewMode === 'both' || viewMode === 'mobile-qr' ? 'w-full' : 'min-w-full max-w-full '}`}>
      <div className="hidden md:flex p-4 border-b h-[50px] items-center">
        <div className="flex items-center justify-between w-full">
          {/* Left: toggles */}
          <div className="flex items-center space-x-2">
            {/* Preview/Code toggle - always visible */}
            <Tabs
              aria-label="Content options"
              selectedKey={contentMode}
              onSelectionChange={(key) => setContentMode(key as 'preview' | 'code')}
              size="sm"
              classNames={{
                tabContent: "text-sm font-medium group-data-[selected=true]:text-foreground text-muted-foreground"
              }}
            >
              <Tab key="preview" title={<Eye className="h-4 w-4" />} />
              <Tab key="code" title={<Code className="h-4 w-4" />} />
            </Tabs>

            {/* Native Mobile/Web App toggle - visible but disabled when in code mode */}
            <Tabs
              aria-label="View options"
              selectedKey={selectedTab}
              onSelectionChange={handleTabChange}
              size="sm"
              isDisabled={contentMode === 'code'}
              classNames={{
                tabContent: cn(
                  "text-sm font-medium",
                  contentMode === 'code'
                    ? "text-muted-foreground/50"
                    : "group-data-[selected=true]:text-foreground text-muted-foreground"
                )
              }}
            >
              <Tab key="native-mobile" title={<SmartphoneIcon className="h-4 w-4" />} />
              <Tab key="web" title={<Monitor className="h-4 w-4" />} />
            </Tabs>

            {/* {process.env.NODE_ENV === 'development' && (
              <Button
                variant="outline"
                size="sm"
                onClick={testPusherNotification}
                title="Test Pusher Error Notification"
              >
                <Zap className="h-4 w-4" />
              </Button>
            )} */}
          </div>

          {/* Right: project actions from nav-header */}
          <ProjectHeaderActions
            session={session}
            projectId={projectId}
            projectTitle={projectTitle}
            sandboxId={sandboxId}
            currentProject={currentProject}
            onProjectUpdate={onProjectUpdate}
          />
        </div>
      </div>


      <div className={` flex-1 flex flex-col bg-muted/30 ${viewMode === 'desktop' || viewMode === 'both' || viewMode === 'mobile-qr' ? 'w-full' : ''}`}>
        <div className="md:flex-1 p-0 h-full relative">
          {/* Code Panel - always mounted, hidden when not active */}
          <div className={cn("h-full flex flex-col absolute inset-0", contentMode !== 'code' && "hidden")}>
            <CodePanel
              code={code || ''}
              currentFile={currentFile || ''}
              onCodeChange={onCodeChange}
              onFileSelect={onFileSelect}
              appData={appData}
              projectId={projectId}
              isDesktopMode={false}
              hideHeader={true}
            />
          </div>

          {/* Preview content - always mounted, hidden when code mode is active */}
          <div className={cn("h-full", contentMode === 'code' && "hidden")}>
          {/* Loading overlay - shown on top of iframes when loading */}
          {isLoading && (
            <div className="absolute inset-0 z-50 h-full flex min-w-full items-center justify-center bg-background">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">
                  {result?.recreated
                    ? 'Recreating Sandbox'
                    : isSandboxInitializing
                    ? 'Initializing Sandbox'
                    : 'Generating Preview'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {result?.recreated
                    ? 'Cloning repository and setting up environment...'
                    : isSandboxInitializing
                    ? 'Setting up the sandbox environment...'
                    : 'This may take a minute or two...'}
                </p>
              </div>
            </div>
          )}
          {/* Recreation failed overlay - shown when max retries exhausted */}
          {recreationFailed && !isLoading && (
            <div className="absolute inset-0 z-50 h-full flex min-w-full items-center justify-center bg-background">
              <div className="text-center max-w-md px-4">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <RefreshCw className="h-6 w-6 text-destructive" />
                </div>
                <p className="text-lg font-medium mb-2">Sandbox Unavailable</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Failed to recreate the sandbox after {maxRecreationRetries} attempts.
                </p>
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      recreationAttemptsRef.current = 0
                      setRecreationFailed(false)
                      handleRecreateSandbox()
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => window.location.reload()}
                  >
                    Refresh Page
                  </Button>
                </div>
              </div>
            </div>
          )}
          {/* Iframe views - always mounted once URL is available, loading overlay shown on top when needed */}
          {actualPreviewUrl && (
              // Preview mode: Show content based on selectedTab (native-mobile or web)
              // Both views are always mounted, toggled with CSS hidden class
              <div className="h-full flex flex-col">
                {/* Native Mobile View - always mounted, hidden when web is selected */}
                <div className={cn("h-full flex items-center justify-center p-8 gap-8", selectedTab !== 'native-mobile' && "hidden")}>
                {/* Mobile Preview with Phone Frame */}
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative" style={{ width: '393px', height: '852px' }}>
                    {/* Content Area - positioned to match the phone screen */}
                    <div className="absolute z-10" style={{
                      left: '6px',
                      top: '14px',
                      width: '371px',
                      height: '779px',
                      borderRadius: '56.5px',
                      // paddingTop: '50px',
                      // borderTopLeftRadius: '0',
                      // borderTopRightRadius: '0',
                      overflow: 'hidden',
                      borderWidth: '7px',
                      borderColor: 'black',
                      backgroundColor: 'rgb(17, 17, 17)'
                    }}>
                      <div className="relative w-full h-full">
                      <div className="absolute z-10" style={{
                      top: '-50px',
                      left: '0px',
                      backgroundColor: 'white',
                      width: '371px',
                      height: '50px' }}></div>
                        <iframe
                          src={actualPreviewUrl}
                          className="absolute z-11 inset-0 w-full h-full border-0 bg-transparent"
                          title="Mobile App Preview alone"
                          onLoad={handleIframeLoad}
                          style={{opacity: isIframeLoading ? 0 : 1, transition: 'opacity 0.3s' }}
                        />
                        {/* Loading overlay */}
                        {isIframeLoading && (
                          <div className="absolute inset-0 bg-[rgb(17,17,17)] flex items-center justify-center z-30">
                            <div className="text-center p-6">
                              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-white" />
                              <p className="text-xs text-white/80">
                                Loading preview...
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Phone SVG Frame - overlays on top */}
                    <svg width="383" height="852" viewBox="0 0 427 881" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0 pointer-events-none z-20 -top-[22px]">
                      <defs>
                        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                          <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(0,0,0,0.15)" />
                        </filter>
                        <clipPath id="clip0_2905_1090">
                          <rect width="426.667" height="880.667" rx="70" fill="white" />
                        </clipPath>
                      </defs>
                      <g clipPath="url(#clip0_2905_1090)">
                        {/* Phone border/bezel only - no fill to show content behind */}
                        <rect x="3.83268" y="3.83366" width="419" height="873" rx="66.1667" className="stroke-[#dcdcdf] dark:stroke-[#454548] fill-none" strokeWidth="4.33333" />
                        <rect x="0.833333" y="0.833333" width="425" height="879" rx="69.1667" className="stroke-[#c1c2c4] dark:stroke-[#37373a] fill-none" strokeWidth="1.66667" />
                        {/* Bottom notch */}
                        {/* <rect width="139" height="5" rx="2.5" transform="matrix(-1 0 0 1 284 855)" className="fill-[black] dark:fill-[#ffffffa2]" /> */}

                        {/* Dynamic Island / Notch */}
                        {/* <rect x="151.666" y="23" width="123.333" height="36" rx="18" fill="black" /> */}
                      </g>
                    </svg>
                  </div>
                </div>

                {/* QR Code Section - Prominent display */}
                {result?.ngrokUrl && (
                  <div className="flex flex-col items-start space-y-4 max-w-xl relative -top-8">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold">Test on your phone</h3>
                    </div>

                    <div className="flex items-center justify-center p-4 bg-white rounded-xl border border-gray-200">
                      <Canvas
                        text={result.ngrokUrl?.replace('https://', 'exp://')}
                        options={{
                          errorCorrectionLevel: 'M',
                          margin: 0,
                          scale: 4,
                          width: 240,
                          color: {
                            dark: '#000000',
                            light: '#FFFFFF',
                          },
                        }}
                      />
                    </div>

                    <div className="space-y-3">
                      <p className="text-base">
                        <span className="font-semibold text-sm">1. Download the latest Expo Go app</span>
                      </p>
                      <p className="text-base">
                        <span className="font-semibold text-sm">2. Scan QR Code</span>
                      </p>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-4 space-y-3 border border-muted max-w-[270px]">
                      <p className="text-sm text-muted-foreground flex items-start gap-2">
                        <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 16v-4m0-4h.01"/>
                        </svg>
                        <span>Your browser does not have all of features that phones support.</span>
                      </p>
                      <p className="text-sm text-muted-foreground pl-7">
                        For the full experience, test your app on your phone using the Expo Go app.
                      </p>
                    </div>
                  </div>
                )}
                </div>

                {/* Web App View - always mounted, hidden when native-mobile is selected */}
                {isMobile ? (
                  // Mobile device: Full screen view
                  <div
                    className={cn("w-full overflow-hidden relative", selectedTab !== 'web' && "hidden")}
                    style={{ height: '70vh' }}
                  >
                    <iframe
                      src={actualPreviewUrl}
                      className="w-full h-full border-0"
                      title="Web App Preview Mobile"
                      onLoad={handleIframeLoad}
                      style={{
                        transform: 'scale(0.5)',
                        transformOrigin: 'top left',
                        width: '200%',
                        height: '200%'
                      }}
                    />
                    {/* Loading overlay */}
                    {isIframeLoading && (
                      <div className="absolute inset-0 bg-background flex items-center justify-center z-10">
                        <div className="text-center p-6">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                          <p className="text-sm text-muted-foreground">
                            Loading preview...
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // Desktop: Show full desktop-sized view
                  <div className={cn("h-full w-full relative overflow-hidden", selectedTab !== 'web' && "hidden")}>
                    <iframe
                      src={actualPreviewUrl}
                      className="w-full h-full border-0"
                      title="Web App Preview Desktop"
                      onLoad={handleIframeLoad}
                    />
                    {/* Loading overlay */}
                    {isIframeLoading && (
                      <div className="absolute inset-0 bg-background flex items-center justify-center z-10">
                        <div className="text-center p-6">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                          <p className="text-sm text-muted-foreground">
                            Loading preview...
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
          )}
          {/* Placeholder when no preview URL yet */}
          {!actualPreviewUrl && !isLoading && hasContent && (
            <div className={`h-full flex ${viewMode === 'desktop' || viewMode === 'both' ? 'h-full min-w-full max-w-full' : 'items-center justify-center'}`}>
              <Card
                className={`${getPreviewDimensions()} ${viewMode === 'desktop' || viewMode === 'both' ? 'h-full min-w-full max-w-full' : 'border-2 shadow-lg'} overflow-hidden`}
              >
                <div className="h-full bg-white flex items-center justify-center">
                  <div className="text-center p-8">
                    <div className="w-16 h-16 bg-primary rounded-lg mx-auto mb-4 flex items-center justify-center">
                      <Smartphone className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">
                      React Native App
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {appData?.summary ||
                        'Your generated app is being prepared'}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )}
          {/* Generating state when no content yet */}
          {!actualPreviewUrl && !isLoading && !hasContent && (
            <div className="h-full flex min-w-full items-center justify-center ">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">Generating Preview</p>
                <p className="text-sm text-muted-foreground">
                  This may take a minute or two...
                </p>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* URL Footer */}
        <div className="border-t bg-background p-3 hidden md:hidden">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">URL:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 truncate">
              {actualPreviewUrl ||
                (hasContent ? 'Preparing preview...' : 'No preview URL')}
            </code>
            {actualPreviewUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() => navigator.clipboard.writeText(actualPreviewUrl)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Expo Go Installation Modal */}
      <ExpoGoModal
        open={showExpoGoModal}
        onOpenChange={setShowExpoGoModal}
      />
    </div>
  )
}
