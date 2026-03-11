'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'

export interface EnvVar {
  id: string
  key: string
  value: string
  type: 'frontend' | 'backend'
}

interface EnvVarsModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: {
    key: string
    value: string
    type: 'frontend' | 'backend'
  }) => Promise<void>
  mode: 'frontend' | 'backend'
  editVar?: EnvVar | null
}

export function EnvVarsModal({
  open,
  onClose,
  onSave,
  mode,
  editVar,
}: EnvVarsModalProps) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editVar) {
      const displayKey =
        mode === 'frontend' && editVar.key.startsWith('EXPO_PUBLIC_')
          ? editVar.key.replace('EXPO_PUBLIC_', '')
          : editVar.key
      setKey(displayKey)
      setValue(editVar.value)
    } else {
      setKey('')
      setValue('')
    }
    setShowValue(false)
  }, [editVar, open, mode])

  const fullKey = mode === 'frontend' ? `EXPO_PUBLIC_${key}` : key

  const handleSave = async () => {
    if (!key.trim() || value === undefined) return
    setSaving(true)
    try {
      await onSave({ key: fullKey, value, type: mode })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md bg-[#1a1a1a] border-[#2a2a2a] text-white">
        <DialogHeader>
          <DialogTitle>
            {editVar ? 'Edit' : 'Add'} environment variable
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="env-key" className="text-sm text-zinc-300">
              Key
            </Label>
            <Input
              id="env-key"
              value={key}
              onChange={(e) =>
                setKey(e.target.value.toUpperCase().replace(/\s/g, '_'))
              }
              placeholder="MY_KEY"
              className="bg-[#111] border-[#333] text-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="env-value" className="text-sm text-zinc-300">
              Value
            </Label>
            <div className="relative">
              <Input
                id="env-value"
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Value"
                className="bg-[#111] border-[#333] text-white pr-10"
              />
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              >
                {showValue ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {mode === 'frontend' && key && (
            <p className="text-xs text-zinc-500 text-right">
              Will be saved as:{' '}
              <span className="text-zinc-300">{fullKey}</span>
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-none border-[#333] text-zinc-300 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!key.trim() || saving}
            className="flex-1 bg-zinc-700 hover:bg-zinc-600"
          >
            {saving ? 'Saving...' : editVar ? 'Save' : 'Add'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
