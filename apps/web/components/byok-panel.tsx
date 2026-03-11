'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2, X, KeyRound, Loader2 } from 'lucide-react'

const STORAGE_KEY = 'byok_anthropic_key'

interface ByokPanelProps {
  onClose: () => void
}

export function ByokPanel({ onClose }: ByokPanelProps) {
  const [key, setKey] = useState('')
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ sessionsUsed: number; sessionLimit: number; hoursUsed: number; hoursLimit: number } | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) setSavedKey(stored)
  }, [])

  useEffect(() => {
    if (!savedKey) return
    fetch('/api/byok/usage')
      .then(r => r.json())
      .then(data => setUsage(data))
      .catch(() => {})
  }, [savedKey])

  async function handleSave() {
    if (!key.trim()) return
    setValidating(true)
    setError(null)
    try {
      const res = await fetch('/api/byok/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      })
      const data = await res.json()
      if (!data.valid) {
        setError(data.error || 'Invalid API key')
        return
      }
      localStorage.setItem(STORAGE_KEY, key.trim())
      setSavedKey(key.trim())
      setKey('')
    } catch {
      setError('Failed to validate key. Please try again.')
    } finally {
      setValidating(false)
    }
  }

  function handleRemove() {
    localStorage.removeItem(STORAGE_KEY)
    setSavedKey(null)
    setUsage(null)
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center gap-2 pt-2">
        <KeyRound className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Bring Your Own Key</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Add your Anthropic API key to use the service for free without a subscription.
      </p>
      <p className="text-sm text-muted-foreground">
        Your key is stored locally in your browser. We validate it to check it works and then whenever you send a message it is sent with the API key to the sandbox where the code agent will use it directly. Keys are never stored on database.
      </p>

      {savedKey ? (
        <div className="space-y-3">
          <Alert className="border-green-400/50 bg-green-50 dark:bg-green-900/20 justify-center">
            <AlertDescription className="text-green-700 dark:text-green-300 items-center flex flex-row">
            <CheckCircle2 className="h-4 w-4 text-green-600 mr-2" />
              API key is active. Messages are using your key
            </AlertDescription>
          </Alert>

          {usage && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">Free Sandbox Usage</p>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Sessions used</span>
                <span>{usage.sessionsUsed} / {usage.sessionLimit}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((usage.sessionsUsed / usage.sessionLimit) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {usage.hoursUsed}h / {usage.hoursLimit}h used ({usage.sessionLimit - usage.sessionsUsed} sessions remaining)
              </p>
            </div>
          )}

          <Button variant="outline" onClick={handleRemove} className="w-full">
            <X className="h-4 w-4 mr-2" />
            Remove Key
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="byok-key">Anthropic API Key</Label>
            <Input
              id="byok-key"
              type="password"
              placeholder="sk-ant-..."
              value={key}
              onChange={e => { setKey(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && !validating && handleSave()}
              disabled={validating}
            />
          </div>

          {error && (
            <Alert className="border-red-400/50 bg-red-50 dark:bg-red-900/20">
              <AlertDescription className="text-red-700 dark:text-red-300">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={handleSave} disabled={!key.trim() || validating} className="w-full">
            {validating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Validating...
              </>
            ) : (
              'Save Key'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
