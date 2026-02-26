'use client'

import { SubscriptionNavButton } from './subscription-nav-button'
import { SubscriptionModal } from './subscription-modal'
import { UserSettingsModal } from './user-settings-modal'
import { ProjectSettingsModal } from './project-settings-modal'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Session } from '@/lib/auth'
import { Project } from '@react-native-vibe-code/database'
import { signInWithGoogle } from '@/lib/auth/client'
import {
  DiscordLogoIcon,
  GitHubLogoIcon,
  TwitterLogoIcon,
} from '@radix-ui/react-icons'
import {
  ArrowRight,
  Crown,
  Download,
  Folder,
  FolderOpen,
  LogOut,
  Plus,
  Puzzle,
  Rocket,
  Search,
  Settings,
  Trash,
  Undo,
  User,
  Check,
  X,
  Sun,
  Moon,
  Monitor,
  ExternalLink,
  GitFork,
  Copy,
  Loader2,
  AlertCircle,
  Pencil,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useDevMode } from '@/context/dev-mode-context'
import { Code } from 'lucide-react'
import { useSubscriptionStatus } from '@/lib/polar-client'
import { ConvexConnection } from '@/components/convex/ConvexConnection'
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 7)

interface NavHeaderProps {
  isProjectPage?: boolean
  session?: Session | null
  projectTitle?: string
  projectId?: string
  currentTemplate?: string
  onClear?: () => void
  onUndo?: () => void
  canClear?: boolean
  canUndo?: boolean
  onSocialClick?: (target: 'github' | 'x' | 'discord') => void
  showLogin?: () => void
  signOut?: () => void
  onProjectTitleUpdate?: (newTitle: string) => void
  onProjectRefresh?: () => void
  isAlphaEnabled?: boolean
  deployedUrl?: string
  sandboxId?: string
}

export function NavHeader({
  isProjectPage = false,
  session,
  projectTitle,
  projectId,
  currentTemplate,
  onClear,
  onUndo,
  canClear = false,
  canUndo = false,
  onSocialClick,
  showLogin,
  signOut,
  onProjectTitleUpdate,
  onProjectRefresh,
  isAlphaEnabled = false,
  deployedUrl: initialDeployedUrl,
  sandboxId,
}: NavHeaderProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const [isUserSettingsModalOpen, setIsUserSettingsModalOpen] = useState(false)
  const [isProjectSettingsModalOpen, setIsProjectSettingsModalOpen] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(projectTitle || '')
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [deployedUrl, setDeployedUrl] = useState(initialDeployedUrl || '')
  const [isDeploying, setIsDeploying] = useState(false)
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [isRemixCopied, setIsRemixCopied] = useState(false)
  const [isEditingDomain, setIsEditingDomain] = useState(false)
  const [customDomain, setCustomDomain] = useState('')
  const [isSavingDomain, setIsSavingDomain] = useState(false)
  const [isDomainCopied, setIsDomainCopied] = useState(false)
  const [isCheckingDomain, setIsCheckingDomain] = useState(false)
  const [isDomainAvailable, setIsDomainAvailable] = useState<boolean | null>(null)
  const [domainCheckTimeout, setDomainCheckTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [showDomainReplicating, setShowDomainReplicating] = useState(false)
  const { isProSubscriber, isLoading: isLoadingSubscription } =
    useSubscriptionStatus()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const { isDevMode, setIsDevMode } = useDevMode()

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true)
  }, [])

  // Fix for Radix UI Dialog/Dropdown conflict - prevents pointer-events freeze
  useEffect(() => {
    const body = document.body
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-scroll-locked') {
          const total = parseInt(body.dataset.scrollLocked ?? '0', 10)
          if (total === 0) {
            body.style.pointerEvents = ''
            body.style.removeProperty('padding-right')
            body.style.removeProperty('overflow')
          }
        }
      })
    })

    observer.observe(body, {
      attributes: true,
      attributeFilter: ['data-scroll-locked', 'style']
    })

    return () => observer.disconnect()
  }, [])

  // Update edited title when projectTitle changes
  useEffect(() => {
    setEditedTitle(projectTitle || '')
  }, [projectTitle])

  // Only fetch projects when the sheet is opened (lazy loading)
  const [hasLoadedProjects, setHasLoadedProjects] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch current project data when projectId changes
  useEffect(() => {
    const fetchCurrentProject = async () => {
      if (!projectId || !session?.user?.id) return

      try {
        const response = await fetch(`/api/projects/${projectId}?userID=${session.user.id}`)
        if (response.ok) {
          const data = await response.json()
          setCurrentProject(data.project)
        }
      } catch (error) {
        console.error('Error fetching current project:', error)
      }
    }

    fetchCurrentProject()
  }, [projectId, session?.user?.id])

  const fetchProjects = useCallback(async (search?: string) => {
    if (!session?.user?.id) return

    setIsLoadingProjects(true)
    try {
      const params = new URLSearchParams({ userID: session.user.id })
      if (search) {
        params.append('search', search)
      }
      const response = await fetch(`/api/projects?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects || [])
        setHasLoadedProjects(true)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setIsLoadingProjects(false)
    }
  }, [session?.user?.id])

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Debounce the search
    searchTimeoutRef.current = setTimeout(() => {
      fetchProjects(value || undefined)
    }, 300)
  }, [fetchProjects])

  const handleProjectsSheetOpen = () => {
    // Reset search when opening sheet
    setSearchQuery('')
    // Only fetch projects if we haven't loaded them yet
    if (session?.user?.id && !hasLoadedProjects) {
      fetchProjects()
    }
  }

  const formatDate = (dateInput: string | Date) => {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const handleSocialClick = (target: 'github' | 'x' | 'discord') => {
    if (onSocialClick) {
      onSocialClick(target)
    } else {
      // Default behavior
      if (target === 'x') {
        window.open('https://x.com/capsulethis', '_blank')
      } else if (target === 'discord') {
        window.open('', '_blank')
      }
    }
  }

  const handleSignOut = () => {
    if (signOut) {
      signOut()
    }
  }

  const handleSaveTitle = async () => {
    if (!projectId || !session?.user?.id) return

    const trimmedTitle = editedTitle.trim()
    if (!trimmedTitle || trimmedTitle === projectTitle) {
      setIsEditingTitle(false)
      setEditedTitle(projectTitle || '')
      return
    }

    setIsSavingTitle(true)
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: trimmedTitle,
          userID: session.user.id,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success('Project title updated successfully')
        setIsEditingTitle(false)
        if (onProjectTitleUpdate) {
          onProjectTitleUpdate(trimmedTitle)
        }
        // Update projects list if needed
        if (projects.length > 0) {
          setProjects(projects.map(p =>
            p.id === projectId ? { ...p, title: trimmedTitle } : p
          ))
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update project title')
        setEditedTitle(projectTitle || '')
      }
    } catch (error) {
      console.error('Error updating project title:', error)
      toast.error('Failed to update project title')
      setEditedTitle(projectTitle || '')
    } finally {
      setIsSavingTitle(false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditingTitle(false)
    setEditedTitle(projectTitle || '')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  const handleDeploy = async () => {
    if (!projectId) {
      toast.error('Project ID is missing')
      return
    }

    if (!sandboxId) {
      toast.error('Sandbox ID is missing - project may not be ready yet')
      return
    }

    if (!session?.user?.id) {
      toast.error('User session is missing - please sign in')
      return
    }

    // Check cloudflareProjectName or deployedUrl to determine if it's an update
    const isUpdate = !!(currentProject?.cloudflareProjectName || currentProject?.deployedUrl)
    setIsDeploying(true)
    try {
      toast.info(isUpdate ? 'Starting update...' : 'Starting deployment...')

      const response = await fetch(`/api/deploy/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sandboxId,
          platform: 'web',
          action: 'deploy',
          profile: 'preview',
          customDomain: customDomain || generateSlug(projectTitle || 'my-app'),
        }),
      })

      const result = await response.json()

      if (result.success) {
        // Backend handles everything - just update the UI with the deployment URL
        if (result.deploymentUrl) {
          setDeployedUrl(result.deploymentUrl)
          toast.success(result.isUpdate ? 'Project updated successfully!' : 'Project deployed successfully!')

          // Update currentProject with deployment info
          if (currentProject) {
            setCurrentProject({
              ...currentProject,
              deployedUrl: result.deploymentUrl,
              customDomainUrl: result.customDomainUrl || currentProject.customDomainUrl,
              cloudflareProjectName: result.deploymentName || currentProject.cloudflareProjectName,
            })
            // Also update the customDomain state to match
            if (result.customDomainUrl) {
              setCustomDomain(result.customDomainUrl)
            }
          }

          // Notify parent component to refresh project data
          if (onProjectRefresh) {
            onProjectRefresh()
          }

          // Open the deployed app in a new tab
          setTimeout(() => {
            window.open(result.deploymentUrl, '_blank')
          }, 1000)
        } else {
          toast.success('Project deployment completed successfully')
        }
      } else {
        // Deployment failed - show error and reset state
        console.error('Deployment failed:', result.error)

        // Handle subdomain taken error specifically
        if (result.code === 'SUBDOMAIN_TAKEN') {
          setIsDomainAvailable(false)
          setIsEditingDomain(true)
          toast.error(result.error || 'This subdomain is already taken')
        } else {
          toast.error(`${isUpdate ? 'Update' : 'Publishing'} error: ${result.error || 'Deployment failed'}`)
        }
        setIsDeploying(false)
        return
      }
    } catch (error) {
      console.error('Deployment error:', error)
      toast.error(`${isUpdate ? 'Update' : 'Publishing'} error: Failed to deploy project`)
      setIsDeploying(false)
      return
    } finally {
      // Only reset if deployment was successful
      setIsDeploying(false)
    }
  }

  useEffect(() => {
    // Deploy button state check
  }, [projectId, sandboxId, session?.user?.id, isDeploying])

  const getRemixUrl = () => {
    if (!projectId) return ''
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `${baseUrl}/p/${projectId}/remix`
  }

  const handleCopyRemixUrl = async () => {
    const url = getRemixUrl()
    if (!url) return

    try {
      await navigator.clipboard.writeText(url)
      setIsRemixCopied(true)
      toast.success('Remix link copied to clipboard')
      setTimeout(() => setIsRemixCopied(false), 2000)
    } catch (error) {
      toast.error('Failed to copy link')
    }
  }

  // Helper function to generate a slug from project title
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  // Initialize customDomain from project data or generate from title
  // If generating from title, check availability and add nanoid if taken
  useEffect(() => {
    const initializeDomain = async () => {
      if (currentProject) {
        // If project already has a saved domain, use it (no need to check availability)
        if (currentProject.customDomainUrl || currentProject.cloudflareProjectName) {
          const domain = currentProject.customDomainUrl || currentProject.cloudflareProjectName
          setCustomDomain(domain || '')
          return
        }

        // Generate from title and check availability
        if (currentProject.title) {
          const sluggedTitle = generateSlug(currentProject.title)
          await checkAndSetAvailableDomain(sluggedTitle)
        }
      } else if (projectTitle) {
        // Fallback to prop if no currentProject yet
        const sluggedTitle = generateSlug(projectTitle)
        await checkAndSetAvailableDomain(sluggedTitle)
      }
    }

    // Helper to check availability and append nanoid if taken
    const checkAndSetAvailableDomain = async (baseDomain: string) => {
      if (!baseDomain) return

      try {
        const response = await fetch(
          `/api/subdomain/check?subdomain=${encodeURIComponent(baseDomain)}&projectId=${projectId || ''}`
        )
        const data = await response.json()

        if (data.available) {
          setCustomDomain(baseDomain)
        } else {
          // Domain is taken, append nanoid to make it unique
          const uniqueDomain = `${baseDomain}-${nanoid()}`
          setCustomDomain(uniqueDomain)
        }
      } catch (error) {
        console.error('Error checking domain availability:', error)
        // On error, use the base domain anyway
        setCustomDomain(baseDomain)
      }
    }

    initializeDomain()
  }, [currentProject, projectTitle, projectId])

  const handleCopyDomainUrl = async () => {
    const domain = customDomain || currentProject?.cloudflareProjectName || generateSlug(projectTitle || 'my-app')
    const url = `https://${domain}.capsulethis.app`

    try {
      await navigator.clipboard.writeText(url)
      setIsDomainCopied(true)
      toast.success('Domain URL copied to clipboard')
      setTimeout(() => setIsDomainCopied(false), 2000)
    } catch (error) {
      toast.error('Failed to copy URL')
    }
  }

  // Check subdomain availability with debounce
  const checkSubdomainAvailability = async (subdomain: string) => {
    if (!subdomain.trim()) {
      setIsDomainAvailable(null)
      return
    }

    // Skip check if it's the same as the current project's subdomain
    if (subdomain === currentProject?.cloudflareProjectName) {
      setIsDomainAvailable(true)
      return
    }

    setIsCheckingDomain(true)
    try {
      const response = await fetch(
        `/api/subdomain/check?subdomain=${encodeURIComponent(subdomain)}&projectId=${projectId || ''}`
      )
      const data = await response.json()
      setIsDomainAvailable(data.available)
    } catch (error) {
      console.error('Error checking subdomain:', error)
      setIsDomainAvailable(null)
    } finally {
      setIsCheckingDomain(false)
    }
  }

  const handleDomainChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setCustomDomain(sanitized)
    setIsDomainAvailable(null)

    // Clear existing timeout
    if (domainCheckTimeout) {
      clearTimeout(domainCheckTimeout)
    }

    // Set new timeout for debounced check
    const timeout = setTimeout(() => {
      checkSubdomainAvailability(sanitized)
    }, 500)
    setDomainCheckTimeout(timeout)
  }

  const handleSaveDomain = async () => {
    if (!projectId || !session?.user?.id) return

    const trimmedDomain = customDomain.trim().toLowerCase()
    if (!trimmedDomain) {
      toast.error('Please enter a valid subdomain')
      return
    }

    // Check availability one more time before saving
    if (isDomainAvailable === false) {
      toast.error('This subdomain is already taken')
      return
    }

    setIsSavingDomain(true)
    try {
      // Verify availability before saving
      const checkResponse = await fetch(
        `/api/subdomain/check?subdomain=${encodeURIComponent(trimmedDomain)}&projectId=${projectId}`
      )
      const checkData = await checkResponse.json()

      if (!checkData.available) {
        setIsDomainAvailable(false)
        toast.error('This subdomain is already taken')
        setIsSavingDomain(false)
        return
      }

      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customDomainUrl: trimmedDomain,
          userID: session.user.id,
        }),
      })

      if (response.ok) {
        toast.success('Custom domain saved successfully')
        setIsEditingDomain(false)
        setIsDomainAvailable(null)
        // Show replicating notice
        setShowDomainReplicating(true)
        // Auto-hide the notice after 60 seconds
        setTimeout(() => setShowDomainReplicating(false), 60000)
        if (currentProject) {
          setCurrentProject({ ...currentProject, customDomainUrl: trimmedDomain })
        }
        // Update deployedUrl to reflect the new custom domain (only if project was already deployed)
        if (currentProject?.cloudflareProjectName || currentProject?.deployedUrl || deployedUrl) {
          setDeployedUrl(`https://${trimmedDomain}.capsulethis.app`)
        }
        // Notify parent component to refresh project data
        if (onProjectRefresh) {
          onProjectRefresh()
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save custom domain')
      }
    } catch (error) {
      console.error('Error saving custom domain:', error)
      toast.error('Failed to save custom domain')
    } finally {
      setIsSavingDomain(false)
    }
  }
  if (isProjectPage) {
    // Project page layout - full header with all features
    return (
      <>
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 absolute md:relative z-50 min-w-full">
          <div className="flex h-14 items-center px-4 justify-between">
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-5">
{/* 
                <Link href="/" className="flex items-center gap-2 md:hidden" >
                  <img
                    src={mounted && resolvedTheme === 'dark' ? '/logo_iso_dark.svg' : '/logo_iso.svg'}
                    alt="Logo"
                    className=" w-[55px] h-[29px] sm:w-[55px] sm:h-[58px]"
                  />
                </Link> */}
                {/* <Link href="/" className="flex items-center gap-2 md:block hidden" >
                  <img src={mounted && resolvedTheme === 'dark' ? '/logo_small_dark.svg' : '/logo_small.svg'}
                    alt="Logo"
                    className="w-[120px] h-[29px] sm:w-[240px] sm:h-[58px]"
                  />
                </Link> */}
                {/* <Button variant="outline" size="sm" asChild>
                  <a href="/" className="flex items-center space-x-2">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">New project</span>
                  </a>
                </Button> */}
              </div>
            </div>

            {projectTitle && (
              <div className="hidden sm:flex flex-1 justify-center">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2 max-w-[400px]">
                    <Input
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="h-8 text-sm"
                      autoFocus
                      disabled={isSavingTitle}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={handleSaveTitle}
                      disabled={isSavingTitle || !editedTitle.trim()}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={handleCancelEdit}
                      disabled={isSavingTitle}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <h2
                    className="text-sm font-medium text-muted-foreground truncate max-w-[300px] cursor-pointer hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
                    onClick={() => projectId && setIsEditingTitle(true)}
                    title="Click to edit project title"
                  >
                    {projectTitle}
                  </h2>
                )}
              </div>
            )}

            <div className="flex items-center space-x-2">
              {/* <SubscriptionNavButton session={session || null} /> */}

              {/* <Button variant="ghost" className="p-2 px-4">
                <Puzzle className="h-4 w-4 mr-2" />
                Integrations
              </Button> */}

              {/* Projects Sheet */}
              <div className="flex items-center -space-x-1">
                <Sheet onOpenChange={(open) => open && handleProjectsSheetOpen()}>
                  <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <SheetTrigger asChild>
                          <Button variant="ghost" className="p-2 px-4">
                            <FolderOpen className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Projects</span>
                          </Button>
                        </SheetTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Projects</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <SheetContent side="right" className="w-full sm:min-w-[530px] sm:w-[540px] flex flex-col overflow-hidden">
                    <SheetHeader className="flex-shrink-0">
                      <SheetTitle className="flex items-center justify-between">
                        <span>Recent Projects</span>
                        {/* <Link href="/">
                        <Button variant="ghost" size="sm" className="h-8 px-3">
                          <Plus className="h-4 w-4 mr-1" />
                          New Project
                        </Button>
                      </Link> */}
                      </SheetTitle>
                      <SheetDescription>
                        Browse and manage your recent projects
                      </SheetDescription>
                    </SheetHeader>
                    <div className="relative mt-4 flex-shrink-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search projects..."
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex-1 overflow-y-auto mt-4">
                      <div className="space-y-2 pb-4">
                        {isLoadingProjects ? (
                          <div className="text-center py-8 text-muted-foreground">
                            Loading projects...
                          </div>
                        ) : projects.length > 0 ? (
                          projects.map((project) => (
                            <Link
                              key={project.id}
                              href={`/p/${project.id}`}
                              className="block p-4 rounded-lg border hover:bg-accent transition-colors"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold truncate">
                                    {project.title}
                                  </h3>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    <span className="capitalize">
                                      {project.template?.replace(/-/g, ' ')}
                                    </span>
                                    {' • '}
                                    <span className="capitalize">{project.status}</span>
                                  </p>
                                </div>
                                <span className="text-xs text-muted-foreground ml-4 shrink-0">
                                  {project.updatedAt
                                    ? formatDate(project.updatedAt)
                                    : ''}
                                </span>
                              </div>
                            </Link>
                          ))
                        ) : searchQuery ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No projects found matching &quot;{searchQuery}&quot;
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            No projects yet. Create your first project to get started!
                          </div>
                        )}
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>


                <Button
                  variant="ghost"
                  className="p-2 px-4"
                  onClick={async () => {

                    if (!projectId || !session?.user?.id) {
                      console.error('[Download] Missing projectId or session')
                      toast.error('Unable to download project')
                      return
                    }

                    try {
                      toast.info('Preparing download...')
                      const downloadUrl = `/api/projects/${projectId}/download?userID=${session.user.id}`

                      const response = await fetch(downloadUrl)

                      if (!response.ok) {
                        const error = await response.json()
                        console.error('[Download] API error:', error)
                        toast.error(error.error || 'Failed to download project')
                        return
                      }

                      const blob = await response.blob()

                      const url = window.URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${projectTitle || 'project'}-${projectId}.zip`
                      document.body.appendChild(a)
                      a.click()
                      window.URL.revokeObjectURL(url)
                      document.body.removeChild(a)
                      toast.success('Project downloaded successfully')
                    } catch (error) {
                      console.error('[Download] Error:', error)
                      toast.error('Failed to download project')
                    }
                  }}
                  disabled={!projectId || !session?.user?.id}
                >
                  <Download className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Download</span>
                </Button>

                {/* Publish HoverCard - always visible */}
                <HoverCard noHover onOpenChange={(open) => {
                  if (!open) setShowDomainReplicating(false)
                }}>
                  <HoverCardTrigger noHover asChild>
                    <Button
                      variant="ghost"
                      className="p-2 px-4"
                      disabled={!projectId || !sandboxId || !session?.user?.id}
                    >
                      <Rocket className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Publish</span>
                    </Button>
                  </HoverCardTrigger>
                  <HoverCardContent noHover className="w-96" align="end">
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-semibold text-sm">Custom Domain</h4>
                        <p className="text-sm text-muted-foreground">
                          Set your app&apos;s custom subdomain
                        </p>
                      </div>
                      {showDomainReplicating && (
                        <div className="bg-orange-100 dark:bg-orange-950 border border-orange-300 dark:border-orange-800 rounded-md px-3 py-2">
                          <p className="text-xs text-orange-800 dark:text-orange-200">
                            New subdomain is replicating on the system, it will be available in the next minute or so.
                          </p>
                        </div>
                      )}
                      <div className="space-y-2">
                        {isEditingDomain ? (
                          <>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 flex items-center bg-muted rounded-md">
                                <Input
                                  value={customDomain}
                                  onChange={(e) => handleDomainChange(e.target.value)}
                                  className={`h-9 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 ${isDomainAvailable === false ? 'text-destructive' : ''
                                    }`}
                                  placeholder="your-app-name"
                                  autoFocus
                                />
                                <span className="pr-3 text-sm text-muted-foreground whitespace-nowrap">.capsulethis.app</span>
                              </div>
                              <div className="flex items-center shrink-0 w-5">
                                {isCheckingDomain && (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                                {!isCheckingDomain && isDomainAvailable === true && (
                                  <Check className="h-4 w-4 text-green-500" />
                                )}
                                {!isCheckingDomain && isDomainAvailable === false && (
                                  <AlertCircle className="h-4 w-4 text-destructive" />
                                )}
                              </div>
                            </div>
                            {isDomainAvailable === false && (
                              <p className="text-xs text-destructive">
                                This subdomain is already taken. Please choose a different name.
                              </p>
                            )}
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={handleSaveDomain}
                                disabled={isSavingDomain || !customDomain.trim() || isDomainAvailable === false}
                              >
                                {isSavingDomain ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4 mr-2" />
                                )}
                                {isSavingDomain ? 'Saving...' : 'Save'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  setIsEditingDomain(false)
                                  setCustomDomain(currentProject?.customDomainUrl || currentProject?.cloudflareProjectName || '')
                                  setIsDomainAvailable(null)
                                }}
                              >
                                <X className="h-4 w-4 mr-2" />
                                Cancel
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex-1 bg-muted rounded-md px-3 py-2 text-sm truncate font-mono">
                              {customDomain || currentProject?.cloudflareProjectName || generateSlug(projectTitle || 'my-app')}.capsulethis.app
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={handleCopyDomainUrl}
                              >
                                {isDomainCopied ? (
                                  <Check className="h-4 w-4 mr-2 text-green-500" />
                                ) : (
                                  <Copy className="h-4 w-4 mr-2" />
                                )}
                                Copy
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  setIsEditingDomain(true)
                                  // Check current domain availability when entering edit mode
                                  if (customDomain && customDomain !== currentProject?.cloudflareProjectName) {
                                    checkSubdomainAvailability(customDomain)
                                  }
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleDeploy}
                        disabled={!projectId || !sandboxId || !session?.user?.id || isDeploying || (isEditingDomain && isDomainAvailable === false)}
                      >
                        <Rocket className="h-4 w-4 mr-2" />
                        {isDeploying
                          ? ((currentProject?.cloudflareProjectName || currentProject?.deployedUrl) ? 'Updating...' : 'Publishing...')
                          : ((currentProject?.cloudflareProjectName || currentProject?.deployedUrl) ? 'Update App' : 'Publish App')}
                      </Button>
                    </div>
                  </HoverCardContent>
                </HoverCard>

                {deployedUrl && (
                  <Button
                    variant="ghost"
                    className="p-2 px-4"
                    onClick={() => {
                      const url = deployedUrl.startsWith('http') ? deployedUrl : `https://${deployedUrl}`
                      window.open(url, '_blank')
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Visit Webapp</span>
                  </Button>
                )}

                {/* Remix HoverCard */}
                {projectId && currentProject?.isPublic && (
                  <HoverCard noHover>
                    <HoverCardTrigger noHover asChild>
                      <Button
                        variant="ghost"
                        className="p-2 px-4"
                      >
                        <GitFork className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Remix</span>
                      </Button>
                    </HoverCardTrigger>
                    <HoverCardContent noHover className="w-80" align="end">
                      <div className="space-y-3">
                        <div>
                          <h4 className="font-semibold text-sm">Remix your app</h4>
                          <p className="text-sm text-muted-foreground">
                            Let anyone remix your code and create their own version
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-md px-3 py-2 text-sm truncate font-mono">
                            {getRemixUrl().replace(/^https?:\/\//, '') + "/remix"}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={handleCopyRemixUrl}
                          >
                            {isRemixCopied ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                )}
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* Convex Backend Connection */}
              {projectId && <ConvexConnection projectId={projectId} />}

              <Separator orientation="vertical" className="h-6" />

              {/* User Avatar Dropdown */}
              {session ? (
                <DropdownMenu>
                  {/* <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild> */}
                  <DropdownMenuTrigger asChild>
                    <Avatar className="w-8 h-8">
                      <AvatarImage
                        src={
                          session.user.image ||
                          'https://avatar.vercel.sh/' + session.user.email
                        }
                        alt={session.user.email}
                      />
                    </Avatar>
                  </DropdownMenuTrigger>
                  {/* </TooltipTrigger>
                      <TooltipContent>My Account</TooltipContent>
                    </Tooltip>
                  </TooltipProvider> */}
                  <DropdownMenuContent className="w-56" align="end">
                    <DropdownMenuLabel className="flex flex-col">
                      <span className="text-sm">My Account</span>
                      <span className="text-xs text-muted-foreground">
                        {session.user.email}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {/* <DropdownMenuItem onClick={() => handleSocialClick('discord')}>
                      <DiscordLogoIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      Join us on Discord
                    </DropdownMenuItem> */}
                    <DropdownMenuItem onClick={() =>
                      window.open('https://x.com/capsulethis', '_blank')
                    }>
                      <TwitterLogoIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      Follow us on X
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={(e) => {
                      e.preventDefault()
                      setIsSubscriptionModalOpen(true)
                    }}>
                      <Crown className="mr-2 h-4 w-4 text-muted-foreground" />
                      Manage Subscription
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => {
                      e.preventDefault()
                      setIsUserSettingsModalOpen(true)
                    }}>
                      <User className="mr-2 h-4 w-4 text-muted-foreground" />
                      User Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        setIsProjectSettingsModalOpen(true)
                      }}
                      disabled={!projectId || !session?.user?.id}
                    >
                      <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                      App Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={(e) => {
                      e.preventDefault()
                      setIsDevMode(!isDevMode)
                    }}>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center">
                          <Code className="mr-2 h-4 w-4 text-muted-foreground" />
                          Dev Mode
                        </div>
                        <Switch checked={isDevMode} />
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}>
                      {theme === 'dark' ? (
                        <Sun className="mr-2 h-4 w-4 text-muted-foreground" />
                      ) : theme === 'light' ? (
                        <Moon className="mr-2 h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Monitor className="mr-2 h-4 w-4 text-muted-foreground" />
                      )}
                      Theme: {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4 text-muted-foreground" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                showLogin && isAlphaEnabled && (
                  <Button variant="default" onClick={() => signInWithGoogle()}>
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Sign in with Google
                  </Button>
                )
              )}
            </div>
          </div>
        </header>

        <SubscriptionModal
          open={isSubscriptionModalOpen}
          onOpenChange={setIsSubscriptionModalOpen}
        />
        <UserSettingsModal
          open={isUserSettingsModalOpen}
          onOpenChange={setIsUserSettingsModalOpen}
          userEmail={session?.user?.email || ''}
        />
        <ProjectSettingsModal
          open={isProjectSettingsModalOpen}
          onOpenChange={setIsProjectSettingsModalOpen}
          projectId={projectId}
          userID={session?.user?.id}
          initialIsPublic={currentProject?.isPublic ?? false}
          forkCount={currentProject?.forkCount || '0'}
          onVisibilityChange={(isPublic) => {
            if (currentProject) {
              setCurrentProject({ ...currentProject, isPublic })
            }
          }}
        />
      </>
    )
  }

  // Home page layout - simpler navbar style but with same dropdown options
  return (
    <>
      <nav className="w-full flex bg-background py-4 px-4 md:px-8 ">
        <div className="flex flex-1 items-center">
          <img
            src={mounted && resolvedTheme === 'dark' ? '/logo_iso_dark.svg' : '/logo_iso.svg'}
            alt="Logo"
            className="block sm:hidden w-[32px] h-[32px]"
          />
          <img
            src={mounted && resolvedTheme === 'dark' ? '/react-native-vibe-code-long-logo-dark.svg' : '/react-native-vibe-code-long-logo.svg'}
            alt="Logo"
            className="hidden sm:block min-w-[500px] h-[39px] sm:w-[240px] sm:h-[58px]"
          />
        </div>
        <div className="flex items-center gap-1 md:gap-4">
          {/* Docs Button */}
          <Button variant="ghost" size="sm" asChild>
            <Link href="https://docs.reactnativevibecode.com" className="flex items-center gap-2">
              <span className="text-sm">Docs</span>
            </Link>
          </Button>

          {/* GitHub Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open('https://github.com/react-native-vibe-code/react-native-vibe-code-sdk', '_blank')}
            className="flex items-center gap-2"
          >
            <GitHubLogoIcon className="h-5 w-5" />
            <span className="hidden md:inline text-sm">GitHub</span>
          </Button>

          {session && (
            <Sheet onOpenChange={(open) => open && handleProjectsSheetOpen()}>
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Folder className="h-4 w-4 md:h-5 md:w-5" />
                      </Button>
                    </SheetTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Projects</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <SheetContent side="right" className="w-full sm:min-w-[530px] sm:w-[540px] flex flex-col overflow-hidden">
                <SheetHeader className="flex-shrink-0">
                  <SheetTitle className="flex items-center justify-between">
                    <span>Recent Projects</span>
                    <Link href="/">
                      <Button variant="ghost" size="sm" className="h-8 px-3">
                        <Plus className="h-4 w-4 mr-1" />
                        New Project
                      </Button>
                    </Link>
                  </SheetTitle>
                  <SheetDescription>
                    Browse and manage your recent projects
                  </SheetDescription>
                </SheetHeader>
                <div className="relative mt-4 flex-shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex-1 overflow-y-auto mt-4">
                  <div className="space-y-2 pb-4">
                    {isLoadingProjects ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Loading projects...
                      </div>
                    ) : projects.length > 0 ? (
                      projects.map((project) => (
                        <Link
                          key={project.id}
                          href={`/p/${project.id}`}
                          className="block p-4 rounded-lg border hover:bg-accent transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold truncate">
                                {project.title}
                              </h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                <span className="capitalize">
                                  {project.template?.replace(/-/g, ' ')}
                                </span>
                                {' • '}
                                <span className="capitalize">{project.status}</span>
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground ml-4 shrink-0">
                              {project.updatedAt
                                ? formatDate(project.updatedAt)
                                : ''}
                            </span>
                          </div>
                        </Link>
                      ))
                    ) : searchQuery ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No projects found matching &quot;{searchQuery}&quot;
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No projects yet. Create your first project to get started!
                      </div>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}

          {session ? (
            <DropdownMenu>
              {/* <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild> */}
              <DropdownMenuTrigger asChild>
                <Avatar className="w-8 h-8">
                  <AvatarImage
                    src={
                      session.user.image ||
                      'https://avatar.vercel.sh/' + session.user.email
                    }
                    alt={session.user.email}
                  />
                </Avatar>
              </DropdownMenuTrigger>
              {/* </TooltipTrigger>
                    <TooltipContent>My Account</TooltipContent>
                  </Tooltip>
                </TooltipProvider> */}
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="text-sm">My Account</span>
                  <span className="text-xs text-muted-foreground">
                    {session.user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* <DropdownMenuItem onClick={() => handleSocialClick('discord')}>
                    <DiscordLogoIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    Join us on Discord
                  </DropdownMenuItem> */}
                    <DropdownMenuItem onClick={() =>
                      window.open('https://x.com/capsulethis', '_blank')
                    }>
                  <TwitterLogoIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  Follow us on X
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(e) => {
                  e.preventDefault()
                  setIsSubscriptionModalOpen(true)
                }}>
                  <Crown className="mr-2 h-4 w-4 text-muted-foreground" />
                  Manage Subscription
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={(e) => {
                  e.preventDefault()
                  setIsUserSettingsModalOpen(true)
                }}>
                  <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                  User Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(e) => {
                  e.preventDefault()
                  setIsDevMode(!isDevMode)
                }}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center">
                      <Code className="mr-2 h-4 w-4 text-muted-foreground" />
                      Dev Mode
                    </div>
                    <Switch checked={isDevMode} />
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="sm:hidden" />
                <DropdownMenuItem className="sm:hidden" onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}>
                  {theme === 'dark' ? (
                    <Sun className="mr-2 h-4 w-4 text-muted-foreground" />
                  ) : theme === 'light' ? (
                    <Moon className="mr-2 h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Monitor className="mr-2 h-4 w-4 text-muted-foreground" />
                  )}
                  Theme: {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4 text-muted-foreground" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            showLogin && (
              <Button variant="default" onClick={() => signInWithGoogle()}>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google
              </Button>
            )
          )}
        </div>
      </nav>

      <SubscriptionModal
        open={isSubscriptionModalOpen}
        onOpenChange={setIsSubscriptionModalOpen}
      />
      <UserSettingsModal
        open={isUserSettingsModalOpen}
        onOpenChange={setIsUserSettingsModalOpen}
        userEmail={session?.user?.email || ''}
      />
    </>
  )
}
