'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Plus,
  Eye,
  EyeOff,
  MoreHorizontal,
  Copy,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { EnvVarsModal, type EnvVar } from './env-vars-modal'
import { toast } from 'sonner'

interface EnvVarsPanelProps {
  projectId: string
  sandboxId?: string | null
}

export function EnvVarsPanel({ projectId, sandboxId }: EnvVarsPanelProps) {
  const [vars, setVars] = useState<EnvVar[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'frontend' | 'backend'>(
    'frontend'
  )
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [editVar, setEditVar] = useState<EnvVar | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EnvVar | null>(null)
  const [restartPending, setRestartPending] = useState<{
    action: () => Promise<void>
  } | null>(null)

  const fetchVars = useCallback(async () => {
    const res = await fetch(`/api/env-vars?projectId=${projectId}`)
    if (res.ok) {
      const data = await res.json()
      setVars(data.vars)
    }
  }, [projectId])

  useEffect(() => {
    fetchVars()
  }, [fetchVars])

  const filteredVars = vars.filter(
    (v) =>
      v.type === activeTab &&
      v.key.toLowerCase().includes(search.toLowerCase())
  )

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const applyToSandbox = async (afterSave: () => Promise<void>) => {
    if (sandboxId) {
      setRestartPending({ action: afterSave })
    } else {
      await afterSave()
    }
  }

  const handleSave = async (data: {
    key: string
    value: string
    type: 'frontend' | 'backend'
  }) => {
    const doSave = async () => {
      if (editVar) {
        const res = await fetch(`/api/env-vars/${editVar.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error('Failed to update')
      } else {
        const res = await fetch('/api/env-vars', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, projectId }),
        })
        if (!res.ok) throw new Error('Failed to create')
      }
      await fetchVars()
      toast.success(editVar ? 'Variable updated' : 'Variable added')
    }

    await applyToSandbox(doSave)
    setEditVar(null)
  }

  const handleDelete = async (envVar: EnvVar) => {
    const doDelete = async () => {
      const res = await fetch(`/api/env-vars/${envVar.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      await fetchVars()
      toast.success('Variable deleted')
    }
    await applyToSandbox(doDelete)
    setDeleteTarget(null)
  }

  const handleRestartConfirm = async () => {
    if (!restartPending) return
    try {
      await restartPending.action()
      // Restart the Expo server
      await fetch('/api/sandbox/restart-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandboxId, projectId }),
      })
      toast.success('Changes applied, server restarting...')
    } catch {
      toast.error('Failed to apply changes')
    } finally {
      setRestartPending(null)
    }
  }

  return (
    <div className="flex flex-col h-full text-white">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-[#2a2a2a]">
        <div className="relative flex-1">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="pl-8 h-8 bg-[#111] border-[#333] text-sm text-white placeholder:text-zinc-600"
          />
        </div>
        {/* Tab toggle */}
        <div className="flex rounded-md border border-[#333] overflow-hidden text-xs">
          <button
            onClick={() => setActiveTab('frontend')}
            className={`px-3 py-1.5 transition-colors ${
              activeTab === 'frontend'
                ? 'bg-[#333] text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Frontend
          </button>
          <button
            onClick={() => setActiveTab('backend')}
            className={`px-3 py-1.5 transition-colors ${
              activeTab === 'backend'
                ? 'bg-[#333] text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Backend
          </button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs border-[#333] text-zinc-300 hover:text-white gap-1"
          onClick={() => {
            setEditVar(null)
            setModalOpen(true)
          }}
        >
          <Plus size={13} /> New variable
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#2a2a2a]">
        {filteredVars.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-zinc-600">
            No {activeTab} variables yet
          </div>
        ) : (
          filteredVars.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-2 px-3 py-2.5 hover:bg-[#1e1e1e] group"
            >
              <span className="flex-1 text-xs font-mono text-zinc-200 truncate">
                {v.key}
              </span>
              <div className="flex items-center gap-1.5 text-zinc-500">
                <button
                  onClick={() => toggleReveal(v.id)}
                  className="hover:text-zinc-300"
                >
                  {revealedIds.has(v.id) ? (
                    <Eye size={13} />
                  ) : (
                    <EyeOff size={13} />
                  )}
                </button>
                <span className="text-xs font-mono tracking-widest max-w-[120px] truncate">
                  {revealedIds.has(v.id)
                    ? v.value
                    : '\u2022'.repeat(Math.min(v.value.length, 20))}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity">
                    <MoreHorizontal size={14} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="bg-[#1a1a1a] border-[#333] text-white text-xs"
                >
                  <DropdownMenuItem
                    onClick={() =>
                      navigator.clipboard
                        .writeText(v.value)
                        .then(() => toast.success('Copied'))
                    }
                    className="gap-2 cursor-pointer"
                  >
                    <Copy size={12} /> Copy value
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setEditVar(v)
                      setModalOpen(true)
                    }}
                    className="gap-2 cursor-pointer"
                  >
                    <Pencil size={12} /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeleteTarget(v)}
                    className="gap-2 cursor-pointer text-red-400 focus:text-red-400"
                  >
                    <Trash2 size={12} /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      <EnvVarsModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditVar(null)
        }}
        onSave={handleSave}
        mode={activeTab}
        editVar={editVar}
      />

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete variable?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              <span className="font-mono text-zinc-200">
                {deleteTarget?.key}
              </span>{' '}
              will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#333] text-zinc-300">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restart confirm */}
      <AlertDialog
        open={!!restartPending}
        onOpenChange={(o) => !o && setRestartPending(null)}
      >
        <AlertDialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Restart required</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              The Expo dev server will restart to apply your environment variable
              changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#333] text-zinc-300">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestartConfirm}
              className="bg-zinc-700 hover:bg-zinc-600"
            >
              OK, restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
