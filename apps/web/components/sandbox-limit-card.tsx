'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Clock, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SubscriptionModal } from './subscription-modal'

interface SandboxLimitCardProps {
  sessionsUsed: number
  sessionLimit: number
  className?: string
}

export function SandboxLimitCard({ sessionsUsed, sessionLimit, className }: SandboxLimitCardProps) {
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)

  return (
    <>
      <Card className={cn('border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 mx-auto', className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <AlertTitle className="text-amber-800 dark:text-amber-200 text-base font-semibold">
                Free Sandbox Hours Ended
              </AlertTitle>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 max-w-full">
          <Alert className="border-amber-400/50 bg-amber-100/50 dark:bg-amber-900/30">
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              You've used all {Math.round((sessionLimit * 30) / 60)}h ({sessionsUsed}/{sessionLimit} sessions) of free sandbox time included with BYOK. Upgrade to Pro for unlimited sandbox uptime.
            </AlertDescription>
          </Alert>

          <div className="text-center">
            <Button
              onClick={() => setIsSubscriptionModalOpen(true)}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-2.5"
              size="lg"
            >
              <Crown className="h-4 w-4 mr-2" />
              Upgrade to Pro
            </Button>
          </div>
        </CardContent>
      </Card>

      <SubscriptionModal
        open={isSubscriptionModalOpen}
        onOpenChange={setIsSubscriptionModalOpen}
      />
    </>
  )
}
