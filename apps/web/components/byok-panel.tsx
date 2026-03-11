'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2, X, KeyRound } from 'lucide-react'

const STORAGE_KEY = 'byok_anthropic_key'

interface ByokPanelProps {
  onClose: () => void
}

export function ByokPanel({ onClose }: ByokPanelProps) {
  const [key, setKey] = useState('')
  const [savedKey, setSavedKey] = useState<string | null>(null)
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

  function handleSave() {
    if (!key.trim()) return
    localStorage.setItem(STORAGE_KEY, key.trim())
    setSavedKey(key.trim())
    setKey('')
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
          <Alert className="border-green-400/50 bg-green-50 dark:bg-green-900/20">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              API key is active. Messages are using your key.
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
              onChange={e => setKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>

          <Button onClick={handleSave} disabled={!key.trim()} className="w-full">
            Save to Local Storage
          </Button>
        </div>
      )}
    </div>
  )
}
