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
  AlertCircle,
} from 'lucide-react'

interface AuthSidebarPanelProps {
  projectId?: string
  cloudEnabled: boolean
  onNavigateToCloud: () => void
  onSetupAuth: () => Promise<void>
  onClose: () => void
}

const SETUP_STEPS = [
  { icon: Package, text: '@convex-dev/auth package installation' },
  { icon: ShieldCheck, text: 'Password provider configuration' },
  { icon: Database, text: 'Auth tables in your database schema' },
  { icon: Globe, text: 'HTTP routes for authentication' },
  { icon: Smartphone, text: 'ConvexAuthProvider in your app layout' },
]

type SetupStatus = 'idle' | 'loading' | 'success' | 'error'

export function AuthSidebarPanel({
  projectId,
  cloudEnabled,
  onNavigateToCloud,
  onSetupAuth,
  onClose,
}: AuthSidebarPanelProps) {
  const [setupStatus, setSetupStatus] = useState<SetupStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSetupAuth = async () => {
    setSetupStatus('loading')
    setErrorMessage(null)
    try {
      await onSetupAuth()
      setSetupStatus('success')
    } catch (error) {
      setSetupStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred')
    }
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
          ) : setupStatus === 'success' ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm text-green-800 dark:text-green-200">
                    Auth setup complete
                  </div>
                  <div className="text-xs text-green-700 dark:text-green-300 mt-1">
                    Convex Auth files have been written and committed to your project.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-xs text-blue-800 dark:text-blue-200 font-medium mb-1">Next step</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Run <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">npx @convex-dev/auth</code> in your project to generate JWT keys, then set <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">CONVEX_SITE_URL</code> in your Convex dashboard.
                </p>
              </div>

              <Button className="w-full" variant="outline" onClick={onClose}>
                Close
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

              {setupStatus === 'error' && errorMessage && (
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-sm text-red-800 dark:text-red-200">
                      Setup failed
                    </div>
                    <div className="text-xs text-red-700 dark:text-red-300 mt-1">
                      {errorMessage}
                    </div>
                  </div>
                </div>
              )}

              {setupStatus === 'loading' && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Installing packages and writing auth files to your project. This may take a minute...
                  </p>
                </div>
              )}

              {setupStatus === 'idle' && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Auth files will be written directly to your project and committed via git.
                  </p>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleSetupAuth}
                disabled={setupStatus === 'loading' || !projectId}
              >
                {setupStatus === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4 mr-2" />
                    {setupStatus === 'error' ? 'Retry Setup' : 'Setup Authentication'}
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
