'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Database, Zap, Cloud, HardDrive, CheckCircle2, Loader2, ExternalLink, KeyRound } from 'lucide-react'
import { toast } from 'sonner'

interface CloudSidebarPanelProps {
  projectId?: string
  cloudEnabled: boolean
  deploymentUrl?: string
  onCloudEnabled?: () => void
  onNavigateToAuth?: () => void
  onClose: () => void
}

export function CloudSidebarPanel({
  projectId,
  cloudEnabled,
  deploymentUrl,
  onCloudEnabled,
  onNavigateToAuth,
  onClose,
}: CloudSidebarPanelProps) {
  const [isEnabling, setIsEnabling] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const handleEnableCloud = async () => {
    if (!projectId) {
      toast.error('Project ID is required')
      return
    }

    setShowConfirmDialog(false)
    setIsEnabling(true)

    try {
      const response = await fetch('/api/cloud/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to enable cloud')
      }

      toast.success('Cloud enabled successfully! Your database is now ready.')
      onCloudEnabled?.()
    } catch (error) {
      console.error('Failed to enable cloud:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to enable cloud')
    } finally {
      setIsEnabling(false)
    }
  }

  return (
    <>
      <div className="h-full flex flex-col ">
        {/* Header */}
        <div className="flex items-center justify-between h-[50px] border-b pr-12 pl-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Cloud Backend
          </h2>
        </div>

        {/* Centered content container with max-width */}
        <div className="flex-1 flex flex-col items-center overflow-hidden">
          <div className="w-full max-w-[800px] flex flex-col h-full p-4">
            <p className="text-sm text-muted-foreground mb-4">
              Add a real-time database to your app
            </p>

            {cloudEnabled ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-green-800 dark:text-green-200">
                    Cloud is enabled
                  </span>
                </div>

                {deploymentUrl && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Deployment URL</div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-background px-2 py-1 rounded border flex-1 truncate">
                        {deploymentUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => window.open(deploymentUrl.replace('.convex.cloud', '.convex.site'), '_blank')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                <p className="text-sm text-muted-foreground">
                  Your app now has access to a real-time database. The AI will use Convex for all data persistence and backend logic.
                </p>

                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Authentication</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add email/password authentication to your app with Convex Auth.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={onNavigateToAuth}
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-2" />
                    Setup Authentication
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enable cloud to add powerful backend capabilities to your app:
                </p>

                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <Database className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium text-sm">Real-time Database</div>
                      <div className="text-xs text-muted-foreground">
                        Automatic sync across all devices. Data updates instantly everywhere.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium text-sm">Backend Functions</div>
                      <div className="text-xs text-muted-foreground">
                        Queries, mutations, and actions. The AI can create server-side logic.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <HardDrive className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium text-sm">File Storage</div>
                      <div className="text-xs text-muted-foreground">
                        Store and serve files directly from your backend.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Once enabled, the AI will automatically use the database for any features that need data persistence.
                  </p>
                </div>

                <Button
                  className="w-full"
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={isEnabling || !projectId}
                >
                  {isEnabling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enabling Cloud...
                    </>
                  ) : (
                    <>
                      <Cloud className="h-4 w-4 mr-2" />
                      Enable Cloud
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable Cloud Backend?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This will set up a real-time database for your project. Once enabled:</p>
              <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                <li>A Convex backend will be provisioned</li>
                <li>Database files will be added to your project</li>
                <li>The AI will be able to create backend logic</li>
                <li>Data will sync in real-time across devices</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEnableCloud}>
              Enable Cloud
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
