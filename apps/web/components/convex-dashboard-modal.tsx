'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'

interface ConvexDashboardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId?: string
}

export function ConvexDashboardModal({
  open,
  onOpenChange,
  projectId,
}: ConvexDashboardModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)
  const [credentials, setCredentials] = useState<{
    deploymentUrl: string
    deploymentName: string
    adminKey: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch credentials when modal opens
  useEffect(() => {
    if (!open || !projectId) return

    setLoading(true)
    setError(null)
    setCredentials(null)

    fetch(`/api/convex/dashboard-credentials?projectId=${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load dashboard credentials')
        return res.json()
      })
      .then((data) => {
        setCredentials(data)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [open, projectId])

  // Send credentials to iframe via postMessage
  useEffect(() => {
    if (!credentials) return

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'dashboard-credentials-request') return

      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'dashboard-credentials',
          adminKey: credentials.adminKey,
          deploymentUrl: credentials.deploymentUrl,
          deploymentName: credentials.deploymentName,
        },
        '*',
      )
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [credentials])

  const handleIframeLoad = () => {
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle>Convex Dashboard</DialogTitle>
        </DialogHeader>
        <div className="flex-1 relative min-h-0">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          {credentials && (
            <iframe
              ref={iframeRef}
              src="https://dashboard-embedded.convex.dev/data"
              allow="clipboard-write"
              onLoad={handleIframeLoad}
              className="w-full h-full border-0"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
