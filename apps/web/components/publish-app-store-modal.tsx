'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useLocalStorage } from '@/hooks/use-local-storage'
import {
  TwoFactorMethodModal,
  TwoFactorCodeModal,
} from '@/components/two-factor-auth-modal'
import { addSubmission } from '@/components/app-store-submissions-modal'
import {
  Apple,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Rocket,
  CheckCircle2,
} from 'lucide-react'

interface PublishAppStoreModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName?: string
  sandboxId: string
}

type WizardStep = 1 | 2 | 3 | 4

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'App Info',
  2: 'Apple',
  3: 'Expo',
  4: 'Submit',
}

export function PublishAppStoreModal({
  open,
  onOpenChange,
  projectId,
  projectName,
  sandboxId,
}: PublishAppStoreModalProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)

  // Step 1 state
  const [appName, setAppName] = useState(projectName ?? '')
  const [bundleId, setBundleId] = useState('')

  // Step 2 state (persisted)
  const [storedAppleEmail, setStoredAppleEmail] = useLocalStorage<string>(
    'apple_developer_email',
    ''
  )
  const [storedApplePassword, setStoredApplePassword] = useLocalStorage<string>(
    'apple_developer_password',
    ''
  )
  const [appleEmail, setAppleEmail] = useState('')
  const [applePassword, setApplePassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [credentialsError, setCredentialsError] = useState<string | null>(null)

  // Step 3 state (persisted)
  const [storedExpoToken, setStoredExpoToken] = useLocalStorage<string>(
    'expo_account_token',
    ''
  )
  const [expoToken, setExpoToken] = useState('')

  // Fetch bundle ID from sandbox app.json
  useEffect(() => {
    if (open && sandboxId) {
      fetch(`/api/eas/app-config?sandboxId=${encodeURIComponent(sandboxId)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.bundleIdentifier) {
            setBundleId(data.bundleIdentifier)
          }
          if (data.name && !projectName) {
            setAppName(data.name)
          }
        })
        .catch(() => {
          // Ignore errors, user can fill manually
        })
    }
  }, [open, sandboxId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill from localStorage and projectName on mount / open
  useEffect(() => {
    if (open) {
      setAppName(projectName ?? '')
      setAppleEmail(storedAppleEmail)
      setApplePassword(storedApplePassword)
      setExpoToken(storedExpoToken)
      setCurrentStep(1)
      setShowPassword(false)
      setCredentialsError(null)
      setLogs([])
      setIsSubmitting(false)
      setSubmitDone(false)
      setSubmitSuccess(false)
      setSubmissionUrl(null)
      setShow2FAMethod(false)
      setShow2FACode(false)
    }
  }, [open, projectName, storedAppleEmail, storedApplePassword, storedExpoToken])

  // Navigation helpers
  const goToStep = useCallback(
    (step: WizardStep) => {
      setCurrentStep(step)
    },
    []
  )

  const handleStep1Continue = () => {
    goToStep(2)
  }

  const handleStep2Continue = () => {
    setStoredAppleEmail(appleEmail)
    setStoredApplePassword(applePassword)
    goToStep(3)
  }

  const handleStep3Submit = () => {
    setStoredExpoToken(expoToken)
    goToStep(4)
  }

  const canGoBackTo = (step: WizardStep): boolean => {
    return step < currentStep
  }

  const handleTabClick = (step: WizardStep) => {
    if (canGoBackTo(step)) {
      goToStep(step)
    }
  }

  // Step 1 validation
  const isStep1Valid = appName.trim().length > 0 && bundleId.trim().length > 0

  // Step 2 validation
  const isStep2Valid =
    appleEmail.trim().length > 0 && applePassword.trim().length > 0

  // Step 4 state
  const [logs, setLogs] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitDone, setSubmitDone] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submissionUrl, setSubmissionUrl] = useState<string | null>(null)
  const [show2FAMethod, setShow2FAMethod] = useState(false)
  const [show2FACode, setShow2FACode] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const sendInput = useCallback(
    async (input: string) => {
      try {
        await fetch('/api/eas/build-and-submit/input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sandboxId, input }),
        })
      } catch (err) {
        console.error('Failed to send input:', err)
      }
    },
    [sandboxId]
  )

  const startSubmission = useCallback(async () => {
    setLogs(['Starting submission...'])
    setIsSubmitting(true)
    setSubmitDone(false)
    setSubmitSuccess(false)
    setSubmissionUrl(null)

    try {
      const response = await fetch('/api/eas/build-and-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandboxId,
          projectId,
          appName,
          bundleId,
          appleId: appleEmail,
          applePassword,
          expoToken,
        }),
      })

      if (!response.ok || !response.body) {
        setLogs((prev) => [...prev, `Error: Failed to start build (${response.status})`])
        setIsSubmitting(false)
        setSubmitDone(true)
        setSubmitSuccess(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)

            if (event.type === 'log') {
              setLogs((prev) => [...prev, event.data])
            } else if (event.type === 'error') {
              setLogs((prev) => [...prev, `ERROR: ${event.data}`])
            } else if (event.type === 'prompt') {
              if (event.prompt === '2fa_method') {
                setShow2FAMethod(true)
              } else if (event.prompt === '2fa_code') {
                setShow2FACode(true)
              } else if (event.prompt === 'credentials_failed') {
                setCredentialsError(
                  'Invalid Apple ID or password. Please check your credentials and try again.'
                )
                setIsSubmitting(false)
                setCurrentStep(2)
                return
              }
            } else if (event.type === 'done') {
              setSubmitDone(true)
              setSubmitSuccess(event.success)
              setSubmissionUrl(event.submissionUrl || null)
              setIsSubmitting(false)

              // Save to submission history
              addSubmission(projectId, {
                id: crypto.randomUUID(),
                appName,
                bundleId,
                status: event.success ? 'submitted' : 'failed',
                createdAt: new Date().toISOString(),
                submissionUrl: event.submissionUrl || undefined,
              })
              return
            }
          } catch {
            // Non-JSON line, treat as raw log
            setLogs((prev) => [...prev, line])
          }
        }
      }
    } catch (err: any) {
      setLogs((prev) => [...prev, `Error: ${err.message || 'Connection failed'}`])
      setIsSubmitting(false)
      setSubmitDone(true)
      setSubmitSuccess(false)
    }
  }, [sandboxId, projectId, appName, bundleId, appleEmail, applePassword, expoToken, setCredentialsError, setCurrentStep])

  // Start submission when entering step 4
  useEffect(() => {
    if (currentStep === 4 && !isSubmitting && !submitDone) {
      startSubmission()
    }
  }, [currentStep]) // eslint-disable-line react-hooks/exhaustive-deps

  // Step 3 validation
  const isStep3Valid = expoToken.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] gap-0">
        <DialogHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-800">
              <Apple className="h-4 w-4 text-white" />
            </div>
            <DialogTitle>Publish to App Store</DialogTitle>
          </div>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1 mb-5">
          {([1, 2, 3, 4] as WizardStep[]).map((step) => {
            const isActive = step === currentStep
            const isCompleted = step < currentStep
            const isClickable = isCompleted

            return (
              <button
                key={step}
                onClick={() => handleTabClick(step)}
                disabled={!isClickable}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : isCompleted
                      ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                      : 'text-muted-foreground/50 cursor-default'
                }`}
              >
                Step {step}: {STEP_LABELS[step]}
              </button>
            )
          })}
        </div>

        {/* Step content */}
        <div className="min-h-[280px]">
          {/* Step 1 - App Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="app-name">App Name</Label>
                <Input
                  id="app-name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="My Awesome App"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bundle-id">Bundle Identifier</Label>
                <Input
                  id="bundle-id"
                  value={bundleId}
                  onChange={(e) => setBundleId(e.target.value)}
                  placeholder="com.example.myapp"
                />
                <p className="text-xs text-muted-foreground">
                  A unique identifier for your app (e.g. com.yourname.appname).
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleStep1Continue}
                  disabled={!isStep1Valid}
                  className="gap-2"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 - Apple Developer */}
          {currentStep === 2 && (
            <div className="space-y-4">
              {credentialsError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{credentialsError}</AlertDescription>
                </Alert>
              )}

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">
                    Apple Developer Membership required
                  </span>{' '}
                  — You need an active Apple Developer account to publish to the
                  App Store. Membership costs $99/year (may vary by country).
                  <div className="flex items-center gap-3 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() =>
                        window.open(
                          'https://developer.apple.com/programs/',
                          '_blank'
                        )
                      }
                    >
                      Sign up
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                    <a
                      href="https://developer.apple.com/programs/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Details
                    </a>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="apple-email">Apple Developer Email</Label>
                <Input
                  id="apple-email"
                  type="email"
                  value={appleEmail}
                  onChange={(e) => setAppleEmail(e.target.value)}
                  placeholder="eg. appleid@gmail.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apple-password">
                  Apple Developer Password
                </Label>
                <div className="relative">
                  <Input
                    id="apple-password"
                    type={showPassword ? 'text' : 'password'}
                    value={applePassword}
                    onChange={(e) => setApplePassword(e.target.value)}
                    placeholder="Account Password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                We don&apos;t store your Apple Developer credentials on our
                servers, they are saved locally.
              </p>

              <div className="flex justify-between pt-2">
                <Button
                  variant="outline"
                  onClick={() => goToStep(1)}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleStep2Continue}
                  disabled={!isStep2Valid}
                  className="gap-2"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 - Expo */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Partners with Expo for app submission. You need a free Expo
                  account to submit to App Store. You might need a paid Expo
                  plan for unlimited submissions in the future.
                  <div className="flex items-center gap-3 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() =>
                        window.open('https://expo.dev/signup', '_blank')
                      }
                    >
                      Sign up
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                    <a
                      href="https://expo.dev/pricing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Pricing
                    </a>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="expo-token">Expo Account Token</Label>
                <Input
                  id="expo-token"
                  type="text"
                  value={expoToken}
                  onChange={(e) => setExpoToken(e.target.value)}
                  placeholder="expo_token_xxxxxxxxxxxxxxx"
                />
                <p className="text-xs text-muted-foreground">
                  Go to{' '}
                  <a
                    href="https://expo.dev/accounts/[account]/settings/access-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline hover:text-foreground"
                  >
                    Expo Settings
                  </a>{' '}
                  to create an access token.
                </p>
              </div>

              <div className="flex justify-between pt-2">
                <Button
                  variant="outline"
                  onClick={() => goToStep(2)}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleStep3Submit}
                  disabled={!isStep3Valid}
                  className="gap-2"
                >
                  <Rocket className="h-4 w-4" />
                  Start Submission
                </Button>
              </div>
            </div>
          )}

          {/* Step 4 - Submit */}
          {currentStep === 4 && (
            <div className="space-y-3">
              {submitDone && submitSuccess ? (
                /* Success state */
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-green-500">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">Your App Is Now Building</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Once the build completes successfully, it will be automatically
                      submitted to the App Store for review.
                    </p>
                  </div>
                  {submissionUrl && (
                    <Button
                      className="w-full max-w-xs gap-2"
                      onClick={() => window.open(submissionUrl!, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open submission status
                    </Button>
                  )}
                  <button
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => onOpenChange(false)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                /* Terminal output */
                <>
                  <p className="text-sm text-muted-foreground">
                    Your app is currently building. It will be submitted to the App
                    Store automatically once the build is complete. This may take a
                    while, please don&apos;t close the tab.
                  </p>
                  <div className="bg-neutral-950 rounded-lg border border-neutral-800 p-4 h-[240px] overflow-y-auto font-mono text-xs">
                    {logs.map((line, i) => (
                      <div key={i} className="text-green-400 whitespace-pre-wrap break-all">
                        {line}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                  {submitDone && !submitSuccess && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-destructive">
                        Submission failed. Check the logs above for details.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSubmitDone(false)
                          setLogs([])
                          startSubmission()
                        }}
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* 2FA Modals */}
              <TwoFactorMethodModal
                open={show2FAMethod}
                onSelect={(method) => {
                  setShow2FAMethod(false)
                  sendInput(method)
                }}
              />
              <TwoFactorCodeModal
                open={show2FACode}
                onSubmit={(code) => {
                  setShow2FACode(false)
                  sendInput(code)
                }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
