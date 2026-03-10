'use client'

import { Button } from '@/components/ui/button'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Session } from '@/lib/auth'
import { Project } from '@react-native-vibe-code/database'
import {
  Download,
  Rocket,
  Check,
  X,
  ExternalLink,
  GitFork,
  Copy,
  Loader2,
  AlertCircle,
  Pencil,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { customAlphabet } from 'nanoid'
import posthog from 'posthog-js'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 7)

interface ProjectHeaderActionsProps {
  session?: Session | null
  projectId?: string
  projectTitle?: string
  sandboxId?: string
  currentProject?: Project | null
  onProjectUpdate?: (project: Project) => void
  onOpenAppStoreSubmissions?: () => void
}

export function ProjectHeaderActions({
  session,
  projectId,
  projectTitle,
  sandboxId,
  currentProject: externalCurrentProject,
  onProjectUpdate,
  onOpenAppStoreSubmissions,
}: ProjectHeaderActionsProps) {
  const [mounted, setMounted] = useState(false)
  const [deployedUrl, setDeployedUrl] = useState('')
  const [isDeploying, setIsDeploying] = useState(false)
  const [currentProject, setCurrentProject] = useState<Project | null>(externalCurrentProject || null)
  const [isRemixCopied, setIsRemixCopied] = useState(false)
  const [isEditingDomain, setIsEditingDomain] = useState(false)
  const [customDomain, setCustomDomain] = useState('')
  const [isSavingDomain, setIsSavingDomain] = useState(false)
  const [isDomainCopied, setIsDomainCopied] = useState(false)
  const [isCheckingDomain, setIsCheckingDomain] = useState(false)
  const [isDomainAvailable, setIsDomainAvailable] = useState<boolean | null>(null)
  const [domainCheckTimeout, setDomainCheckTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [showDomainReplicating, setShowDomainReplicating] = useState(false)

  // Sync with external currentProject
  useEffect(() => {
    if (externalCurrentProject) {
      setCurrentProject(externalCurrentProject)
      if (externalCurrentProject.deployedUrl) {
        setDeployedUrl(externalCurrentProject.deployedUrl)
      }
    }
  }, [externalCurrentProject])

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true)
  }, [])

  // Fix for Radix UI Dialog/Dropdown conflict
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

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  // Initialize customDomain from project data
  useEffect(() => {
    const initializeDomain = async () => {
      if (currentProject) {
        if (currentProject.customDomainUrl || currentProject.cloudflareProjectName) {
          const domain = currentProject.customDomainUrl || currentProject.cloudflareProjectName
          setCustomDomain(domain || '')
          return
        }

        if (currentProject.title) {
          const sluggedTitle = generateSlug(currentProject.title)
          await checkAndSetAvailableDomain(sluggedTitle)
        }
      } else if (projectTitle) {
        const sluggedTitle = generateSlug(projectTitle)
        await checkAndSetAvailableDomain(sluggedTitle)
      }
    }

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
          const uniqueDomain = `${baseDomain}-${nanoid()}`
          setCustomDomain(uniqueDomain)
        }
      } catch (error) {
        console.error('Error checking domain availability:', error)
        setCustomDomain(baseDomain)
      }
    }

    initializeDomain()
  }, [currentProject, projectTitle, projectId])

  const checkSubdomainAvailability = async (subdomain: string) => {
    if (!subdomain.trim()) {
      setIsDomainAvailable(null)
      return
    }

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

    if (domainCheckTimeout) {
      clearTimeout(domainCheckTimeout)
    }

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

    if (isDomainAvailable === false) {
      toast.error('This subdomain is already taken')
      return
    }

    setIsSavingDomain(true)
    try {
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
        setShowDomainReplicating(true)
        setTimeout(() => setShowDomainReplicating(false), 60000)
        if (currentProject) {
          const updatedProject = { ...currentProject, customDomainUrl: trimmedDomain }
          setCurrentProject(updatedProject)
          onProjectUpdate?.(updatedProject)
        }
        if (currentProject?.cloudflareProjectName || currentProject?.deployedUrl || deployedUrl) {
          setDeployedUrl(`https://${trimmedDomain}.pages.dev`)
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save custom domain')
      }
    } catch (error) {
      console.error('Error saving domain:', error)
      toast.error('Failed to save custom domain')
    } finally {
      setIsSavingDomain(false)
    }
  }

  const handleCopyDomainUrl = async () => {
    const domain = customDomain || currentProject?.cloudflareProjectName || generateSlug(projectTitle || 'my-app')
    const url = `https://${domain}.pages.dev`

    try {
      await navigator.clipboard.writeText(url)
      setIsDomainCopied(true)
      toast.success('Domain URL copied to clipboard')
      setTimeout(() => setIsDomainCopied(false), 2000)
    } catch (error) {
      toast.error('Failed to copy URL')
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

    const isUpdate = !!(currentProject?.cloudflareProjectName || currentProject?.deployedUrl)
    posthog.capture('publish_to_web_clicked', {
      project_id: projectId,
      is_update: isUpdate,
    })
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
        if (result.deploymentUrl) {
          setDeployedUrl(result.deploymentUrl)
          toast.success(result.isUpdate ? 'Project updated successfully!' : 'Project deployed successfully!')

          if (currentProject) {
            const updatedProject = {
              ...currentProject,
              deployedUrl: result.deploymentUrl,
              customDomainUrl: result.customDomainUrl || currentProject.customDomainUrl,
              cloudflareProjectName: result.deploymentName || currentProject.cloudflareProjectName,
            }
            setCurrentProject(updatedProject)
            onProjectUpdate?.(updatedProject)

            if (result.customDomainUrl) {
              setCustomDomain(result.customDomainUrl)
            }
          }

          setTimeout(() => {
            window.open(result.deploymentUrl, '_blank')
          }, 1000)
        } else {
          toast.success('Project deployment completed successfully')
        }
      } else {
        console.error('Deployment failed:', result.error)

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
      setIsDeploying(false)
    }
  }

  const getRemixUrl = () => {
    if (!projectId) return ''
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `${baseUrl}/p/${projectId}/remix`
  }

  const handleCopyRemixUrl = async () => {
    posthog.capture('remix_clicked', { project_id: projectId })
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

  const handleDownload = async () => {
    posthog.capture('download_clicked', { project_id: projectId })
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
  }

  return (
    <div className="flex items-center space-x-2">
      <div className="flex items-center -space-x-1">
        <Button
          variant="ghost"
          className="p-2 px-4"
          onClick={handleDownload}
          disabled={!projectId || !session?.user?.id}
        >
          <Download className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Download</span>
        </Button>

        {/* Publish HoverCard */}
        <HoverCard onOpenChange={(open) => {
          if (!open) setShowDomainReplicating(false)
        }}>
          <HoverCardTrigger asChild>
            <Button
              variant="ghost"
              className="p-2 px-4"
              disabled={!projectId || !sandboxId || !session?.user?.id}
            >
              <Rocket className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Publish</span>
            </Button>
          </HoverCardTrigger>
          <HoverCardContent className="w-96" align="end">
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
                        <span className="pr-3 text-sm text-muted-foreground whitespace-nowrap">.pages.dev</span>
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
                      {customDomain || currentProject?.cloudflareProjectName || generateSlug(projectTitle || 'my-app')}.pages.dev
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
                  : ((currentProject?.cloudflareProjectName || currentProject?.deployedUrl) ? 'Update on Web' : 'Publish to Web')}
              </Button>

              {/* App Stores section */}
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm mb-2">App Stores</h4>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    posthog.capture('app_store_clicked', { project_id: projectId })
                    onOpenAppStoreSubmissions?.()
                  }}
                  disabled={!onOpenAppStoreSubmissions}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4 mr-2"
                  >
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                  App Store
                </Button>
              </div>
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
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button
                variant="ghost"
                className="p-2 px-4"
              >
                <GitFork className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Remix</span>
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80" align="end">
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

    </div>
  )
}
