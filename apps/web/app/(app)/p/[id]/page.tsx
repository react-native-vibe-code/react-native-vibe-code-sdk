'use client'

import { AuthDialog } from '@/components/auth-dialog'
import { ChatPanel } from '@/components/chat-panel'
import { type ImageAttachment } from '@/components/chat-panel-input'
// CodePanel is now embedded inside PreviewPanel
import { HistoryPanel } from '@/components/history-panel'
import { ErrorDetailsModal } from '@/components/error-details-modal'
import { ExpoGoModal } from '@/components/expo-go-modal'
import { EditableProjectTitle } from '@/components/editable-project-title'
import { PreviewPanel } from '@/components/preview-panel'
import { SubscriptionModal } from '@/components/subscription-modal'
import { UserSettingsModal } from '@/components/user-settings-modal'
import { ProjectSettingsModal } from '@/components/project-settings-modal'
import { MobilePortalProvider, MobileHeaderPortal, MobileTabBarPortal } from '@/components/mobile-portal-provider'
import { MobileHeader } from '@/components/mobile-header'
import { AssetsPanel } from '@/components/assets-panel'
import { ProjectsPanel } from '@/components/projects-panel'
import { BackendPanel } from '@/components/backend-panel'
import { CloudSidebarPanel } from '@/components/cloud-sidebar-panel'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
// ResizableHandle and ResizablePanel/Group removed - using fixed 500px width for chat panel
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { signOut, useSession } from '@/lib/auth/client'
import { Project } from '@react-native-vibe-code/database'
import { LLMModelConfig } from '@/lib/models'
import modelsList from '@/lib/models.json'
import templates, { TemplateId } from '@/lib/templates'
import { ExecutionResult } from '@/lib/types'
import { useChat } from '@ai-sdk/react'
import type { ChatRequestOptions } from '@ai-sdk/ui-utils'
import { Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import { useEffect, useState, useMemo, useCallback, useRef, SetStateAction } from 'react'
import { useCookieStorage } from '@/hooks/useCookieStorage'
import { useClaudeModel } from '@/hooks/use-claude-model'
import { v4 as uuidv4 } from 'uuid'
import { useErrorNotifications } from '@/hooks/useErrorNotifications'
import { useNgrokHealthCheck } from '@/hooks/useNgrokHealthCheck'
import { useStreamRecovery } from '@/hooks/useStreamRecovery'
import { searchService } from '@/lib/search-service'
import { useViewMode } from '@/context/view-mode-context'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { AppSidebar } from '@/components/app-sidebar'
import Loading from './loading'

function ProjectPageInternal() {
  // Toggle to true to force expo-testing template during development
  const EXPO_TESTING = true

  const params = useParams()
  const projectID = params?.id as string
  const router = useRouter()
  const searchParams = useSearchParams()

  const [files, setFiles] = useState<File[]>([])
  const [imageAttachments, _setImageAttachments] = useState<ImageAttachment[]>([])
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])

  // Use a ref to always have access to the latest imageAttachments in callbacks
  // This fixes the stale closure issue in experimental_prepareRequestBody
  const imageAttachmentsRef = useRef<ImageAttachment[]>([])

  // Use a ref for skills from URL params (similar to imageAttachments)
  const skillsFromUrlRef = useRef<string[]>([])

  // Wrapper to keep ref in sync SYNCHRONOUSLY with state updates
  const setImageAttachments = useCallback((value: ImageAttachment[] | ((prev: ImageAttachment[]) => ImageAttachment[])) => {
    _setImageAttachments(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value
      imageAttachmentsRef.current = newValue
      console.log('[setImageAttachments] Updating ref:', newValue.length, 'images')
      return newValue
    })
  }, [])
  const [selectedTemplate, setSelectedTemplate] = useState<'auto' | TemplateId>(
    EXPO_TESTING ? 'expo-testing' : 'react-native-expo',
  )
  const [languageModel, setLanguageModel] = useCookieStorage<LLMModelConfig>(
    'languageModel',
    {
      model: 'claude-3-5-sonnet-latest',
    },
  )

  // Safely extract params with fallbacks
  const projectId = (params?.id as string) || ''
  const firstMessage = searchParams?.get('firstMessage') || null
  const templateFromUrl = searchParams?.get('template') || null
  const chooseTemplateFromUrl = searchParams?.get('choosetemplate') || null
  const modelFromUrl = searchParams?.get('model') || null
  const imageUrlsFromUrl = searchParams?.get('imageUrls') || null
  const skillsFromUrl = searchParams?.get('skills') || null

  // Claude model selection with localStorage persistence
  const { selectedModel, setSelectedModel } = useClaudeModel()

  // Initialize model from URL if coming from home page
  useEffect(() => {
    if (modelFromUrl && !hasRun.current) {
      setSelectedModel(modelFromUrl)
    }
  }, [modelFromUrl, setSelectedModel])

  // Store the remixed flag in a ref so it persists after URL cleanup
  const isRemixedProjectRef = useRef(searchParams?.get('remixed') === 'true')
  const isRemixedProject = isRemixedProjectRef.current

  // We'll define this after useChat is initialized
  const handleSendToFixRef = useRef<((errorMessage: string) => void) | null>(null)

  // Set up error notifications for this project with send to fix handler
  const {
    isModalOpen: isErrorModalOpen,
    errorModalData,
    handleCloseModal: handleCloseErrorModal,
    handleSendToFix: handleSendToFixFromModal
  } = useErrorNotifications(projectId || null, (errorMessage: string) => {
    handleSendToFixRef.current?.(errorMessage)
  })

  // Expose project ID globally for search functionality
  useEffect(() => {
    if (projectId) {
      (window as any).__currentProjectId = projectId
    }
    return () => {
      delete (window as any).__currentProjectId
    }
  }, [projectId])

  const posthog = usePostHog()

  // Use the proper auth hook
  const { data: session, isPending: isSessionLoading } = useSession()

  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false)
  const [pendingEditData, setPendingEditData] = useState<any>(null)

  // Modal states (moved from NavHeader)
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const [isUserSettingsModalOpen, setIsUserSettingsModalOpen] = useState(false)
  const [isProjectSettingsModalOpen, setIsProjectSettingsModalOpen] = useState(false)

  // Mobile sidebar panel state
  const [mobileSidebarPanel, setMobileSidebarPanel] = useState<string | null>(null)

  // Desktop sidebar panel state
  const [desktopSidebarPanel, setDesktopSidebarPanel] = useState<string | null>(null)

  // Memoize the chat body to prevent infinite re-renders
  const chatBody = useMemo(
    () => ({
      projectId: projectId || undefined,
      userId: session?.user?.id || undefined,
      claudeModel: selectedModel,
      imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
      ...(pendingEditData
        ? {
            fileEdition: pendingEditData.fileEdition,
            selectionData: pendingEditData.selectionData,
          }
        : {}),
    }),
    [projectId, session?.user?.id, pendingEditData, selectedModel, imageAttachments],
  )

  // Utility function to reload preview iframes
  const reloadPreviewIframes = useCallback(() => {
    console.log('[ProjectPage] Reloading preview iframes...')
    setTimeout(() => {
      const iframes = document.querySelectorAll('iframe')
      iframes.forEach(iframe => {
        if (iframe.src && (iframe.src.includes('https://') || iframe.src.includes('http://'))) {
          console.log('[ProjectPage] Reloading iframe:', iframe.src.substring(0, 50))
          // Trigger reload by reassigning src
          iframe.src = iframe.src
        }
      })
      console.log('[ProjectPage] Preview iframes reloaded')
    }, 1000)
  }, [])

  // Track retry state
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const lastMessageRef = useRef<string | null>(null)
  const maxRetries = 3
  // Track if we've received meaningful content to avoid retrying successful requests
  const hasReceivedContentRef = useRef(false)
  // Track the current request to prevent duplicate submissions
  const currentRequestIdRef = useRef<string | null>(null)

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    setMessages,
    append,
    reload: reloadChat,
    isLoading: isChatLoading,
    stop: stopChat,
    status: streamStatus,
    error: chatError,
  } = useChat({
    experimental_throttle: 100, // 100ms throttle to prevent excessive re-renders during streaming
    api: '/api/chat',
    body: chatBody,
    // Remove id to prevent automatic persistence/caching of all messages
    // We manually load only the last 30 messages via setMessages
    // id: projectId ? `chat-${projectId}` : undefined,
    sendExtraMessageFields: true, // Send id and createdAt fields for each message
    keepLastMessageOnError: true, // Keep last message on error for retry
    onResponse: (response) => {
      // Mark that we've started receiving content as soon as the response starts
      // This prevents automatic retries from triggering when the stream is active
      if (response.ok) {
        console.log('[Chat] Response received, marking content as received to prevent retries')
        hasReceivedContentRef.current = true
      }
    },
    experimental_prepareRequestBody: ({ messages, requestData, requestBody }) => {
      // Only send the last user message to avoid payload too large errors
      const lastUserMessage = messages.filter(m => m.role === 'user').pop()

      // Generate a unique request ID and track it to prevent duplicate submissions
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      currentRequestIdRef.current = requestId

      console.log('[useChat] experimental_prepareRequestBody called:', {
        totalMessages: messages.length,
        hasLastUserMessage: !!lastUserMessage,
        requestId,
      })

      // Get imageAttachments from multiple sources (in priority order):
      // 1. lastUserMessage.experimental_attachments - already on message (from append)
      // 2. requestData.imageAttachments - passed via handleSubmit options.data
      // 3. imageAttachmentsRef - the ref (backup)
      const imageAttachmentsFromMessage = (lastUserMessage as any)?.experimental_attachments as ImageAttachment[] | undefined
      const imageAttachmentsFromData = (requestData as any)?.imageAttachments as ImageAttachment[] | undefined
      const imageAttachmentsFromRef = imageAttachmentsRef.current

      // Priority: message > requestData > ref
      const imageAttachments = (imageAttachmentsFromMessage?.length ?? 0) > 0
        ? imageAttachmentsFromMessage
        : (imageAttachmentsFromData?.length ?? 0) > 0
          ? imageAttachmentsFromData
          : imageAttachmentsFromRef

      console.log('[useChat] imageAttachments sources:', {
        fromMessage: imageAttachmentsFromMessage?.length || 0,
        fromData: imageAttachmentsFromData?.length || 0,
        fromRef: imageAttachmentsFromRef?.length || 0,
        finalCount: imageAttachments?.length || 0,
      })

      // Only add experimental_attachments if not already present on message
      let messageToSend = lastUserMessage
      if (lastUserMessage && (imageAttachments?.length ?? 0) > 0 && !imageAttachmentsFromMessage?.length) {
        messageToSend = {
          ...lastUserMessage,
          experimental_attachments: imageAttachments,
        }
      }

      // Get skills from multiple sources (in priority order):
      // 1. requestBody.skills - passed via options.body (from chat-panel-input)
      // 2. lastUserMessage.annotations - stored in message (from homepage)
      const skillsFromBody = (requestBody as any)?.skills as string[] | undefined
      const skillsFromAnnotations = (lastUserMessage as any)?.annotations?.find((ann: any) => ann.type === 'skills')?.skills as string[] | undefined

      console.log('[useChat] Skills extraction:', {
        fromBody: skillsFromBody,
        fromAnnotations: skillsFromAnnotations,
        annotations: (lastUserMessage as any)?.annotations,
      })

      // Priority: body > annotations
      const skills = (skillsFromBody?.length ?? 0) > 0
        ? skillsFromBody
        : skillsFromAnnotations

      if (skills && skills.length > 0) {
        console.log('[useChat] Final skills to send to API:', skills)
      }

      // Build the request body
      const newBody = {
        projectId: chatBody.projectId,
        userId: chatBody.userId,
        claudeModel: chatBody.claudeModel,
        fileEdition: chatBody.fileEdition,
        selectionData: chatBody.selectionData,
        imageAttachments: (imageAttachments?.length ?? 0) > 0 ? imageAttachments : undefined,
        skills: skills && skills.length > 0 ? skills : undefined,
        messages: messageToSend ? [messageToSend] : [],
      }

      console.log('[useChat] Final request body:', {
        projectId: newBody.projectId,
        userId: newBody.userId,
        imageAttachmentsCount: newBody.imageAttachments?.length || 0,
        skillsCount: newBody.skills?.length || 0,
        skillsSource: skillsFromBody ? 'body' : skillsFromAnnotations ? 'annotations' : 'none',
        hasMessages: newBody.messages.length > 0,
      })

      return newBody
    },
    onFinish: (message: any) => {
      console.log('[Chat] Message finished:', message.role, 'content length:', message.content?.length || 0)

      // Mark that we've received content successfully (should already be true from onResponse)
      hasReceivedContentRef.current = true

      // Clear the current request ID since this request is complete
      currentRequestIdRef.current = null

      // Reset retry count on successful completion
      setRetryCount(0)
      setIsRetrying(false)

      // Clear pending edit data and image attachments
      setPendingEditData(null)
      setImageAttachments([])

      // Reload preview iframes when assistant finishes responding
      if (message.role === 'assistant') {
        console.log('[Chat] Assistant message finished, reloading preview iframes')
        reloadPreviewIframes()

        // Keep only the last 2 messages (user + assistant) to prevent bloat
        setTimeout(() => {
          setMessages((prev) => {
            if (prev.length > 2) {
              console.log(`[Chat] Trimming messages from ${prev.length} to last 2 (clean slate mode)`)
              return prev.slice(-2)
            }
            return prev
          })
        }, 100)
      }
    },
    onError: (error: Error) => {
      console.error('[Chat] Stream error detected:', {
        errorMessage: error.message,
        errorType: error.name,
        retryCount,
        isRetrying,
        hasReceivedContent: hasReceivedContentRef.current,
        currentRequestId: currentRequestIdRef.current,
      })

      // IMPORTANT: Do NOT automatically retry on errors.
      // The agent/backend may still be running and processing the request.
      // Automatic retries can cause duplicate work and message resets.
      //
      // If we've already received content successfully, the stream was working.
      // If we haven't, the user can manually retry by resending the message.

      if (hasReceivedContentRef.current) {
        console.log('[Chat] ⚠️ Stream error after receiving content - likely just a connection close, not a real error')
        hasReceivedContentRef.current = false // Reset for next message
        currentRequestIdRef.current = null // Clear request ID
        setIsRetrying(false)
        return
      }

      // Clear state but do NOT retry automatically
      // This prevents the bug where messages get reset and duplicate agent runs
      console.log('[Chat] ⚠️ Stream error occurred. NOT retrying automatically to prevent duplicate agent runs.')
      console.log('[Chat] User can manually resend message if needed.')
      currentRequestIdRef.current = null
      setIsRetrying(false)
      setRetryCount(0)
    },
  })

  // Stream recovery hook - auto-recovers when streaming stalls
  const {
    isRecovering: isStreamRecovering,
    recoveryCount: streamRecoveryCount,
    triggerRecovery: triggerStreamRecovery,
  } = useStreamRecovery({
    messages,
    status: streamStatus,
    isLoading: isChatLoading,
    projectId: projectId || null,
    userId: session?.user?.id || null,
    setMessages,
    stallTimeoutMs: 30000, // 30 seconds before considering stream stalled
    enabled: true, // Enable auto-recovery
  })

  // Log stream recovery events
  useEffect(() => {
    if (streamRecoveryCount > 0) {
      console.log('[Chat] Stream recovery triggered', { recoveryCount: streamRecoveryCount })
    }
  }, [streamRecoveryCount])

  // Set up the handleSendToFix function after useChat is initialized
  useEffect(() => {
    handleSendToFixRef.current = (errorMessage: string) => {
      // Create a synthetic event to set the input value
      if (typeof handleInputChange === 'function') {
        const event = {
          target: { value: errorMessage },
        } as React.ChangeEvent<HTMLInputElement>
        handleInputChange(event)
      } else {
        console.warn('[ProjectPage] handleSendToFix: handleInputChange is not a function')
      }
    }
  }, [handleInputChange])

  // Reset history loaded state when projectId changes
  useEffect(() => {
    setIsHistoryLoaded(false)
    hasRun.current = false
    hasSubmittedFirstMessage.current = false
    hasSubmittedFirstMessageToAPI.current = false
    firstMessageRef.current = null
    isInitialLoad.current = true // Reset on project change
  }, [projectId])

  // Store firstMessage in ref when page loads (before URL cleanup)
  useEffect(() => {
    if (firstMessage && !hasSubmittedFirstMessage.current) {
      console.log('Storing first message in ref:', firstMessage)
      firstMessageRef.current = firstMessage
      hasSubmittedFirstMessage.current = true
    }
  }, [firstMessage])

  // Set imageAttachments from URL params when page loads (for images from homepage)
  // This must run BEFORE the first message is submitted to the API
  // IMPORTANT: Only update ref, NOT state - this prevents the flash in chat-panel-input preview
  useEffect(() => {
    if (imageUrlsFromUrl && !hasSubmittedFirstMessageToAPI.current) {
      try {
        const urls = JSON.parse(imageUrlsFromUrl) as string[]
        console.log('[Project] Parsing imageUrls from URL:', urls.length, 'images')
        const attachments: ImageAttachment[] = urls.map(url => ({
          url,
          contentType: 'image/png', // Default to PNG, actual type is in the URL
          name: 'uploaded-image',
          size: 0,
        }))
        // Only update ref directly, don't set state (avoids flash in input preview)
        imageAttachmentsRef.current = attachments
        console.log('[Project] Set image attachments ref from URL:', attachments.length)
      } catch (err) {
        console.error('[Project] Failed to parse imageUrls from URL:', err)
      }
    }
  }, [imageUrlsFromUrl])

  // Set skills from URL params when page loads (for skills from homepage)
  // This must run BEFORE the first message is submitted to the API
  useEffect(() => {
    if (skillsFromUrl && !hasSubmittedFirstMessageToAPI.current) {
      try {
        const skillIds = JSON.parse(skillsFromUrl) as string[]
        console.log('[Project] Parsing skills from URL:', skillIds.length, 'skills')
        // Only update ref directly
        skillsFromUrlRef.current = skillIds
        console.log('[Project] Set skills ref from URL:', skillIds)
      } catch (err) {
        console.error('[Project] Failed to parse skills from URL:', err)
      }
    }
  }, [skillsFromUrl])

  const [result, setResult] = useState<ExecutionResult>()
  const [appData, setAppData] = useState<any>()
  const [currentTab, setCurrentTab] = useState<'code' | 'fragment'>('code')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isAuthDialogOpen, setAuthDialog] = useState(false)
  const [userTeam, setUserTeam] = useState<any>(null)
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [isNewProject, setIsNewProject] = useState(false)

  // Set up ngrok health monitoring for this project
  // Note: result?.ngrokUrl is used as fallback since it's set immediately when server starts,
  // while currentProject?.ngrokUrl comes from database and may not be updated yet
  // serverReady: Only start health checks after initial server setup is complete
  // (when we have a result URL and preview is not loading)
  const {
    isNgrokHealthy,
    isBackupActive,
    isStartingBackup,
  } = useNgrokHealthCheck({
    sandboxId: currentProject?.sandboxId || null,
    projectId: projectId || null,
    userId: session?.user?.id || null,
    ngrokUrl: (result as any)?.ngrokUrl || currentProject?.ngrokUrl || null,
    enabled: !!currentProject?.sandboxId && !!session?.user?.id,
    serverReady: !!(result as any)?.url && !isPreviewLoading, // Only start after initial server is ready
    pollingInterval: 60000, // 60 seconds
    // When backup server starts successfully, update the preview URL
    onBackupServerReady: (newSandboxUrl, newNgrokUrl) => {
      console.log('[Project] Backup server ready, updating preview URL:', newSandboxUrl)
      setResult(prev => ({
        ...prev,
        url: newSandboxUrl,
        ngrokUrl: newNgrokUrl,
      }))
      // Force preview to reload with new URL
      setPreviewKey(prev => prev + 1)
    },
  })
  const hasRun = useRef(false)
  const hasSubmittedFirstMessage = useRef(false)
  const hasSubmittedFirstMessageToAPI = useRef(false) // Track if we've actually sent the first message to the API
  const firstMessageRef = useRef<string | null>(null) // Store firstMessage value before removing from URL
  const isInitialLoad = useRef(true) // Track if this is the initial page load vs a reload

  const [isLoading, setIsLoading] = useState(false)

  // Track sandbox start time to avoid unnecessary restarts on refocus
  const sandboxStartTimeRef = useRef<Date | null>(null)
  // Track if we're currently starting/restarting the server to avoid race conditions
  const isStartingServerRef = useRef(false)

  // Code panel state
  const [currentFile, setCurrentFile] = useState('')
  const [code, setCode] = useState('')
  const [contentMode, setContentMode] = useState<'preview' | 'code'>('preview')
  const [activeTab, setActiveTab] = useCookieStorage<'chat' | 'panel'>('activeTab', 'chat')
  const [mobileActivePanel, setMobileActivePanel] = useState<'chat' | 'preview'>('chat')
  const [chatKey, setChatKey] = useState(0) // Key to force remount ChatPanel
  const [previewKey, setPreviewKey] = useState(0) // Key to force reload preview when backup server starts

  // Cloud (Convex) state
  const [cloudEnabled, setCloudEnabled] = useState(false)
  const [cloudDeploymentUrl, setCloudDeploymentUrl] = useState<string | undefined>()

  // Use global view mode from context
  const { viewMode, toggleViewMode } = useViewMode()

  // Track if user has seen Expo Go modal
  const [hasSeenExpoGoModal, setHasSeenExpoGoModal] = useState(false)
  const [showExpoGoModal, setShowExpoGoModal] = useState(false)

  // Load Expo Go modal state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('hasSeenExpoGoModal')
      setHasSeenExpoGoModal(seen === 'true')
    }
  }, [])

  // Handle Native app button click
  const handleNativeAppClick = () => {
    // Show modal if user hasn't seen it before
    if (!hasSeenExpoGoModal) {
      setShowExpoGoModal(true)
      setHasSeenExpoGoModal(true)
      localStorage.setItem('hasSeenExpoGoModal', 'true')
    } else {
      // If modal has been seen, open Expo Go directly
      if ((result as any)?.ngrokUrl) {
        const expoUrl = (result as any).ngrokUrl.replace('https://', 'exp://')
        window.location.href = expoUrl
      }
    }
  }

  // Fetch cloud status when project is loaded
  const fetchCloudStatus = useCallback(async () => {
    if (!projectId) return
    try {
      const response = await fetch(`/api/convex/status?projectId=${projectId}`)
      if (response.ok) {
        const data = await response.json()
        setCloudEnabled(data.connected === true)
        setCloudDeploymentUrl(data.credentials?.deploymentUrl)
      }
    } catch (error) {
      console.error('[CloudStatus] Failed to fetch:', error)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) {
      fetchCloudStatus()
    }
  }, [projectId, fetchCloudStatus])

  const handleCloudEnabled = useCallback(() => {
    fetchCloudStatus()
  }, [fetchCloudStatus])

  // Legacy compatibility
  const isDesktopMode = viewMode === 'desktop'

  // Mobile and scroll detection
  const isMobile = useIsMobile()

  // Check if user (authenticated or not) should be redirected to remix page
  useEffect(() => {
    const checkPublicAccess = async () => {
      // Skip if still loading session, no projectId, or creating a new project with firstMessage
      if (isSessionLoading || !projectId || firstMessage) {
        return
      }

      console.log('[ProjectPage] Checking if redirect to remix page is needed...')

      try {
        // First, check if this is a public project
        const publicResponse = await fetch(`/api/projects/${projectId}/public`)

        if (!publicResponse.ok) {
          // Not a public project, continue with normal flow
          console.log('[ProjectPage] Project is not public or not found')
          return
        }

        const publicData = await publicResponse.json()
        const projectOwnerId = publicData.project?.userId

        console.log('[ProjectPage] Project is public. Owner:', projectOwnerId, 'Current user:', session?.user?.id)

        // If no session (not logged in), redirect to remix page
        if (!session?.user?.id) {
          console.log('[ProjectPage] No session, redirecting to remix page')
          router.push(`/p/${projectId}/remix`)
          return
        }

        // If logged in but not the owner, redirect to remix page
        if (projectOwnerId && session.user.id !== projectOwnerId) {
          console.log('[ProjectPage] User is not the owner, redirecting to remix page')
          router.push(`/p/${projectId}/remix`)
          return
        }

        console.log('[ProjectPage] User is the owner, allowing access to project page')
      } catch (error) {
        console.error('[ProjectPage] Error checking public project:', error)
      }
    }

    checkPublicAccess()
  }, [isSessionLoading, session?.user?.id, projectId, firstMessage, router])

  // Load project data
  useEffect(() => {
    const load = async () => {
      console.log('🚀 [ProjectPage] Main useEffect triggered:', {
        isSessionLoading,
        hasUserId: !!session?.user?.id,
        projectId,
        hasRun: hasRun.current,
        firstMessage: !!firstMessage,
      })

      if (
        !isSessionLoading &&
        session?.user?.id &&
        projectId &&
        !hasRun.current
      ) {
        hasRun.current = true
        console.log('🚀 [ProjectPage] Starting project load sequence...')

        // Set template from URL if provided
        if (templateFromUrl) {
          setSelectedTemplate(templateFromUrl as TemplateId)
        }

        if (firstMessage) {
          setIsNewProject(true)
        }

        await loadProject()
      }
    }
    load()
  }, [isSessionLoading, session?.user?.id, projectId, firstMessage])

  // DON'T initialize result from cached URLs - wait for sandbox verification
  // The verifySandboxAndStartServer useEffect will handle setting the result after verification
  // Removed this useEffect to prevent showing dead URLs before verification

  // Start server when we have a project with sandboxId
  useEffect(() => {
    const verifySandboxAndStartServer = async () => {
      console.log('[DEBUG] verifySandboxAndStartServer called with:', {
        sandboxId: currentProject?.sandboxId,
        userId: session?.user?.id,
        isRemixedProject,
        hasNgrokUrl: !!currentProject?.ngrokUrl,
        hasSandboxUrl: !!currentProject?.sandboxUrl,
      })

      if (!currentProject?.sandboxId || !session?.user?.id) {
        console.log('[DEBUG] Early return - missing sandboxId or userId')
        return
      }

      // For remixed projects, still check if Expo server is running
      // but skip the full sandbox verification since remix API already handled container creation
      if (isRemixedProject) {
        console.log('[Server Check] Remixed project - checking only Expo server status')

        if (currentProject.ngrokUrl && currentProject.sandboxUrl) {
          try {
            const expoCheckResponse = await fetch('/api/check-expo-server', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: currentProject.ngrokUrl,
                sandboxId: currentProject.sandboxId
              }),
            })

            const expoResult = await expoCheckResponse.json()
            console.log('[Server Check] Remixed project Expo check:', expoResult)

            if (!expoResult.isAlive) {
              console.log('[Server Check] Expo server is down on remixed project, checking if sandbox still exists...')
              isStartingServerRef.current = true
              setIsPreviewLoading(true)

              try {
                // First check if sandbox still exists
                const sandboxCheckResponse = await fetch('/api/check-sandbox', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ sandboxId: currentProject.sandboxId }),
                })

                const sandboxCheck = await sandboxCheckResponse.json()
                console.log('[Server Check] Remixed project sandbox check:', sandboxCheck)

                if (!sandboxCheck.isAlive) {
                  // Sandbox is gone, use resume-container to recreate it
                  console.log('[Server Check] Sandbox is gone, using resume-container to recreate...')
                  const response = await fetch('/api/resume-container', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      projectId: currentProject.id,
                      userID: session.user.id,
                      teamID: userTeam?.id,
                    }),
                  })

                  const result = await response.json()
                  console.log('[Server Check] Resume container result:', result)

                  if (result.success) {
                    setResult({
                      url: result.url,
                      ngrokUrl: result.ngrokUrl,
                      sbxId: result.sandboxId,
                      projectId: currentProject.id,
                      projectTitle: currentProject.title,
                      template: currentProject.template as any,
                      recreated: true,
                    })
                  }
                } else {
                  // Sandbox exists, just restart the Expo server
                  console.log('[Server Check] Sandbox exists, restarting Expo server...')
                  const response = await fetch('/api/start-server', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      sandboxId: currentProject.sandboxId,
                      projectId: currentProject.id,
                      userID: session.user.id,
                    }),
                  })

                  const serverResult = await response.json()
                  console.log('[Server Check] Remixed project server restart result:', serverResult)

                  if (serverResult.success) {
                    const timestamp = Date.now()
                    const urlWithTimestamp = `${serverResult.url}${serverResult.url.includes('?') ? '&' : '?'}_t=${timestamp}`

                    setResult({
                      url: urlWithTimestamp,
                      ngrokUrl: serverResult.ngrokUrl,
                      sbxId: currentProject.sandboxId,
                      projectId: currentProject.id,
                      projectTitle: currentProject.title,
                      template: currentProject.template as any,
                    })
                  }
                }
              } catch (error) {
                console.error('[Server Check] Error handling remixed project:', error)
              } finally {
                setIsPreviewLoading(false)
                isStartingServerRef.current = false
              }
            }
          } catch (error) {
            console.error('[Server Check] Error checking Expo server for remixed project:', error)
          }
        }

        return
      }

      console.log('[Server Check] Checking sandbox status on page load...')
      console.log('[Server Check] Current project:', {
        sandboxId: currentProject.sandboxId,
        hasNgrokUrl: !!currentProject.ngrokUrl,
        hasSandboxUrl: !!currentProject.sandboxUrl,
        ngrokUrl: currentProject.ngrokUrl,
        sandboxUrl: currentProject.sandboxUrl,
        isInitialLoad: isInitialLoad.current,
        isNewProject,
      })

      // SPLIT LOGIC: Handle initial creation vs page reload differently
      // For initial creation (coming from homepage with firstMessage), start server directly
      // For page reload, verify sandbox status first
      if (isInitialLoad.current && isNewProject) {
        console.log('[Server Check] Initial project creation - starting Expo server directly')
        // Mark as no longer initial load after this check
        isInitialLoad.current = false
        // Start the server for the newly created container
        // Call checkServerStatus directly inline to ensure we have the latest currentProject state
        isStartingServerRef.current = true
        setIsPreviewLoading(true)

        try {
          const response = await fetch('/api/start-server', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sandboxId: currentProject.sandboxId,
              projectId: currentProject.id,
              userID: session.user.id,
            }),
          })

          const serverResult = await response.json()
          console.log('[Server Check] Initial start server result:', serverResult)

          if (serverResult.success) {
            console.log('[Server Check] Initial server started, setting result with URL:', serverResult.url)

            // Add cache-busting timestamp to force iframe reload
            const timestamp = Date.now()
            const urlWithTimestamp = `${serverResult.url}${serverResult.url.includes('?') ? '&' : '?'}_t=${timestamp}`

            setResult({
              url: urlWithTimestamp,
              ngrokUrl: serverResult.ngrokUrl,
              sbxId: currentProject.sandboxId,
              projectId: currentProject.id,
              projectTitle: currentProject.title,
              template: currentProject.template as any,
            })

            console.log('[Server Check] Initial result set with cache-busted URL:', urlWithTimestamp)

            posthog.capture('server_started', {
              projectId: currentProject.id,
              sandboxId: currentProject.sandboxId,
              url: serverResult.url,
              cached: serverResult.cached,
            })
          } else {
            console.error('[Server Check] Failed to start initial server:', serverResult.error)
          }
        } catch (error) {
          console.error('[Server Check] Error starting initial server:', error)
        } finally {
          setIsPreviewLoading(false)
          isStartingServerRef.current = false
        }

        return
      }

      // Mark as no longer initial load
      isInitialLoad.current = false

      // RELOAD FLOW: Check if sandbox is running (might be stale/deleted)
      // The URLs in DB might be stale if sandbox was paused/destroyed
      console.log('[Server Check] Page reload or existing project - verifying sandbox is running...')

      try {
        // Check if sandbox container is actually running
        const sandboxStatusResponse = await fetch('/api/sandbox-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId: currentProject.id,
            userID: session.user.id,
          }),
        })

        const statusResult = await sandboxStatusResponse.json()
        console.log('[Server Check] Sandbox status:', statusResult)

        // Store the sandbox start time for future refocus checks
        if (statusResult.startedAt) {
          sandboxStartTimeRef.current = new Date(statusResult.startedAt)
          console.log('[Server Check] Stored sandbox start time:', sandboxStartTimeRef.current)
        }

        // If sandbox is not running, need to resume it
        if (statusResult.needsResume || !statusResult.isRunning) {
          console.log('[Server Check] Sandbox is down, resuming container and starting server...')
          isStartingServerRef.current = true
          setIsPreviewLoading(true)

          try {
            const response = await fetch('/api/resume-container', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                projectId: currentProject.id,
                userID: session.user.id,
                teamID: userTeam?.id,
              }),
            })

            const result = await response.json()
            console.log('[Server Check] Resume container result:', result)

            if (result.success) {
              console.log('[Server Check] Container resumed and server started')

              // Reset sandbox start time since we just created/resumed it
              sandboxStartTimeRef.current = new Date()
              console.log('[Server Check] Reset sandbox start time to now:', sandboxStartTimeRef.current)

              // Update result with fresh URLs
              setResult({
                url: result.url,
                ngrokUrl: result.ngrokUrl,
                sbxId: result.sandboxId,
                projectId: currentProject.id,
                projectTitle: currentProject.title,
                template: currentProject.template as any,
              })
            }
          } catch (error) {
            console.error('[Server Check] Error resuming container:', error)
          } finally {
            setIsPreviewLoading(false)
            isStartingServerRef.current = false
          }
          return
        }

        // Sandbox is running - now verify Expo server is also running
        if (currentProject.ngrokUrl && currentProject.sandboxUrl) {
          console.log('[Server Check] Sandbox running and URLs exist, verifying Expo server...')
          console.log('[Server Check] Current ngrokUrl:', currentProject.ngrokUrl)
          console.log('[Server Check] Current sandboxUrl:', currentProject.sandboxUrl)

          // Check if Expo server is actually responding
          let expoServerIsAlive = false
          try {
            const expoCheckResponse = await fetch('/api/check-expo-server', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: currentProject.ngrokUrl,
                sandboxId: currentProject.sandboxId  // Pass sandboxId for direct port check
              }),
            })

            if (!expoCheckResponse.ok) {
              console.error('[Server Check] Expo check API returned error:', expoCheckResponse.status)
            } else {
              const expoResult = await expoCheckResponse.json()
              console.log('[Server Check] Expo check result:', expoResult)
              expoServerIsAlive = expoResult.isAlive

              if (expoServerIsAlive) {
                console.log('[Server Check] ✅ Both sandbox and Expo server are running, showing preview')
                setResult({
                  url: currentProject.sandboxUrl,
                  ngrokUrl: currentProject.ngrokUrl,
                  sbxId: currentProject.sandboxId,
                  projectId: currentProject.id,
                  projectTitle: currentProject.title,
                  template: currentProject.template as any,
                })
                setIsPreviewLoading(false)
                return
              }
            }

            // Expo server is down, need to restart it
            console.log('[Server Check] ⚠️ Sandbox running but Expo server is down (isAlive:', expoServerIsAlive, '), restarting server...')
          } catch (expoError) {
            console.error('[Server Check] Error checking Expo server, will restart:', expoError)
          }
        } else {
          console.log('[Server Check] No URLs in database, will start server from scratch')
        }

        // Either no URLs or Expo server is down - need to start/restart the server
        console.log('[Server Check] Starting/restarting Expo server...')
        isStartingServerRef.current = true
        setIsPreviewLoading(true)

        try {
          const response = await fetch('/api/start-server', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sandboxId: currentProject.sandboxId,
              projectId: currentProject.id,
              userID: session.user.id,
            }),
          })

          const serverResult = await response.json()
          console.log('[Server Check] Start/restart server result:', serverResult)

          if (serverResult.success) {
            console.log('[Server Check] Server started/restarted successfully')

            // Add cache-busting timestamp to force iframe reload
            const timestamp = Date.now()
            const urlWithTimestamp = `${serverResult.url}${serverResult.url.includes('?') ? '&' : '?'}_t=${timestamp}`

            setResult({
              url: urlWithTimestamp,
              ngrokUrl: serverResult.ngrokUrl,
              sbxId: currentProject.sandboxId,
              projectId: currentProject.id,
              projectTitle: currentProject.title,
              template: currentProject.template as any,
            })

            console.log('[Server Check] Result set with cache-busted URL:', urlWithTimestamp)

            posthog.capture('server_started', {
              projectId: currentProject.id,
              sandboxId: currentProject.sandboxId,
              url: serverResult.url,
              cached: serverResult.cached,
            })
          } else {
            console.error('[Server Check] Failed to start/restart server:', serverResult.error)
          }
        } catch (serverError) {
          console.error('[Server Check] Error starting/restarting server:', serverError)
        } finally {
          setIsPreviewLoading(false)
          isStartingServerRef.current = false
        }
      } catch (error) {
        console.error('[Server Check] Error checking sandbox status:', error)
        // If status check fails, try to resume container
        console.log('[Server Check] Status check failed, attempting to resume container...')
        isStartingServerRef.current = true
        setIsPreviewLoading(true)

        try {
          const response = await fetch('/api/resume-container', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId: currentProject.id,
              userID: session.user.id,
              teamID: userTeam?.id,
            }),
          })

          const result = await response.json()
          console.log('[Server Check] Resume container result:', result)

          if (result.success) {
            console.log('[Server Check] Container resumed successfully')

            // Reset sandbox start time since we just created/resumed it
            sandboxStartTimeRef.current = new Date()
            console.log('[Server Check] Reset sandbox start time to now:', sandboxStartTimeRef.current)

            setResult({
              url: result.url,
              ngrokUrl: result.ngrokUrl,
              sbxId: result.sandboxId,
              projectId: currentProject.id,
              projectTitle: currentProject.title,
              template: currentProject.template as any,
            })
          }
        } catch (resumeError) {
          console.error('[Server Check] Error resuming container:', resumeError)
        } finally {
          setIsPreviewLoading(false)
          isStartingServerRef.current = false
        }
      }
    }

    // Only run if we have session and sandboxId
    if (currentProject?.sandboxId && session?.user?.id) {
      verifySandboxAndStartServer()
    }
  }, [currentProject?.sandboxId, session?.user?.id, isRemixedProject])

  // Check sandbox status when user returns to the tab
  useEffect(() => {
    const handleVisibilityChange = async () => {
      console.log('[Visibility] Visibility changed:', {
        hidden: document.hidden,
        projectId: currentProject?.id,
        sandboxId: currentProject?.sandboxId,
      })

      // When user comes back to the tab (document becomes visible)
      if (!document.hidden && currentProject?.sandboxId && session?.user?.id) {
        console.log('[Visibility] User returned to tab, checking sandbox and server status...')

        // Skip if we're already in the process of starting the server (prevents race conditions)
        if (isStartingServerRef.current) {
          console.log('[Visibility] Server is already starting, skipping visibility check to avoid race condition')
          return
        }

        try {
          // STEP 1: Check if sandbox container is alive first (silently, no loading UI)
          console.log('[Visibility] Silently checking sandbox container status...')

          const sandboxStatusResponse = await fetch('/api/sandbox-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId: currentProject.id,
              userID: session.user.id,
            }),
          })

          const statusResult = await sandboxStatusResponse.json()
          console.log('[Visibility] Sandbox status check result:', statusResult)

          // Store the sandbox start time for future checks
          if (statusResult.startedAt) {
            sandboxStartTimeRef.current = new Date(statusResult.startedAt)
            console.log('[Visibility] Stored sandbox start time:', sandboxStartTimeRef.current)
          }

          // Calculate if the sandbox has likely expired (E2B sandboxes last 1 hour)
          // Use the fresh startedAt from status check, not just the ref
          const now = new Date()
          const ONE_HOUR_MS = 60 * 60 * 1000
          let isWithinLifetime = false

          if (statusResult.startedAt) {
            const sandboxStartTime = new Date(statusResult.startedAt)
            const timeSinceStart = now.getTime() - sandboxStartTime.getTime()
            isWithinLifetime = timeSinceStart < ONE_HOUR_MS

            if (isWithinLifetime) {
              console.log('[Visibility] Sandbox is within 1-hour lifetime', {
                timeSinceStart: Math.round(timeSinceStart / 1000 / 60), // minutes
                remainingTime: Math.round((ONE_HOUR_MS - timeSinceStart) / 1000 / 60), // minutes
              })
            } else {
              console.log('[Visibility] Sandbox has likely expired (>1 hour)', {
                timeSinceStart: Math.round(timeSinceStart / 1000 / 60), // minutes
              })
            }
          }

          // If sandbox needs to be resumed (destroyed/stopped)
          if (statusResult.needsResume || !statusResult.isRunning) {
            console.log('[Visibility] Sandbox is down and needs resume')
            console.log('[Visibility] Status:', {
              isRunning: statusResult.isRunning,
              needsResume: statusResult.needsResume,
              error: statusResult.error
            })

            // Show loading state while resuming (ONLY when actually resuming)
            isStartingServerRef.current = true
            setIsPreviewLoading(true)
            try {
              const response = await fetch('/api/resume-container', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  projectId: currentProject.id,
                  userID: session.user.id,
                  teamID: userTeam?.id,
                }),
              })

              const result = await response.json()
              console.log('[Visibility] Resume container result:', result)

              if (result.success) {
                console.log('[Visibility] Container resumed successfully')

                // Reset sandbox start time since we just created/resumed it
                sandboxStartTimeRef.current = new Date()
                console.log('[Visibility] Reset sandbox start time to now:', sandboxStartTimeRef.current)

                // Update result state with fresh URLs
                setResult({
                  url: result.url,
                  ngrokUrl: result.ngrokUrl,
                  sbxId: result.sandboxId,
                  projectId: currentProject.id,
                  projectTitle: currentProject.title,
                  template: currentProject.template as any,
                })
              } else {
                console.error('[Visibility] Failed to resume container:', result.error)
              }
            } catch (error) {
              console.error('[Visibility] Error resuming container:', error)
            } finally {
              setIsPreviewLoading(false)
              isStartingServerRef.current = false
            }
            return
          }

          // STEP 2: Sandbox is running, now check if Expo server is responding
          if (currentProject.ngrokUrl) {
            console.log('[Visibility] Sandbox running, checking if Expo server is responding...')

            try {
              const expoCheckResponse = await fetch('/api/check-expo-server', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  url: currentProject.ngrokUrl,
                  sandboxId: currentProject.sandboxId  // Pass sandboxId for direct port check
                }),
              })

              const expoResult = await expoCheckResponse.json()

              if (expoResult.isAlive) {
                console.log('[Visibility] ✅ Both sandbox and Expo server are running!')

                // If within 1-hour lifetime and everything is healthy, skip any UI updates
                if (isWithinLifetime) {
                  console.log('[Visibility] Sandbox is healthy and within lifetime, no action needed')
                  return
                }

                // Even if expired, if everything is working, no need to restart
                console.log('[Visibility] Sandbox expired but still working, no restart needed')
                return
              }

              console.log('[Visibility] Expo server not responding, restarting...')

              // Only show loading UI when actually restarting (ONLY when Expo server is down)
              isStartingServerRef.current = true
              setIsPreviewLoading(true)
              try {
                const response = await fetch('/api/start-server', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    sandboxId: currentProject.sandboxId,
                    projectId: currentProject.id,
                    userID: session.user.id,
                  }),
                })

                const serverResult = await response.json()

                if (serverResult.success) {
                  console.log('[Visibility] Expo server restarted successfully')

                  // Add cache-busting timestamp to force iframe reload
                  const timestamp = Date.now()
                  const urlWithTimestamp = `${serverResult.url}${serverResult.url.includes('?') ? '&' : '?'}_t=${timestamp}`

                  setResult({
                    url: urlWithTimestamp,
                    ngrokUrl: serverResult.ngrokUrl,
                    sbxId: currentProject.sandboxId,
                    projectId: currentProject.id,
                    projectTitle: currentProject.title,
                    template: currentProject.template as any,
                  })

                  console.log('[Visibility] Result set with cache-busted URL:', urlWithTimestamp)
                }
              } catch (error) {
                console.error('[Visibility] Error restarting Expo server:', error)
              } finally {
                setIsPreviewLoading(false)
                isStartingServerRef.current = false
              }
            } catch (error) {
              console.log('[Visibility] Error checking Expo server:', error)
            }
          }
        } catch (error) {
          console.error('[Visibility] Error checking sandbox status:', error)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentProject, session?.user?.id, userTeam?.id])

  // Screenshot triggering has been moved to PreviewPanel component
  // It now triggers on iframe onLoad event with a 10-second delay

  // Handle first message submission after project is created AND container is ready
  useEffect(() => {
    // Use the ref value which persists even after URL is cleaned up
    const firstMessageValue = firstMessageRef.current

    // console.log('First message useEffect triggered:', {
    //   firstMessage: firstMessage || 'NO_FIRST_MESSAGE',
    //   firstMessageValue: firstMessageValue || 'NO_FIRST_MESSAGE_VALUE',
    //   currentProject: !!currentProject,
    //   currentProjectId: currentProject?.id,
    //   hasSandboxId: !!currentProject?.sandboxId,
    //   sandboxId: currentProject?.sandboxId || 'NO_SANDBOX_ID',
    //   userId: !!session?.user?.id,
    //   messagesLength: messages.length,
    //   isChatLoading,
    //   isHistoryLoaded,
    //   isPreviewLoading,
    //   streamStatus,
    //   hasSubmittedFirstMessage: hasSubmittedFirstMessage.current,
    //   hasSubmittedFirstMessageToAPI: hasSubmittedFirstMessageToAPI.current,
    //   isWaitingForFirstMessage,
    // })

    // Call append() as soon as we have basic requirements
    // The API will wait for sandboxId to be ready (polling)
    const allConditionsMet =
      firstMessageValue && // Use ref value instead of firstMessage from searchParams
      currentProject && // Project must exist (sandboxId not required - API will wait)
      session?.user?.id &&
      messages.length === 0 && // No messages yet
      !isChatLoading &&
      isHistoryLoaded &&
      streamStatus === 'ready' &&
      hasSubmittedFirstMessage.current &&
      !hasSubmittedFirstMessageToAPI.current // Prevent re-submission

    // console.log(
    //   'All conditions met for first message submission:',
    //   allConditionsMet,
    // )

    if (allConditionsMet) {
      console.log('AUTO-SUBMITTING FIRST MESSAGE TO API:', firstMessageValue)

      // Mark as submitted to prevent re-triggering
      hasSubmittedFirstMessageToAPI.current = true

      // Reset content tracking for this new message
      hasReceivedContentRef.current = false

      // Get image attachments from ref (they were set from URL params)
      const attachmentsForFirstMessage = imageAttachmentsRef.current.length > 0
        ? imageAttachmentsRef.current
        : undefined

      // Get skills from ref (they were set from URL params)
      const skillsForFirstMessage = skillsFromUrlRef.current.length > 0
        ? skillsFromUrlRef.current
        : undefined

      console.log('[First Message] Attaching images:', attachmentsForFirstMessage?.length || 0)
      console.log('[First Message] Attaching skills:', skillsForFirstMessage?.length || 0, skillsForFirstMessage)

      // Submit the first message to API with metadata indicating app is being prepared
      if (typeof append === 'function') {
        const annotations = skillsForFirstMessage && skillsForFirstMessage.length > 0
          ? [{
              type: 'skills',
              skills: skillsForFirstMessage,
            }]
          : undefined

        append({
          id: uuidv4(),
          role: 'user',
          content: firstMessageValue,
          createdAt: new Date(),
          experimental_attachments: attachmentsForFirstMessage,
          annotations: annotations,
          data: { isPreparingApp: true }, // Metadata to show GeneratingAppCard
        } as any)

        // Clear image attachments ref after attaching to message
        // (no need to set state since we never set state for homepage flow)
        if (attachmentsForFirstMessage) {
          imageAttachmentsRef.current = []
        }

        // Clear skills ref after attaching to message
        if (skillsForFirstMessage) {
          skillsFromUrlRef.current = []
        }

        // Remove query parameters after submitting
        console.log('Removing firstMessage query parameter from URL after submitting to API')
        const currentUrl = new URL(window.location.href)
        const newSearchParams = new URLSearchParams(currentUrl.search)
        newSearchParams.delete('firstMessage')
        newSearchParams.delete('template')
        newSearchParams.delete('imageUrls') // Also remove imageUrls from URL
        newSearchParams.delete('skills') // Also remove skills from URL
        const newUrl = `${currentUrl.pathname}${newSearchParams.toString() ? '?' + newSearchParams.toString() : ''}`
        router.replace(newUrl, { scroll: false })
      } else {
        console.error('append is not a function:', { append })
      }
    }
  }, [
    firstMessage, // Keep in deps to trigger initial setup
    currentProject,
    session?.user?.id,
    messages.length,
    isChatLoading,
    isHistoryLoaded,
    streamStatus,
    append,
    router,
    setImageAttachments,
  ])

  // Update code when appData changes
  useEffect(() => {
    if (appData?.code) {
      setCode(appData.code)
    }
  }, [appData])

  const checkServerStatus = async () => {
    console.log('checking server status called')
    if (
      !currentProject?.id ||
      !session?.user?.id ||
      !currentProject?.sandboxId
    ) {
      console.log('No project id, userID, or sandboxId')
      return
    }

    console.log('Starting server for project:', currentProject.id)
    setIsPreviewLoading(true)

    try {
      const response = await fetch('/api/start-server', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sandboxId: currentProject.sandboxId,
          projectId: currentProject.id,
          userID: session.user.id,
        }),
      })

      const serverResult = await response.json()
      console.log('Start server result:', serverResult)

      if (serverResult.success) {
        console.log('Setting result with URL:', serverResult.url)

        // Update result with server URL and ngrokUrl
        const newResult = {
          url: serverResult.url,
          ngrokUrl: serverResult.ngrokUrl,
          sbxId: currentProject.sandboxId!,
          projectId: currentProject.id,
          projectTitle: currentProject.title,
          template: currentProject.template as any,
        }

        console.log('New result object:', newResult)
        setResult(newResult)

        posthog.capture('server_started', {
          projectId: currentProject.id,
          sandboxId: currentProject.sandboxId,
          url: serverResult.url,
          cached: serverResult.cached,
        })
      } else {
        console.error('Failed to start server:', serverResult.error)
      }
    } catch (error) {
      console.error('Error starting server:', error)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  // Initialize search service and cache files for the project
  const initializeSearchCache = async (projectId: string) => {
    try {
      console.log('🔍 [ProjectPage] Initializing search cache for project:', projectId)
      
      // Initialize search service for this project
      await searchService.initialize(projectId)
      
      // Note: Cache will auto-refresh if less than 10 files are cached
      
      // Cache project files in the background (don't wait for it)
      searchService.preloadProjectFiles(projectId)
      
      console.log('✅ [ProjectPage] Search cache initialization started')
    } catch (error) {
      console.error('💥 [ProjectPage] Error initializing search cache:', error)
    }
  }

  // Lightweight refresh function for deployment updates
  const refreshProjectData = async () => {
    console.log('🔄 [ProjectPage] refreshProjectData() called')
    
    if (!session?.user?.id || !projectId) {
      console.log('❌ [ProjectPage] No session or projectId for refresh')
      return
    }

    try {
      const response = await fetch(`/api/projects/${projectId}?userID=${session.user.id}`)
      if (response.ok) {
        const data = await response.json()
        console.log('✅ [ProjectPage] Project data refreshed:', data.project)
        setCurrentProject(data.project)
      }
    } catch (error) {
      console.error('❌ [ProjectPage] Failed to refresh project data:', error)
    }
  }

  const loadProject = async () => {
    console.log('🚀 [ProjectPage] loadProject() called, session:', !!session?.user?.id)
    
    if (!session?.user?.id) {
      console.log('❌ [ProjectPage] No user session, skipping project load')
      return
    }

    console.log('✅ [ProjectPage] User session found, proceeding with project load')
    console.log(
      'Loading project:',
      projectId,
      'for user:',
      session.user.id,
      'firstMessage:',
      firstMessage,
    )

    try {
      const response = await fetch(
        `/api/projects/${projectId}?userID=${session.user.id}`,
      )

      console.log('Project fetch response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('Project loaded successfully:', data.project)
        setCurrentProject(data.project)

        // Set template based on project
        if (data.project.template) {
          setSelectedTemplate(data.project.template)
        }

        // Always load chat history, even if project creation/container setup fails
        await loadChatHistory()

        console.log('🔍 [ProjectPage] About to initialize search cache...')
        // Initialize search cache for this project
        await initializeSearchCache(projectId)
        console.log('✅ [ProjectPage] Search cache initialization completed')

        console.log('>> Project data:', data)

        // Skip container initialization for remixed projects (remix API already handled it)
        if (isRemixedProject) {
          console.log('[Remix] Remixed project detected')
          console.log('[Remix] Project data:', {
            sandboxId: data.project.sandboxId,
            sandboxUrl: data.project.sandboxUrl,
            ngrokUrl: data.project.ngrokUrl,
            title: data.project.title
          })

          // Set the result with URLs that are already in the database
          if (data.project.sandboxUrl || data.project.ngrokUrl) {
            console.log('[Remix] Setting result with existing URLs from remixed project')
            setResult({
              url: data.project.sandboxUrl,
              ngrokUrl: data.project.ngrokUrl,
              sbxId: data.project.sandboxId,
              projectId: data.project.id,
              projectTitle: data.project.title,
              template: data.project.template as any,
            })
            setIsPreviewLoading(false)
          } else {
            console.warn('[Remix] No URLs found for remixed project, attempting to resume container...')
            // If remix API failed to start the server, try resume-container as fallback
            if (data.project.sandboxId && session?.user?.id) {
              try {
                const resumeResponse = await fetch('/api/resume-container', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    projectId: data.project.id,
                    userID: session.user.id,
                  }),
                })

                if (resumeResponse.ok) {
                  const resumeResult = await resumeResponse.json()
                  console.log('[Remix] Resume container successful:', resumeResult)
                  setResult({
                    url: resumeResult.url,
                    ngrokUrl: resumeResult.ngrokUrl,
                    sbxId: resumeResult.sandboxId,
                    projectId: data.project.id,
                    projectTitle: data.project.title,
                    template: data.project.template as any,
                  })
                  setIsPreviewLoading(false)
                } else {
                  console.error('[Remix] Resume container failed:', await resumeResponse.text())
                }
              } catch (resumeError) {
                console.error('[Remix] Error calling resume-container:', resumeError)
              }
            }
          }

          // Cache files after a delay to allow sandbox to be ready
          setTimeout(() => {
            console.log('[Remix] Caching project files for remixed project')
            searchService.cacheProjectFiles(projectId).catch(console.error)
          }, 3000)
          // Don't remove the remixed query param - we need it for the useEffect
        } else {
          // DON'T resume container here - the verifySandboxAndStartServer useEffect handles it
          // This prevents duplicate concurrent resume-container calls that cause race conditions
          if (data.project && data.project.sandboxId) {
            console.log('[LoadProject] Sandbox exists, verifySandboxAndStartServer useEffect will handle it')

            // Cache files after a delay to let container start
            setTimeout(() => {
              searchService.cacheProjectFiles(projectId).catch(console.error)
            }, 3000) // Wait 3 seconds for container to be ready
          }
        }
      } else if (response.status === 404 && firstMessage) {
        // Project not found but we have a first message - create the project
        console.log(
          'Project not found, creating new project for first message:',
          firstMessage,
        )
        await createNewProject()
      } else if (response.status === 404) {
        // Project not found - this might be a new project that hasn't been created yet
        console.log(
          `Project ${projectId} not found in database, might be a new project`,
        )
        setCurrentProject(null)
        // Still attempt to load chat history in case there are orphaned messages
        await loadChatHistory()
      } else {
        console.error(
          'Failed to load project:',
          response.status,
          response.statusText,
        )
        setCurrentProject(null)
        // Still attempt to load chat history
        await loadChatHistory()
      }
    } catch (error) {
      console.error('Error loading project:', error)
      setCurrentProject(null)
      // Still attempt to load chat history in case of API errors
      await loadChatHistory()
    }
  }

  const createNewProject = async () => {
    console.log('Creating new project with:', {
      id: projectId,
      title: 'Generating project name...',
      template: EXPO_TESTING ? 'expo-testing' : (templateFromUrl || selectedTemplate || 'react-native-expo'),
      userID: session?.user?.id,
    })

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: projectId,
          title: 'Generating project name...',
          template: EXPO_TESTING ? 'expo-testing' : (templateFromUrl || selectedTemplate || 'react-native-expo'),
          userID: session?.user?.id,
        }),
      })

      console.log('Create project response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('New project created successfully:', data.project)
        setCurrentProject(data.project)

        // Load chat history (should be empty for new project)
        console.log('Loading chat history for new project...')
        await loadChatHistory()

        // Initialize search cache for new project
        await initializeSearchCache(projectId)

        // Create container for new project (needed for chat API to work)
        console.log('Creating container for new project...')
        await createContainer(data.project)
      } else {
        const errorData = await response.text()
        console.error(
          'Failed to create project:',
          response.status,
          response.statusText,
          errorData,
        )
        await loadChatHistory()
      }
    } catch (error) {
      console.error('Error creating project:', error)
      await loadChatHistory()
    }
  }

  const loadChatHistory = useCallback(async () => {
    if (!session?.user?.id || !projectId || isHistoryLoaded || isChatLoading) {
      console.log('Chat history loading skipped:', {
        hasUserId: !!session?.user?.id,
        hasProjectId: !!projectId,
        isHistoryLoaded,
        isChatLoading,
      })
      return
    }

    console.log(
      '[loadChatHistory] Loading last 2 messages (clean slate mode) for project:',
      projectId,
      'user:',
      session.user.id,
    )

    try {
      const response = await fetch('/api/chat/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          userId: session.user.id,
          limit: 2, // Only load last 2 messages (user + assistant pair)
        }),
      })

      if (response.ok) {
        const { messages: historyMessages } = await response.json()
        console.log(
          '[loadChatHistory] Chat history loaded:',
          historyMessages?.length || 0,
          'messages (last pair only)',
        )

        // Prevent setting messages if chat is loading to avoid SWR conflicts
        if (!isChatLoading && streamStatus === 'ready') {
          if (historyMessages && historyMessages.length > 0) {
            console.log('[loadChatHistory] Setting last', historyMessages.length, 'messages from history')
            // Use a timeout to ensure the useChat hook is fully initialized
            setTimeout(() => {
              setMessages(historyMessages)
            }, 50)
          } else if (!firstMessage) {
            // Only clear messages if we don't have a first message to submit
            console.log(
              'No history messages found and no first message, clearing messages',
            )
            setTimeout(() => {
              setMessages([])
            }, 50)
          } else {
            console.log(
              'No history messages but first message exists, keeping placeholder',
            )
            // Don't clear the placeholder message - it will be replaced when API call succeeds
          }
        }
        setIsHistoryLoaded(true)
      } else {
        console.error(
          'Failed to load chat history:',
          response.status,
          response.statusText,
        )
        const errorData = await response.json().catch(() => ({}))
        console.error('Error response:', errorData)
        setIsHistoryLoaded(true)
      }
    } catch (error) {
      console.error('Error loading chat history:', error)
      setIsHistoryLoaded(true)
    }
  }, [session?.user?.id, projectId, isHistoryLoaded, isChatLoading, streamStatus, firstMessage, setMessages])

  const createContainer = async (project: any) => {
    console.log('Creating container for project:', project.id)
    setIsPreviewLoading(true)

    console.log('userId::', session?.user)
    try {
      const response = await fetch('/api/create-container', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
          userID: session?.user?.id,
          teamID: userTeam?.id,
          chooseTemplate: EXPO_TESTING ? 'expo-testing' : 'expo',
          firstMessage: firstMessage ? { role: 'user', content: firstMessage } : undefined, // Pass first message for title generation
        }),
      })
      

      const result = await response.json()
      console.log('Create container result:', result)

      if (result.success && result.sandboxId) {
        console.log(
          'Container created successfully, updating project with sandboxId:',
          result.sandboxId,
          'and title:',
          result.projectTitle,
        )

        // Update current project with the new sandboxId and title
        setCurrentProject((prev) =>
          prev
            ? {
                ...prev,
                sandboxId: result.sandboxId,
                title: result.projectTitle || prev.title, // Update title with generated name
              }
            : null,
        )

        console.log('Updated currentProject state with new title:', result.projectTitle)

        posthog.capture('container_created', {
          projectId: project.id,
          sandboxId: result.sandboxId,
        })

        // Cache files after container is created and ready
        setTimeout(() => {
          searchService.cacheProjectFiles(project.id).catch(console.error)
        }, 3000) // Wait 3 seconds for new container to be fully ready
      } else {
        console.error(
          'Failed to create container:',
          result.error || 'Unknown error',
        )
      }
    } catch (error) {
      console.error('Error creating container:', error)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  const resumeContainer = async (project: any) => {
    console.log('Resuming container for project:', project.id)
    setIsPreviewLoading(true)

    try {
      const response = await fetch('/api/resume-container', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
          userID: session?.user?.id,
          teamID: userTeam?.id,
        }),
      })

      const result = await response.json()
      console.log('Resume container result:', result)

      if (result.success) {
        // If sandbox was recreated, refresh project data from database to get new sandboxId
        if (result.recreated) {
          console.log('[Resume] Sandbox was recreated, refreshing project data...')
          await refreshProjectData()
        }

        // Update result state to show the preview
        setResult({
          url: result.url,
          ngrokUrl: result.ngrokUrl,
          sbxId: result.sandboxId,
          projectId: result.projectId,
          projectTitle: result.projectTitle,
          template: EXPO_TESTING ? 'expo-testing' : (project.template || 'react-native-expo'),
          recreated: result.recreated,
        })

        posthog.capture('container_resumed', {
          projectId: project.id,
          serverReady: result.serverReady,
          recreated: result.recreated || false,
        })
      } else {
        console.error('Failed to resume container:', result.error)
      }
    } catch (error) {
      console.error('Error resuming container:', error)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  const filteredModels = modelsList.models.filter((model) => {
    if (process.env.NEXT_PUBLIC_HIDE_LOCAL_MODELS) {
      return model.providerId !== 'ollama'
    }
    return true
  })

  const currentModel = filteredModels.find(
    (model) => model.id === languageModel.model,
  )
  const currentTemplate =
    selectedTemplate === 'auto'
      ? templates
      : { [selectedTemplate]: templates[selectedTemplate] }

  const setCurrentPreview = (params: any) => {
    setAppData(params.appData)
    setResult(params.result)
  }

  function handleFileChange(newFiles: SetStateAction<File[]>) {
    setFiles(newFiles)
  }

  // Handle input change for chat
  const handleChatInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (typeof handleInputChange === 'function') {
      handleInputChange(e as any)
    } else {
      console.warn('[ProjectPage] handleInputChange is not a function, skipping')
    }
  }, [handleInputChange])

  const handleLanguageModelChange = (e: LLMModelConfig) => {
    setLanguageModel({ ...e })
  }

  const handleSubmitAuth = useCallback(
    (e: React.FormEvent, options?: ChatRequestOptions) => {
      e.preventDefault()

      if (!session) {
        setAuthDialog(true)
        return
      }

      // Don't submit if input is empty and no images
      const hasImages = (options?.data as any)?.imageAttachments?.length > 0 || imageAttachments.length > 0
      if (!input.trim() && !hasImages) {
        return
      }

      // Reset content tracking for new message
      hasReceivedContentRef.current = false

      // Check if options has file edition metadata (passed from chat-panel-input)
      const fileEdition = (options?.body as any)?.fileEdition || (e as any).fileEdition
      const selectionData = (options?.body as any)?.selectionData || (e as any).selectionData
      const skills = (options?.body as any)?.skills || []

      // Log image attachments for debugging
      console.log('[handleSubmitAuth] Options received:', {
        hasOptions: !!options,
        hasBody: !!options?.body,
        hasData: !!options?.data,
        imageAttachmentsFromOptions: (options?.data as any)?.imageAttachments?.length || 0,
        imageAttachmentsFromState: imageAttachments.length,
        skillsCount: skills.length,
      })

      if (fileEdition && selectionData) {
        // Submit with annotations for edit data
        console.log(
          '[handleSubmitAuth] Submitting with file edition:',
          fileEdition,
        )
        setPendingEditData({ fileEdition, selectionData })

        // Build annotations array
        const annotations: any[] = [
          {
            type: 'edit',
            fileEdition,
            selectionData,
          },
        ]

        // Add skills annotation if there are any skills
        if (skills.length > 0) {
          annotations.push({
            type: 'skills',
            skills,
          })
        }

        // Use append with annotations instead of handleSubmit
        append({
          role: 'user',
          content: input,
          createdAt: new Date(),
          annotations,
        })

        // Clear the input (since we're not using handleSubmit)
        handleInputChange({ target: { value: '' } } as any)
      } else {
        // Normal submission - let useChat handle it for immediate feedback
        // IMPORTANT: Forward the options to handleSubmit so imageAttachments reach experimental_prepareRequestBody
        setPendingEditData(null)

        // If there are skills, we need to use append to add annotations
        if (skills.length > 0) {
          append({
            role: 'user',
            content: input,
            createdAt: new Date(),
            annotations: [
              {
                type: 'skills',
                skills,
              },
            ],
          })
          // Clear the input
          handleInputChange({ target: { value: '' } } as any)
        } else {
          handleSubmit(e as any, options)
        }
      }
    },
    [session, handleSubmit, append, input, handleInputChange, imageAttachments],
  )

  const handleClear = useCallback(() => {
    stopChat()
    // Add delay to prevent SWR conflicts
    setTimeout(() => {
      setMessages([])
    }, 50)
    setAppData(undefined)
    setResult(undefined)
    setFiles([])
    setCode('')
  }, [stopChat, setMessages])

  const handleUndo = useCallback(() => {
    if (messages.length > 0) {
      // Add delay to prevent SWR conflicts
      setTimeout(() => {
        setMessages(messages.slice(0, -1))
      }, 50)
    }
  }, [messages, setMessages])

  // Reload chat history from the server
  const handleReloadChatHistory = useCallback(async () => {
    console.log('[handleReloadChatHistory] Reloading chat history...')
    try {
      // Clear current messages first
      setMessages([])

      // Force remount ChatPanel by changing key
      setChatKey(prev => prev + 1)

      // Small delay to ensure ChatPanel remounts
      await new Promise(resolve => setTimeout(resolve, 150))

      // Fetch fresh messages directly from API (bypass loadChatHistory guards)
      console.log('[handleReloadChatHistory] Fetching fresh messages...')
      const response = await fetch('/api/chat/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          userId: session?.user?.id,
          // Limit is set by CHAT_HISTORY_LIMIT env variable (default: 10)
        }),
      })

      if (response.ok) {
        const { messages: historyMessages } = await response.json()
        console.log('[handleReloadChatHistory] Loaded', historyMessages?.length || 0, 'messages')

        if (historyMessages && historyMessages.length > 0) {
          // Set messages after a small delay to ensure ChatPanel is mounted
          setTimeout(() => {
            setMessages(historyMessages)
            setIsHistoryLoaded(true)
            console.log('[handleReloadChatHistory] Messages set successfully')
          }, 100)
        } else {
          console.log('[handleReloadChatHistory] No messages to load')
          setIsHistoryLoaded(true)
        }
      } else {
        console.error('[handleReloadChatHistory] Failed to fetch messages:', response.status)
        setIsHistoryLoaded(true)
      }
    } catch (error) {
      console.error('[handleReloadChatHistory] Failed to reload chat history:', error)
      setIsHistoryLoaded(true)
    }
  }, [projectId, session?.user?.id, setMessages])

  // Handle preview refresh after git restore
  const handlePreviewRefresh = useCallback((urls: { url: string; ngrokUrl?: string }) => {
    console.log('[handlePreviewRefresh] Refreshing preview with new URLs:', urls)

    if (!currentProject) return

    // Update the result state with new URLs
    setResult({
      url: urls.url,
      ngrokUrl: urls.ngrokUrl,
      sbxId: currentProject.sandboxId!,
      projectId: currentProject.id,
      projectTitle: currentProject.title,
      template: currentProject.template as any,
    })

    console.log('[handlePreviewRefresh] Preview URLs updated, reloading iframes...')

    // Reload preview iframes with new URLs
    reloadPreviewIframes()
  }, [currentProject, reloadPreviewIframes])

  function onSocialClick(target: 'github' | 'x' | 'discord') {
    if (target === 'github') {
      window.open('https://github.com/e2b-dev/fragments', '_blank')
    } else if (target === 'x') {
      window.open('https://x.com/e2b_dev', '_blank')
    } else if (target === 'discord') {
      window.open('https://discord.gg/U7KEcGErtQ', '_blank')
    }
  }

  // Determine if we should show "project not found" state
  const showProjectNotFound = !currentProject &&
    !firstMessage &&
    !isNewProject &&
    messages.length === 0 &&
    isHistoryLoaded

  // Render the main UI shell immediately - components handle their own loading states
  return (
    <MobilePortalProvider>
      <div
        className={cn(
          "flex w-full flex-col bg-background",
          !isMobile && "h-screen",
        )}
        style={{
          // Use dynamic viewport height on mobile to account for browser UI
          height: isMobile && activeTab === 'chat' ? '100dvh' : undefined,
        }}
      >
        {/* NavHeader removed - elements moved to chat panel (title) and preview panel (actions) */}

        {/* Mobile Header with burger menu - Rendered through portal on mobile */}
        <MobileHeaderPortal isMobile={isMobile}>
          <MobileHeader
            session={session}
            projectId={projectId}
            projectTitle={currentProject?.title}
            sandboxId={currentProject?.sandboxId || undefined}
            currentProject={currentProject}
            activePanel={mobileSidebarPanel}
            onPanelChange={setMobileSidebarPanel}
            onOpenSubscriptionModal={() => setIsSubscriptionModalOpen(true)}
            onOpenUserSettingsModal={() => setIsUserSettingsModalOpen(true)}
            onOpenProjectSettingsModal={() => setIsProjectSettingsModalOpen(true)}
            onSignOut={async () => {
              await signOut()
            }}
          />
        </MobileHeaderPortal>

        {/* Mobile Toggle for Chat/Preview - Rendered through portal on mobile */}
        <MobileTabBarPortal isMobile={isMobile}>
          <div className="border-b bg-background w-full transition-transform duration-300 ease-in-out translate-y-0">
            <div className="flex">
          <button
            onClick={() => setMobileActivePanel('chat')}
            className={cn(
              "flex-1 py-3 px-4 text-sm font-medium transition-colors",
              mobileActivePanel === 'chat'
                ? "bg-background text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Chat
          </button>
          <button
            onClick={() => {
              setMobileActivePanel('preview')
              // Scroll parent page to top without animation on mobile
              if (window.parent && window.parent !== window) {
                window.parent.scrollTo({ top: 0, behavior: 'instant' })
              } else {
                window.scrollTo({ top: 0, behavior: 'instant' })
              }
            }}
            className={cn(
              "flex-1 py-3 px-4 text-sm font-medium transition-colors",
              mobileActivePanel === 'preview'
                ? "bg-background text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Web app
              </button>
<button
            onClick={handleNativeAppClick}
            className={cn(
              "flex-1 py-3 px-4 text-sm font-medium transition-colors",
                "text-muted-foreground hover:text-foreground"
            )}
          >
            Native app
              </button>
            </div>
          </div>
        </MobileTabBarPortal>

        <div
          className={cn(
            "flex-1 overflow-hidden",
            isMobile ? "pt-[100px]" : ""
          )}
          style={{
            // Account for safe area on mobile
            paddingBottom: isMobile ? 'env(safe-area-inset-bottom)' : undefined,
          }}
        >
        {/* Show project not found message inline if needed */}
        {showProjectNotFound ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">Project not found</p>
              <p className="text-sm text-muted-foreground mb-4">
                This project doesn&apos;t exist or you don&apos;t have access to it.
              </p>
              <button
                onClick={() => router.push('/')}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Go to Home
              </button>
            </div>
          </div>
        ) : (
          <>
        {/* Mobile mode: Show selected panel based on mobile toggle (hidden on md and up) */}
        <div className="flex-1 h-full md:hidden">
            {/* Editable Project Title for mobile */}
            <EditableProjectTitle
              projectTitle={currentProject?.title || (firstMessage ? 'Creating New Project...' : 'New Project')}
              projectId={currentProject?.id || projectId}
              userId={session?.user?.id}
              onTitleUpdate={(newTitle: string) => {
                if (currentProject) {
                  setCurrentProject({ ...currentProject, title: newTitle })
                }
              }}
            />
            {mobileActivePanel === 'chat' ? (
              <ChatPanel
                key={chatKey}
                status={streamStatus}
                messages={messages}
                input={input}
                handleInputChange={handleChatInputChange}
                handleSubmit={handleSubmitAuth}
                isLoading={isChatLoading}
                projectTitle={currentProject?.title || undefined}
                currentTemplate={
                  currentProject?.template || templateFromUrl || selectedTemplate
                }
                sandboxId={currentProject?.sandboxId || undefined}
                pendingEditData={pendingEditData}
                projectId={projectId}
                userId={session?.user?.id}
                isRetrying={isRetrying}
                retryCount={retryCount}
                isWaitingForFirstMessage={!!firstMessageRef.current && messages.length === 0}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                imageAttachments={imageAttachments}
                onImageAttachmentsChange={setImageAttachments}
                selectedSkills={selectedSkills}
                onSelectedSkillsChange={setSelectedSkills}
                cloudEnabled={cloudEnabled}
                isCloudPanelOpen={mobileSidebarPanel === 'cloud'}
                onCloudPanelOpen={() => setMobileSidebarPanel('cloud')}
                onCloudPanelClose={() => setMobileSidebarPanel(null)}
              />
            ) : (
              <PreviewPanel
                key={`preview-${previewKey}`}
                code={code}
                previewUrl={(result as any)?.url}
                isGenerating={isPreviewLoading}
                appData={appData}
                result={result}
                sandboxId={currentProject?.sandboxId || undefined}
                projectId={projectId}
                projectTitle={currentProject?.title}
                viewMode={viewMode}
                onToggleViewMode={toggleViewMode}
                userId={session?.user?.id}
                session={session}
                currentProject={currentProject}
                onProjectUpdate={setCurrentProject}
                mobileView="web"
                currentFile={currentFile}
                onCodeChange={setCode}
                onFileSelect={setCurrentFile}
                contentMode={contentMode}
                onContentModeChange={setContentMode}
              />
            )}
        </div>
        
        {/* Desktop/Tablet layout - hidden on mobile, shown on md and up */}
        <div className="hidden md:flex h-full">
          <AppSidebar
              sandboxId={currentProject?.sandboxId || undefined}
              projectId={projectId}
              userId={session?.user?.id}
              session={session}
              onOpenSubscriptionModal={() => setIsSubscriptionModalOpen(true)}
              onOpenUserSettingsModal={() => setIsUserSettingsModalOpen(true)}
              onOpenProjectSettingsModal={() => setIsProjectSettingsModalOpen(true)}
              onSignOut={async () => {
                await signOut()
              }}
              activePanel={desktopSidebarPanel}
              onPanelChange={setDesktopSidebarPanel}
              cloudEnabled={cloudEnabled}
              cloudDeploymentUrl={cloudDeploymentUrl}
              onCloudEnabled={handleCloudEnabled}
            >
            <div className="flex h-full w-full">
          {/* Fixed width Chat/History panel - 500px */}
          <div className="w-[500px] flex-shrink-0 border-r h-full flex flex-col">
            {/* Editable Project Title */}
            <EditableProjectTitle
              projectTitle={currentProject?.title || (firstMessage ? 'Creating New Project...' : 'New Project')}
              projectId={currentProject?.id || projectId}
              userId={session?.user?.id}
              onTitleUpdate={(newTitle: string) => {
                if (currentProject) {
                  setCurrentProject({ ...currentProject, title: newTitle })
                }
              }}
            />
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'chat' | 'panel')} className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-2 rounded-none border-b h-[50px] bg-background px-4">
                <TabsTrigger value="chat">Chat</TabsTrigger>
                <TabsTrigger value="panel">History</TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="flex-1 m-0 overflow-hidden">
                <ChatPanel
                  key={chatKey}
                  status={streamStatus}
                  messages={messages}
                  input={input}
                  handleInputChange={handleChatInputChange}
                  handleSubmit={handleSubmitAuth}
                  isLoading={isChatLoading}
                  projectTitle={currentProject?.title || undefined}
                  currentTemplate={
                    currentProject?.template || templateFromUrl || selectedTemplate
                  }
                  sandboxId={currentProject?.sandboxId || undefined}
                  pendingEditData={pendingEditData}
                  projectId={projectId}
                  userId={session?.user?.id}
                  isRetrying={isRetrying}
                  retryCount={retryCount}
                  isWaitingForFirstMessage={!!firstMessageRef.current && messages.length === 0}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  imageAttachments={imageAttachments}
                  onImageAttachmentsChange={setImageAttachments}
                  selectedSkills={selectedSkills}
                  onSelectedSkillsChange={setSelectedSkills}
                  cloudEnabled={cloudEnabled}
                  isCloudPanelOpen={desktopSidebarPanel === 'cloud'}
                  onCloudPanelOpen={() => setDesktopSidebarPanel('cloud')}
                  onCloudPanelClose={() => setDesktopSidebarPanel(null)}
                />
              </TabsContent>
              <TabsContent value="panel" className="flex-1 m-0 overflow-hidden">
                <HistoryPanel
                  projectId={projectId}
                  sandboxId={currentProject?.sandboxId || undefined}
                  userId={session?.user?.id}
                  onChatReload={handleReloadChatHistory}
                  onPreviewRefresh={handlePreviewRefresh}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Preview Panel - takes full remaining width */}
          <div className="flex-1 h-full">
            <PreviewPanel
              key={`preview-desktop-${previewKey}`}
              code={code}
              previewUrl={(result as any)?.url}
              isGenerating={isPreviewLoading}
              appData={appData}
              result={result}
              sandboxId={currentProject?.sandboxId || undefined}
              projectId={projectId}
              projectTitle={currentProject?.title}
              viewMode={viewMode}
              onToggleViewMode={toggleViewMode}
              userId={session?.user?.id}
              session={session}
              currentProject={currentProject}
              onProjectUpdate={setCurrentProject}
              currentFile={currentFile}
              onCodeChange={setCode}
              onFileSelect={setCurrentFile}
              contentMode={contentMode}
              onContentModeChange={setContentMode}
            />
          </div>
            </div>
          </AppSidebar>
        </div>
          </>
        )}
      </div>

      {/* Debug info */}
      {false && process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-0 left-0 bg-black text-white p-2 text-xs max-w-md">
          <div>appData: {appData ? 'SET' : 'UNDEFINED'}</div>
          <div>result: {result ? 'SET' : 'UNDEFINED'}</div>
          <div>result.url: {(result as any)?.url || 'NO URL'}</div>
          <div>isPreviewLoading: {isPreviewLoading.toString()}</div>
        </div>
      )}

        <AuthDialog open={isAuthDialogOpen} setOpen={setAuthDialog} />
        <ErrorDetailsModal
          isOpen={isErrorModalOpen}
          onClose={handleCloseErrorModal}
          errorData={errorModalData}
          onSendToFix={handleSendToFixFromModal}
        />
        <ExpoGoModal
          open={showExpoGoModal}
          onOpenChange={setShowExpoGoModal}
        />
        <SubscriptionModal
          open={isSubscriptionModalOpen}
          onOpenChange={setIsSubscriptionModalOpen}
        />
        <UserSettingsModal
          open={isUserSettingsModalOpen}
          onOpenChange={setIsUserSettingsModalOpen}
        />
        {projectId && session?.user?.id && (
          <ProjectSettingsModal
            open={isProjectSettingsModalOpen}
            onOpenChange={setIsProjectSettingsModalOpen}
            projectId={projectId}
            userId={session.user.id}
          />
        )}

        {/* Mobile Panel Sheets */}
        <Sheet open={mobileSidebarPanel === 'assets'} onOpenChange={(open) => !open && setMobileSidebarPanel(null)}>
          <SheetContent side="left" className="w-full sm:max-w-[400px] p-0">
            <VisuallyHidden.Root>
              <SheetTitle>Assets</SheetTitle>
            </VisuallyHidden.Root>
            <AssetsPanel
              sandboxId={currentProject?.sandboxId || undefined}
              projectId={projectId}
              onClose={() => setMobileSidebarPanel(null)}
            />
          </SheetContent>
        </Sheet>

        <Sheet open={mobileSidebarPanel === 'projects'} onOpenChange={(open) => !open && setMobileSidebarPanel(null)}>
          <SheetContent side="left" className="w-full sm:max-w-[400px] p-0">
            <VisuallyHidden.Root>
              <SheetTitle>Projects</SheetTitle>
            </VisuallyHidden.Root>
            <ProjectsPanel
              userId={session?.user?.id}
              onClose={() => setMobileSidebarPanel(null)}
            />
          </SheetContent>
        </Sheet>

        <Sheet open={mobileSidebarPanel === 'backend'} onOpenChange={(open) => !open && setMobileSidebarPanel(null)}>
          <SheetContent side="left" className="w-full sm:max-w-[400px] p-0">
            <VisuallyHidden.Root>
              <SheetTitle>Backend</SheetTitle>
            </VisuallyHidden.Root>
            <BackendPanel
              projectId={projectId}
              onClose={() => setMobileSidebarPanel(null)}
            />
          </SheetContent>
        </Sheet>

        <Sheet open={mobileSidebarPanel === 'cloud'} onOpenChange={(open) => !open && setMobileSidebarPanel(null)}>
          <SheetContent side="left" className="w-full sm:max-w-[400px] p-0">
            <VisuallyHidden.Root>
              <SheetTitle>Cloud</SheetTitle>
            </VisuallyHidden.Root>
            <CloudSidebarPanel
              projectId={projectId}
              cloudEnabled={cloudEnabled}
              deploymentUrl={cloudDeploymentUrl}
              onCloudEnabled={handleCloudEnabled}
              onClose={() => setMobileSidebarPanel(null)}
            />
          </SheetContent>
        </Sheet>
      </div>
    </MobilePortalProvider>
  )
}

// Export with dynamic import to prevent SSR issues
// Uses the skeleton Loading component for immediate visual feedback
export default dynamic(() => Promise.resolve(ProjectPageInternal), {
  ssr: false,
  loading: () => <Loading />,
})
