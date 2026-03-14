'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Globe, Rocket, Loader2, X } from 'lucide-react'
import { Session } from '@/lib/auth'
import { Project } from '@react-native-vibe-code/database'
import { useState } from 'react'
import { toast } from 'sonner'
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 7)

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) + '-' + nanoid()
}

interface PublishOptionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId?: string
  projectTitle?: string
  sandboxId?: string
  session?: Session | null
  currentProject?: Project | null
  onProjectUpdate?: (project: Project) => void
  onOpenAppStoreSubmissions: () => void
}

export function PublishOptionsModal({
  open,
  onOpenChange,
  projectId,
  projectTitle,
  sandboxId,
  session,
  currentProject,
  onProjectUpdate,
  onOpenAppStoreSubmissions,
}: PublishOptionsModalProps) {
  const [isDeploying, setIsDeploying] = useState(false)

  const isUpdate = !!(currentProject?.cloudflareProjectName || currentProject?.deployedUrl)

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

    setIsDeploying(true)
    try {
      toast.info(isUpdate ? 'Starting update...' : 'Starting deployment...')

      const customDomain = currentProject?.customDomainUrl || currentProject?.cloudflareProjectName || generateSlug(projectTitle || 'my-app')

      const response = await fetch(`/api/deploy/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandboxId,
          platform: 'web',
          action: 'deploy',
          profile: 'preview',
          customDomain,
        }),
      })

      const result = await response.json()

      if (result.success) {
        if (result.deploymentUrl) {
          toast.success(result.isUpdate ? 'Project updated successfully!' : 'Project deployed successfully!')

          if (currentProject) {
            const updatedProject = {
              ...currentProject,
              deployedUrl: result.deploymentUrl,
              customDomainUrl: result.customDomainUrl || currentProject.customDomainUrl,
              cloudflareProjectName: result.deploymentName || currentProject.cloudflareProjectName,
            }
            onProjectUpdate?.(updatedProject)
          }

          onOpenChange(false)
          setTimeout(() => {
            window.open(result.deploymentUrl, '_blank')
          }, 1000)
        } else {
          toast.success('Project deployment completed successfully')
          onOpenChange(false)
        }
      } else {
        console.error('Deployment failed:', result.error)
        toast.error(`${isUpdate ? 'Update' : 'Publishing'} error: ${result.error || 'Deployment failed'}`)
      }
    } catch (error) {
      console.error('Deployment error:', error)
      toast.error(`${isUpdate ? 'Update' : 'Publishing'} error: Failed to deploy project`)
    } finally {
      setIsDeploying(false)
    }
  }

  const handleAppStore = () => {
    onOpenChange(false)
    onOpenAppStoreSubmissions()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Rocket className="h-5 w-5 text-foreground" />
            </div>
            <DialogTitle>Publish</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Button
            className="w-full justify-start gap-3 h-auto py-4"
            onClick={handleDeploy}
            disabled={!projectId || !sandboxId || !session?.user?.id || isDeploying}
          >
            {isDeploying ? (
              <Loader2 className="h-5 w-5 animate-spin shrink-0" />
            ) : (
              <Globe className="h-5 w-5 shrink-0" />
            )}
            <div className="text-left">
              <div className="font-medium">
                {isDeploying
                  ? (isUpdate ? 'Updating...' : 'Publishing...')
                  : (isUpdate ? 'Update on Web' : 'Publish to Web')}
              </div>
              <div className="text-xs font-normal opacity-70">
                Deploy your app to the web
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-4"
            onClick={handleAppStore}
            disabled={!projectId || !sandboxId || !session?.user?.id}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5 shrink-0"
            >
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            <div className="text-left">
              <div className="font-medium">App Store</div>
              <div className="text-xs font-normal text-muted-foreground">
                Submit to the Apple App Store
              </div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
