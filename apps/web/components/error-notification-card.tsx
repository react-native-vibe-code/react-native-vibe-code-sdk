'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Send, Eye, X } from 'lucide-react'
import type { ErrorNotification } from '@/hooks/useErrorNotifications'

interface ErrorNotificationCardProps {
  error: ErrorNotification
  onDismiss: () => void
  onSendToFix: (message: string) => void
  onViewDetails: () => void
}

export function ErrorNotificationCard({
  error,
  onDismiss,
  onSendToFix,
  onViewDetails,
}: ErrorNotificationCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [bottomOffset, setBottomOffset] = useState(0)

  useEffect(() => {
    // Find the chat input panel within the same parent container
    const card = cardRef.current
    if (!card) return

    const container = card.parentElement
    if (!container) return

    const inputEl = container.querySelector('[data-chat-input]')
    if (!inputEl) return

    const updateOffset = () => {
      setBottomOffset(inputEl.getBoundingClientRect().height)
    }

    updateOffset()

    const observer = new ResizeObserver(updateOffset)
    observer.observe(inputEl)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={cardRef} className="absolute left-0 right-0 z-10 mx-2 mb-2 bg-destructive/5 border border-destructive/20 rounded-lg p-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 duration-300" style={{ bottom: bottomOffset }}>
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-destructive">Error Found</div>
          <div className="text-xs text-muted-foreground mt-1 line-clamp-2 break-words font-mono">
            {error.message.substring(0, 200)}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => onSendToFix(error.message)}
              className="inline-flex items-center gap-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-7 px-3"
            >
              <Send className="h-3 w-3" />
              Send to Fix
            </button>
            <button
              onClick={onViewDetails}
              className="inline-flex items-center gap-1 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-7 px-3"
            >
              <Eye className="h-3 w-3" />
              Details
            </button>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="rounded-sm opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
