'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  KeyRound,
  Cloud,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Package,
  Database,
  Globe,
  Smartphone,
} from 'lucide-react'

interface AuthSidebarPanelProps {
  projectId?: string
  cloudEnabled: boolean
  onNavigateToCloud: () => void
  onSetupAuth: () => void
  onClose: () => void
}

const SETUP_STEPS = [
  { icon: Package, text: '@convex-dev/auth package installation' },
  { icon: ShieldCheck, text: 'Password provider configuration' },
  { icon: Database, text: 'Auth tables in your database schema' },
  { icon: Globe, text: 'HTTP routes for authentication' },
  { icon: Smartphone, text: 'ConvexAuthProvider in your app layout' },
]

export function AuthSidebarPanel({
  projectId,
  cloudEnabled,
  onNavigateToCloud,
  onSetupAuth,
  onClose,
}: AuthSidebarPanelProps) {
  const [isSettingUp, setIsSettingUp] = useState(false)

  const handleSetupAuth = () => {
    setIsSettingUp(true)
    onSetupAuth()
    setTimeout(() => setIsSettingUp(false), 3000)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between h-[50px] border-b pr-12 pl-4">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Authentication
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center overflow-hidden">
        <div className="w-full max-w-[800px] flex flex-col h-full p-4">
          <p className="text-sm text-muted-foreground mb-4">
            Add user authentication to your app
          </p>

          {!cloudEnabled ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <Cloud className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm text-amber-800 dark:text-amber-200">
                    Cloud Required
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Authentication via Convex requires Cloud to be enabled for your project.
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Enable cloud to add Convex Auth to your app. Convex provides secure,
                production-ready authentication with built-in support for email and password.
              </p>

              <Button className="w-full" onClick={onNavigateToCloud}>
                <Cloud className="h-4 w-4 mr-2" />
                Enable Cloud First
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set up email and password authentication for your Expo app using Convex Auth.
              </p>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  What will be set up
                </p>
                <div className="space-y-2">
                  {SETUP_STEPS.map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  The AI will configure Convex Auth with email/password authentication
                  and create sign-in and sign-up screens for your app.
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handleSetupAuth}
                disabled={isSettingUp || !projectId}
              >
                {isSettingUp ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4 mr-2" />
                    Setup Authentication
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
